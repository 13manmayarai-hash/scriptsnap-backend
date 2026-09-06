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
    // were silently failing every time (same bug as generate-script) --
    // this forwards the caller's own JWT so auth.uid() resolves.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const body = await req.json()
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      return new Response(JSON.stringify({ error: 'rating must be an integer between 1 and 5' }), { status: 400 })
    }

    const { data: script } = await supabase.from('scripts').select('*').eq('id', body.script_id).eq('user_id', user.id).single()
    if (!script) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

    await supabase.from('scripts').update({ rating: body.rating }).eq('id', body.script_id)
    await supabase.from('script_ratings').insert({ script_id: body.script_id, user_id: user.id, rating: body.rating })

    if (script.keywords) await userClient.rpc('update_keyword_stats', { p_user_id: user.id, p_keywords: script.keywords, p_rating: body.rating })
    await userClient.rpc('update_tone_stats', { p_user_id: user.id, p_tone: script.tone, p_rating: body.rating })

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error' }), { status: 500 })
  }
})
