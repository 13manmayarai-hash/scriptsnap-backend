import { createClient } from '@supabase/supabase-js'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    // get_top_keywords/get_tone_stats both require auth.uid() = p_user_id
    // (see harden_stats_functions.sql). The service-role client above has
    // no user session, so auth.uid() is NULL and these were silently
    // returning nothing every time (same bug as generate-script and
    // rate-script) -- this forwards the caller's own JWT instead.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const url = new URL(req.url)
    const { data: scripts, count } = await supabase.from('scripts').select('*', { count: 'exact' }).eq('user_id', user.id).order('created_at', { ascending: false }).range(0, 9)
    const { data: topKeywords } = await userClient.rpc('get_top_keywords', { p_user_id: user.id, limit_count: 5 })
    const { data: toneStats } = await userClient.rpc('get_tone_stats', { p_user_id: user.id })

    return new Response(JSON.stringify({ success: true, scripts, insights: { topKeywords, toneStats }, total: count }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error' }), { status: 500 })
  }
})
