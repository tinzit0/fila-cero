FILA CERO v0.8 — MAPAS + PERFILES + RESERVA ENRIQUECIDA
=========================================================

NOVEDADES
---------
- El modal de reserva muestra información pública del centro/profesional:
  descripción, WhatsApp, Instagram, sitio web, portafolio y perfil completo.
- El mapa se intenta mostrar siempre:
  1) Google Maps Embed si configuras googleMapsApiKey.
  2) OpenStreetMap como respaldo automático si no hay API key.
- La dirección se geocodifica de forma puntual y se guarda en latitude/longitude
  al volver a guardar el perfil de empresa.
- Nuevo Directorio profesional en la portada: muestra los perfiles creados aunque
  no tengan cupos activos.
- El dashboard ahora muestra una tarjeta visual de "Mi perfil activo" con mapa.
- Las reservas recibidas muestran más detalle y accesos rápidos a WhatsApp/correo.

SUPABASE
--------
NO necesitas ejecutar un SQL nuevo si ya ejecutaste SQL-EDITOR-FILA-CERO-V0.7.sql.
Esta versión mantiene exclusivamente:
- public.fila_cero_businesses
- public.fila_cero_slots
- public.fila_cero_reservations
- public.fila_cero_book_slot(...)
- Storage: fila-cero-portfolio

IMPORTANTE PARA EL MAPA
-----------------------
La primera vez que guardes nuevamente el perfil de una empresa, Fila Cero intentará
ubicar la dirección y guardar latitude/longitude en fila_cero_businesses.

Sin clave de Google Maps, el MVP usa OpenStreetMap como respaldo para mostrar un
mapa visible. Para producción a mayor escala, configura Google Maps Embed mediante
la propiedad googleMapsApiKey de config.js.

SUBIR A GITHUB
--------------
1. Reemplaza los archivos actuales del repositorio por los de esta carpeta.
2. Conserva la carpeta oculta .git.
3. Ejecuta:

   git add .
   git commit -m "Fila Cero v0.8 mapas y perfiles"
   git push

Cloudflare debería desplegar después la misma URL:
https://fila-cero.concepcion.workers.dev/
