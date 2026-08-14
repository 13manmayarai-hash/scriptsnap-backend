import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 401 })

    const body = await req.json()
    const { data: userRow } = await supabase.from('users').select('subscription_tier, scripts_generated_month').eq('id', user.id).single()
    
    if (userRow?.subscription_tier === 'free' && userRow?.scripts_generated_month >= 10) {
      return new Response(JSON.stringify({ error: 'Monthly limit reached' }), { status: 429 })
    }

    const { data: topKeywords } = await supabase.rpc('get_top_keywords', { p_user_id: user.id, limit_count: 5 })
    const { data: toneStats } = await supabase.rpc('get_tone_stats', { p_user_id: user.id })
    
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
    
    const { data: savedScript } = await supabase.from('scripts').insert({
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

    await supabase.from('users').update({ scripts_generated_month: (userRow?.scripts_generated_month || 0) + 1 }).eq('id', user.id)

    return new Response(JSON.stringify({ success: true, script: savedScript }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error' }), { status: 500 })
  }
})
