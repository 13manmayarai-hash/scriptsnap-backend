import { createClient } from '@supabase/supabase-js'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const body = await req.json()
    const { data: script } = await supabase.from('scripts').select('*').eq('id', body.script_id).eq('user_id', user.id).single()
    if (!script) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

    await supabase.from('scripts').update({ rating: body.rating }).eq('id', body.script_id)
    await supabase.from('script_ratings').insert({ script_id: body.script_id, user_id: user.id, rating: body.rating })

    if (script.keywords) await supabase.rpc('update_keyword_stats', { p_user_id: user.id, p_keywords: script.keywords, p_rating: body.rating })
    await supabase.rpc('update_tone_stats', { p_user_id: user.id, p_tone: script.tone, p_rating: body.rating })

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error' }), { status: 500 })
  }
})
