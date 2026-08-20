Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const key = Deno.env.get('VAPID_PUBLIC_KEY') || ''
  if (!key) return new Response(JSON.stringify({ enabled: false, publicKey: '' }), { status: 200, headers: cors })
  return new Response(JSON.stringify({ enabled: true, publicKey: key }), { status: 200, headers: cors })
})
