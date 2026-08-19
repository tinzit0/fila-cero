FILA CERO v0.9 — Gestión + Portafolio + Google Auth
===================================================

CAMBIOS PRINCIPALES
- Corrige el error "Could not find the 'provider' column of fila_cero_businesses".
- El frontend ya no intenta guardar la propiedad provider en la tabla de empresas.
- updateBusiness usa una lista blanca de columnas válidas como protección adicional.
- Portafolio ampliado a 12 imágenes.
- Las nuevas imágenes se agregan a las anteriores en vez de reemplazarlas automáticamente.
- Galería pública horizontal con scroll-snap.
- Al tocar una fotografía se abre un visor grande con anterior/siguiente y teclado.
- Las fotos de la ventana de reserva también se pueden ampliar.
- Panel de empresa: cancelar y eliminar cupos.
- Reservas: cancelar cita o eliminar cita definitivamente.
- Google Login usa Supabase OAuth y vuelve a profesional.html.

IMPORTANTE: SQL
1. Ya debes tener ejecutado SQL-EDITOR-FILA-CERO-V0.7.sql.
2. Ejecuta SOLO una vez SQL-PATCH-FILA-CERO-V0.9.sql.
3. El parche solo crea funciones fila_cero_* y no toca tablas de tus otros proyectos.

GOOGLE LOGIN
El código ya está preparado. Falta habilitar Google una vez desde:
Supabase > Authentication > Sign In / Providers > Google

Redirect URL de Fila Cero en Supabase:
https://fila-cero.concepcion.workers.dev/profesional.html

En Google Cloud, el callback de Supabase es:
https://kxldsjodgfonrrlwjbws.supabase.co/auth/v1/callback

Origen web de Fila Cero:
https://fila-cero.concepcion.workers.dev

PUBLICACIÓN
Reemplaza los archivos del repositorio con esta versión (sin borrar .git):
git add .
git commit -m "Fila Cero v0.9 gestion galeria"
git push
