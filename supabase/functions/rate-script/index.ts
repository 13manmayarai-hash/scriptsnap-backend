import { createClient } from '@supabase/supabase-js'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    // update_keyword_stats/update_tone_stats both require auth.uid() =
    // p_user_id (see harden_stats_functions.sql). The service-role client
    // above has no user session, so auth.uid() is NULL and those calls
    // were silently failing every time -- this forwards the caller's own
    // JWT so auth.uid() resolves.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const body = await req.json()

    // This function previously accepted a 1-5 "rating" and did a plain
    // insert -- but public.script_ratings has
    // CHECK (rating IN (-1, 1)) and UNIQUE (script_id, user_id)
    // (add_script_ratings_constraints_and_policies.sql). Every value
    // except exactly 1 would violate the CHECK, and even a valid re-rate
    // of the same script would violate the UNIQUE constraint since a
    // plain insert() isn't an upsert. The web app's real rating UI
    // (ScriptRating.tsx) has always used thumbs up/down (+1/-1) with
    // upsert semantics -- this now matches that exactly instead of a
    // never-actually-working alternate model.
    if (typeof body.liked !== 'boolean') {
      return new Response(JSON.stringify({ error: 'liked must be a boolean (true = thumbs up, false = thumbs down)' }), { status: 400 })
    }
    const ratingValue: 1 | -1 = body.liked ? 1 : -1
    const notes: string | null = typeof body.notes === 'string' ? body.notes : null

    const { data: script } = await supabase.from('scripts').select('*').eq('id', body.script_id).eq('user_id', user.id).single()
    if (!script) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

    await supabase.from('scripts').update({ rating: ratingValue }).eq('id', body.script_id)

    const { error: upsertError } = await supabase
      .from('script_ratings')
      .upsert(
        { script_id: body.script_id, user_id: user.id, rating: ratingValue, notes },
        { onConflict: 'script_id,user_id' }
      )
    if (upsertError) throw upsertError

    // The stats RPCs expect a 1-5 scale (avg_rating reads like a familiar
    // rating), not the raw +1/-1 stored above -- same thumbs-up-is-5,
    // thumbs-down-is-1 mapping the web app uses, so both paths feed the
    // same learning signal identically.
    const scaledRating = body.liked ? 5 : 1

    if (script.keywords && script.keywords.length > 0) {
      await userClient.rpc('update_keyword_stats', { p_user_id: user.id, p_keywords: script.keywords, p_rating: scaledRating })
    }
    await userClient.rpc('update_tone_stats', { p_user_id: user.id, p_tone: script.tone, p_rating: scaledRating })

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error' }), { status: 500 })
  }
})
