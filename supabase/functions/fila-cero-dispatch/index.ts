import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fila-cero-cron',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
}

function getSecretKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    return keys.default || Object.values(keys)[0]
  } catch { return '' }
}

function text(v: unknown) { return String(v ?? '') }

async function sendEmail(item: any) {
  const apiKey = Deno.env.get('RESEND_API_KEY') || ''
  const from = Deno.env.get('RESEND_FROM') || ''
  const to = text(item.payload?.client_email)
  if (!apiKey || !from || !to) return { ok: false, skipped: true, error: 'EMAIL_NOT_CONFIGURED' }
  const p = item.payload || {}
  const when = `${text(p.slot_date)} a las ${text(p.start_time)}`
  const hours = item.event_type === 'reservation_2h' ? '2 horas' : '24 horas'
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Fila Cero</h2><p>Hola ${text(p.client_name)},</p><p>Te recordamos que tu hora es en <strong>${hours}</strong>.</p><p><strong>${text(p.service)}</strong><br>${text(p.business_name)}<br>${when}<br>${text(p.address)}, ${text(p.city)}</p><p><a href="${(Deno.env.get('FILA_CERO_APP_URL')||'https://fila-cero.concepcion.workers.dev/').replace(/\/?$/,'/')}cuenta.html">Ver mi reserva</a></p></div>`
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `fila-cero-${item.id}` },
    body: JSON.stringify({ from, to: [to], subject: `Recordatorio Fila Cero · ${text(p.service)}`, html })
  })
  if (!r.ok) return { ok: false, error: `RESEND_${r.status}_${await r.text()}` }
  return { ok: true }
}

async function sendWhatsApp(item: any) {
  const url = Deno.env.get('WHATSAPP_MESSAGES_URL') || ''
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || ''
  const template = Deno.env.get('WHATSAPP_TEMPLATE_REMINDER') || ''
  const language = Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE') || 'es_CL'
  const p = item.payload || {}
  const phone = text(p.client_phone).replace(/\D/g, '')
  if (!url || !token || !template || !phone) return { ok: false, skipped: true, error: 'WHATSAPP_NOT_CONFIGURED' }
  const r = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: phone, type: 'template',
      template: { name: template, language: { code: language }, components: [{ type: 'body', parameters: [
        { type: 'text', text: text(p.client_name) },
        { type: 'text', text: text(p.service) },
        { type: 'text', text: `${text(p.slot_date)} ${text(p.start_time)}` },
        { type: 'text', text: text(p.business_name) }
      ] }] }
    })
  })
  if (!r.ok) return { ok: false, error: `WHATSAPP_${r.status}_${await r.text()}` }
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const expected = Deno.env.get('FILA_CERO_CRON_SECRET') || ''
  if (!expected || req.headers.get('x-fila-cero-cron') !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })
  }

  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = getSecretKey()
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  await supabase.rpc('fila_cero_release_expired_payment_holds')
  const { data: items, error } = await supabase.rpc('fila_cero_dispatch_claim', { p_limit: 50 })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors })

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || ''
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || ''
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com'
  if (vapidPublic && vapidPrivate) webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  let sent = 0, skipped = 0, failed = 0
  for (const item of items || []) {
    try {
      let result: any = { ok: false, skipped: true, error: 'UNKNOWN_CHANNEL' }
      if (item.reservation_id) {
        const { data: reservation } = await supabase.from('fila_cero_reservations').select('status').eq('id', item.reservation_id).maybeSingle()
        if (!reservation || reservation.status !== 'confirmed') {
          result = { ok: false, skipped: true, error: 'RESERVATION_NOT_CONFIRMED' }
          await supabase.rpc('fila_cero_dispatch_finish', { p_id: item.id, p_status: 'skipped', p_error: result.error })
          skipped++
          continue
        }
      }
      if (item.channel === 'email') result = await sendEmail(item)
      if (item.channel === 'whatsapp') result = await sendWhatsApp(item)
      if (item.channel === 'push') {
        if (!vapidPublic || !vapidPrivate || !item.user_id) {
          result = { ok: false, skipped: true, error: 'PUSH_NOT_CONFIGURED' }
        } else {
          const { data: subs } = await supabase.from('fila_cero_push_subscriptions').select('*').eq('user_id', item.user_id)
          if (!subs?.length) result = { ok: false, skipped: true, error: 'NO_PUSH_SUBSCRIPTION' }
          else {
            const payload = item.payload || {}
            const body = JSON.stringify({
              title: payload.title || (item.event_type === 'reservation_2h' ? 'Tu hora es en 2 horas' : item.event_type === 'reservation_24h' ? 'Tu hora es mañana' : 'Fila Cero'),
              body: payload.body || `${text(payload.service)} · ${text(payload.business_name)}`,
              url: payload.url || 'cuenta.html#notificaciones',
              tag: `fila-cero-${item.event_type}-${item.reservation_id || item.notification_id || item.id}`
            })
            let okCount = 0
            for (const sub of subs) {
              try {
                await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body)
                okCount++
              } catch (e: any) {
                const status = Number(e?.statusCode || 0)
                if (status === 404 || status === 410) await supabase.from('fila_cero_push_subscriptions').delete().eq('id', sub.id)
              }
            }
            result = okCount ? { ok: true } : { ok: false, error: 'PUSH_DELIVERY_FAILED' }
          }
        }
      }
      const status = result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed'
      await supabase.rpc('fila_cero_dispatch_finish', { p_id: item.id, p_status: status, p_error: result.error || null })
      if (status === 'sent') sent++; else if (status === 'skipped') skipped++; else failed++
    } catch (e: any) {
      failed++
      await supabase.rpc('fila_cero_dispatch_finish', { p_id: item.id, p_status: 'failed', p_error: text(e?.message || e) })
    }
  }
  return new Response(JSON.stringify({ processed: (items || []).length, sent, skipped, failed }), { headers: cors })
})
