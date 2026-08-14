import { createClient } from '@supabase/supabase-js'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const url = new URL(req.url)
    const { data: scripts, count } = await supabase.from('scripts').select('*', { count: 'exact' }).eq('user_id', user.id).order('created_at', { ascending: false }).range(0, 9)
    const { data: topKeywords } = await supabase.rpc('get_top_keywords', { p_user_id: user.id, limit_count: 5 })
    const { data: toneStats } = await supabase.rpc('get_tone_stats', { p_user_id: user.id })

    return new Response(JSON.stringify({ success: true, scripts, insights: { topKeywords, toneStats }, total: count }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error' }), { status: 500 })
  }
})
