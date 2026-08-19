FILA CERO v0.8 — SUPABASE COMPARTIDO
====================================

Esta versión continúa aislada de tus otros proyectos del mismo Supabase.
No crea ni modifica tablas optica_*, hipso_*, yorka_*, donato_*, devweb_* ni otras.

RECURSOS EXCLUSIVOS
-------------------
public.fila_cero_businesses
public.fila_cero_slots
public.fila_cero_reservations
public.fila_cero_book_slot(...)
Storage: fila-cero-portfolio

SI YA EJECUTASTE EL SQL v0.7
----------------------------
NO vuelvas a ejecutar nada para actualizar a v0.8. La tabla fila_cero_businesses
ya contiene latitude y longitude, que ahora utiliza el mapa.

REDIRECT DE AUTH
----------------
Mantén autorizado:
https://fila-cero.concepcion.workers.dev/profesional.html

MAPAS
-----
- Google Maps Embed: se activa poniendo la API key en config.js.
- Sin API key, Fila Cero usa un respaldo OpenStreetMap para visualizar el mapa.
- La geocodificación de respaldo se dispara por acciones puntuales del usuario y
  se cachea; para un lanzamiento con tráfico alto conviene usar un proveedor de
  geocodificación dedicado.

SEGURIDAD
---------
La publishable key puede estar en el frontend con RLS correctamente configurado.
Nunca incluyas service_role, secret keys ni secretos OAuth en GitHub.
