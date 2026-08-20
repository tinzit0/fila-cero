import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
}
function getSecretKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if (legacy) return legacy
  try { const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'); return keys.default||Object.values(keys)[0] } catch { return '' }
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:cors})
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:cors})
  const { reservationId, accessToken } = await req.json().catch(()=>({}))
  if (!reservationId || !accessToken) return new Response(JSON.stringify({error:'missing_reservation'}),{status:400,headers:cors})
  const supabase=createClient(Deno.env.get('SUPABASE_URL')||'',getSecretKey(),{auth:{persistSession:false}})
  const releaseHold=async(res:any)=>{try{await supabase.from('fila_cero_slots').update({status:'active'}).eq('id',res.slot_id).eq('status','reserved');await supabase.from('fila_cero_reservations').delete().eq('id',res.id).eq('status','pending_payment')}catch{}}
  const {data:r,error}=await supabase.from('fila_cero_reservations').select('id,status,payment_status,payment_amount,payment_access_token,payment_expires_at,client_email,slot_id,business_id').eq('id',reservationId).eq('payment_access_token',accessToken).maybeSingle()
  if(error||!r) return new Response(JSON.stringify({error:'reservation_not_found'}),{status:404,headers:cors})
  if(r.status==='confirmed'&&r.payment_status==='paid') return new Response(JSON.stringify({alreadyPaid:true}),{headers:cors})
  if(r.status!=='pending_payment'||r.payment_status!=='pending') return new Response(JSON.stringify({error:'reservation_not_payable'}),{status:409,headers:cors})
  if(r.payment_expires_at&&new Date(r.payment_expires_at).getTime()<Date.now()){await releaseHold(r);return new Response(JSON.stringify({error:'payment_hold_expired'}),{status:410,headers:cors})}
  const [{data:slot},{data:business}]=await Promise.all([
    supabase.from('fila_cero_slots').select('service,slot_date,start_time').eq('id',r.slot_id).single(),
    supabase.from('fila_cero_businesses').select('name').eq('id',r.business_id).single()
  ])
  const mpToken=Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')||''
  if(!mpToken){await releaseHold(r);return new Response(JSON.stringify({error:'mercadopago_not_configured'}),{status:503,headers:cors})}
  const appUrl=(Deno.env.get('FILA_CERO_APP_URL')||'https://fila-cero.concepcion.workers.dev/').replace(/\/?$/,'/')
  const paymentUrl=`${appUrl}pago.html?reservation=${encodeURIComponent(r.id)}&token=${encodeURIComponent(accessToken)}`
  const pref={
    items:[{id:r.id,title:`Abono · ${slot?.service||'Reserva Fila Cero'}`,description:`${business?.name||'Fila Cero'} · ${slot?.slot_date||''} ${String(slot?.start_time||'').slice(0,5)}`,currency_id:'CLP',quantity:1,unit_price:Number(r.payment_amount)}],
    payer:{email:r.client_email},
    external_reference:r.id,
    back_urls:{success:paymentUrl,failure:paymentUrl,pending:paymentUrl},
    notification_url:`${Deno.env.get('SUPABASE_URL')||''}/functions/v1/fila-cero-mercadopago-webhook`,
    auto_return:'approved',
    expires:true,
    expiration_date_from:new Date(Date.now()-30000).toISOString(),
    expiration_date_to:new Date(r.payment_expires_at).toISOString()
  }
  const mp=await fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${mpToken}`,'Content-Type':'application/json'},body:JSON.stringify(pref)})
  const body=await mp.json().catch(()=>({}))
  if(!mp.ok){await releaseHold(r);return new Response(JSON.stringify({error:'mercadopago_preference_failed',detail:body}),{status:502,headers:cors})}
  await supabase.from('fila_cero_reservations').update({payment_preference_id:body.id}).eq('id',r.id)
  await supabase.from('fila_cero_payments').insert({reservation_id:r.id,provider:'mercadopago',preference_id:body.id,amount:r.payment_amount,status:'preference_created'})
  return new Response(JSON.stringify({preferenceId:body.id,checkoutUrl:body.init_point||body.sandbox_init_point}),{headers:cors})
})
