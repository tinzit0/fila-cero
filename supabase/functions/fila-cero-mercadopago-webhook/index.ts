import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

function getSecretKey(){const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(legacy)return legacy;try{const k=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');return k.default||Object.values(k)[0]}catch{return''}}
Deno.serve(async(req)=>{
  if(req.method!=='POST')return new Response('ok',{status:200})
  const mpToken=Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')||''
  if(!mpToken)return new Response('not configured',{status:503})
  const url=new URL(req.url)
  const body=await req.json().catch(()=>({}))
  const paymentId=String(url.searchParams.get('data.id')||body?.data?.id||'')
  if(!paymentId)return new Response('ok',{status:200})

  // No confiamos en el payload: consultamos el pago directamente a Mercado Pago con el Access Token del servidor.
  const mp=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${mpToken}`}})
  if(!mp.ok)return new Response('payment lookup failed',{status:502})
  const payment=await mp.json()
  const reservationId=String(payment.external_reference||'')
  if(!reservationId)return new Response('ok',{status:200})

  const supabase=createClient(Deno.env.get('SUPABASE_URL')||'',getSecretKey(),{auth:{persistSession:false}})
  const {data:r}=await supabase.from('fila_cero_reservations').select('id,slot_id,payment_amount,status,payment_status').eq('id',reservationId).maybeSingle()
  if(!r)return new Response('ok',{status:200})

  const amount=Math.round(Number(payment.transaction_amount||0))
  const expected=Math.round(Number(r.payment_amount||0))
  const status=String(payment.status||'')
  await supabase.from('fila_cero_payments').upsert({reservation_id:r.id,provider:'mercadopago',provider_payment_id:paymentId,preference_id:payment.preference_id||null,amount,status,raw_status:{status:payment.status,status_detail:payment.status_detail,live_mode:payment.live_mode}}, {onConflict:'provider,provider_payment_id'})

  if(status==='approved'&&amount===expected){
    await supabase.from('fila_cero_reservations').update({status:'confirmed',payment_status:'paid',payment_provider:'mercadopago',payment_provider_id:paymentId,payment_expires_at:null}).eq('id',r.id).eq('status','pending_payment')
  }else if(['rejected','cancelled','refunded','charged_back'].includes(status)){
    await supabase.from('fila_cero_slots').update({status:'active'}).eq('id',r.slot_id).eq('status','reserved')
    await supabase.from('fila_cero_reservations').delete().eq('id',r.id).eq('status','pending_payment')
  }
  return new Response('ok',{status:200})
})
