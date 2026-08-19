FILA CERO v0.13 — PLATAFORMA COMPLETA
=====================================

NUEVAS FUNCIONES
- Cuentas personales separadas de perfiles de empresa.
- Historial real de reservas conectado a Supabase.
- Favoritos.
- Reseñas y calificaciones posteriores a una reserva.
- Insignia de profesional verificado (solo el admin puede activarla).
- Alertas por servicio/comuna.
- Centro de notificaciones persistente + avisos del navegador mientras la app está abierta.
- Recuperación de contraseña.
- Estadísticas para empresas: vistas, reservas, rating y conversión.
- Reportes de perfiles y panel de moderación para admin.
- Privacidad, términos y contacto.

ORDEN DE INSTALACIÓN
1) Supabase -> SQL Editor -> New query.
2) Copiar TODO el archivo SQL-PATCH-FILA-CERO-V0.13-COMPLETO.sql.
3) Presionar Run UNA sola vez.
4) NO volver a ejecutar SQL antiguos.

REDIRECT URLS NUEVAS EN SUPABASE
Authentication -> URL Configuration -> Redirect URLs
Agregar:
https://fila-cero.concepcion.workers.dev/cuenta.html
https://fila-cero.concepcion.workers.dev/nueva-contrasena.html

Mantener también:
https://fila-cero.concepcion.workers.dev/profesional.html

GOOGLE CLOUD
No cambia el callback de Google. Se mantiene:
https://kxldsjodgfonrrlwjbws.supabase.co/auth/v1/callback

ACTUALIZAR GITHUB/CLOUDFLARE
Reemplazar los archivos del proyecto conservando la carpeta .git y ejecutar:

git add .
git commit -m "Fila Cero v0.13 plataforma completa"
git push

SEGURIDAD
- El parche no modifica tablas de Óptica, Hipso, Yorka, DevWeb, Donato u otros proyectos.
- No elimina usuarios de auth.users.
- Solo el admin puede activar la verificación de una empresa.
- El frontend nunca incluye service_role ni secret keys.

NOTIFICACIONES
Las notificaciones dentro de Fila Cero se crean en Supabase aunque el usuario no tenga la página abierta.
Las notificaciones nativas del navegador se muestran en tiempo real cuando Fila Cero está abierta y el usuario dio permiso.
Para push con la web completamente cerrada se requeriría posteriormente Web Push/Service Worker o un proveedor push.

PRIVACIDAD
Las páginas legales incluidas son una base para el MVP. Antes de un lanzamiento comercial masivo se recomienda revisión jurídica profesional.
Al 19-08-2026, Ley 19.628 vigente; Ley 21.719 entra en vigencia el 01-12-2026 según BCN.
