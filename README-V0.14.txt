FILA CERO v0.14 — PWA + AUTOMATIZACIONES
=========================================

NUEVO
- PWA instalable (manifest + service worker + offline).
- Web Push real mediante Service Worker + VAPID + Supabase Edge Function.
- Alertas push aunque la web esté cerrada, una vez configurado VAPID + Cron.
- Google Calendar en un clic + descarga .ics después de reservar y desde historial.
- Recordatorios opcionales por email, WhatsApp y push: 24 h y 2 h antes.
- Abono opcional por cupo con hold de 15 minutos y Checkout Pro de Mercado Pago.
- Página pago.html para confirmar el estado del abono.
- Cola aislada fila_cero_delivery_queue.
- Edge Functions aisladas fila-cero-*.

PRIMERO
1) Ejecuta SQL-PATCH-FILA-CERO-V0.14-PWA-AUTOMATIZACIONES.sql.
2) Sube los archivos a GitHub/Cloudflare.
3) Lee SETUP-V0.14-INTEGRACIONES.txt para activar servicios externos.

PWA y Google Calendar funcionan sin claves extra.
Push, email, WhatsApp y pagos necesitan configuración externa.
