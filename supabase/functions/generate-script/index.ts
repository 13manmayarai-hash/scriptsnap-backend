import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// Service-role client: bypasses RLS, used only for the plain table
// insert/select below where no auth.uid()-gated RPC is involved.
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

// Keep in sync with TIER_SCRIPT_LIMITS in scriptsnap-dashboard/lib/tiers.ts —
// these two repos duplicate this table and previously drifted (10 here vs
// 5 there for 'free'), silently giving MCP-path users double the web-app
// quota. There is currently no single source of truth shared by both repos.
const TIER_SCRIPT_LIMITS: Record<string, number> = { free: 5, basic: 50, pro: 200 }

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 401 })

    // User-scoped client: every RPC this function calls
    // (increment_script_usage, decrement_script_usage, get_top_keywords,
    // get_tone_stats) has `IF auth.uid() IS DISTINCT FROM p_user_id THEN
    // RAISE EXCEPTION` baked in. Calling them with the service-role client
    // above means auth.uid() is NULL — every one of those calls fails
    // (silently, since supabase-js returns {data: null, error} rather than
    // throwing). This client forwards the caller's own JWT so auth.uid()
    // resolves correctly, exactly like the Next.js dashboard's route does
    // via its cookie-based session.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const body = await req.json()
    const { data: userRow } = await supabase.from('users').select('subscription_tier').eq('id', user.id).single()
    const tier = userRow?.subscription_tier ?? 'free'
    const limit = TIER_SCRIPT_LIMITS[tier] ?? TIER_SCRIPT_LIMITS.free

    // Atomic check-and-reserve, before spending any Anthropic cost — the
    // FOR UPDATE row lock inside increment_script_usage serializes
    // concurrent calls for the same user, so two simultaneous requests
    // can no longer both read the same pre-increment count and both slip
    // past the limit (the bug this replaces).
    const { data: usage, error: usageError } = await userClient
      .rpc('increment_script_usage', { p_user_id: user.id, p_limit: limit })
      .single<{ allowed: boolean; new_count: number }>()

    if (usageError || !usage) {
      return new Response(JSON.stringify({ error: 'Failed to check usage limit' }), { status: 500 })
    }
    if (!usage.allowed) {
      return new Response(JSON.stringify({ error: 'Monthly limit reached' }), { status: 429 })
    }

    let quotaReserved = true

    try {
      const { data: topKeywords } = await userClient.rpc('get_top_keywords', { p_user_id: user.id, limit_count: 5 })
      const { data: toneStats } = await userClient.rpc('get_tone_stats', { p_user_id: user.id })

      const learningNote = topKeywords?.length > 0 ? `Top keywords: ${topKeywords.map((k: any) => k.keyword).join(', ')}` : ''

      const prompt = `You write YouTube Shorts scripts (${body.duration}s). No hype, observational tone.
Topic: ${body.topic}
Category: ${body.category}
${body.keywords ? `Keywords: ${body.keywords.join(', ')}` : ''}
${learningNote}

Respond ONLY in JSON: { script, title, description, hashtags (array), pinnedComment, alternativeTitles (array of 10 with style+title) }`

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })

      const parsed = JSON.parse(message.content[0].type === 'text' ? message.content[0].text : '{}')

      const { data: savedScript, error: insertError } = await supabase.from('scripts').insert({
        user_id: user.id,
        topic: body.topic,
        duration: body.duration,
        category: body.category,
        keywords: body.keywords,
        is_series: body.is_series,
        tone: body.tone,
        script: parsed.script,
        title: parsed.title,
        description: parsed.description,
        hashtags: parsed.hashtags,
        pinned_comment: parsed.pinnedComment,
        alternative_titles: parsed.alternativeTitles
      }).select().single()

      if (insertError) throw insertError

      return new Response(JSON.stringify({ success: true, script: savedScript }), { headers: { 'Content-Type': 'application/json' } })
    } catch (innerError) {
      // Reserved a quota slot above but never produced a script — refund it,
      // same compensating pattern the dashboard's route already uses.
      if (quotaReserved) {
        try { await userClient.rpc('decrement_script_usage', { p_user_id: user.id }) } catch {}
      }
      throw innerError
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error' }), { status: 500 })
  }
})
