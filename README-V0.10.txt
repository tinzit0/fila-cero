FILA CERO v0.10 — ADMINISTRACIÓN Y ELIMINACIÓN SEGURA
======================================================

NOVEDADES
- Botón "Eliminar mi empresa" en el dashboard profesional.
- Elimina perfil, cupos y reservas de Fila Cero por ON DELETE CASCADE.
- El frontend elimina también las imágenes del bucket fila-cero-portfolio usando Storage API.
- NO elimina auth.users: el Supabase es compartido con otras aplicaciones.
- Admin de Fila Cero: martinub250@gmail.com
- Nuevo admin.html con listado de todas las empresas, incluso perfiles ocultos.
- Admin puede:
  * ver datos y portafolio;
  * eliminar una empresa sin bloquear;
  * eliminar y bloquear por moderación;
  * ver cuentas bloqueadas;
  * desbloquearlas.
- El bloqueo existe únicamente en Fila Cero.

INSTALACIÓN
1. Supabase > SQL Editor > New query.
2. Ejecutar SOLO SQL-PATCH-FILA-CERO-V0.10-ADMIN.sql.
3. Reemplazar los archivos web por esta versión.
4. git add .
5. git commit -m "Fila Cero v0.10 administracion"
6. git push
7. Cloudflare desplegará el repositorio.

IMPORTANTE
- NO vuelvas a ejecutar SQL antiguos si no es necesario.
- El parche v0.10 solo toca recursos fila_cero_* y fila-cero-portfolio.
- El admin se determina en el backend por el correo autenticado en Supabase.
- No hay service_role ni secretos dentro del frontend.
