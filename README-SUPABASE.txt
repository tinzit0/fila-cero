FILA CERO v0.7 — SUPABASE COMPARTIDO
====================================

Esta versión está preparada para usar el MISMO proyecto Supabase que tus otras apps,
sin compartir tablas de negocio con ellas.

RECURSOS EXCLUSIVOS DE FILA CERO
---------------------------------
public.fila_cero_businesses
public.fila_cero_slots
public.fila_cero_reservations
public.fila_cero_book_slot(...)
Storage: fila-cero-portfolio

IMPORTANTE
----------
1) NO borres las tablas antiguas businesses, slots o reservations.
2) NO hace falta crear otro proyecto Supabase.
3) Fila Cero NO crea trigger global sobre auth.users.
4) El perfil fila_cero_businesses se crea cuando el usuario entra a Fila Cero.
5) La misma cuenta Auth puede existir en tu Supabase compartido sin convertirse
   automáticamente en empresa de Fila Cero.

INSTALACIÓN
-----------
1. Supabase > SQL Editor > New query.
2. Copia TODO el archivo SQL-EDITOR-FILA-CERO-V0.7.sql.
3. Presiona Run.
4. Comprueba en Table Editor que aparezcan:
   - fila_cero_businesses
   - fila_cero_slots
   - fila_cero_reservations
5. Authentication > URL Configuration > Redirect URLs:
   agrega:
   https://fila-cero.concepcion.workers.dev/profesional.html
6. NO cambies obligatoriamente el Site URL global, porque el proyecto Supabase
   lo comparten otras aplicaciones.

GOOGLE LOGIN
------------
El código usa redirectTo explícito hacia:
https://fila-cero.concepcion.workers.dev/profesional.html

En Google Cloud el callback de Supabase sigue siendo:
https://kxldsjodgfonrrlwjbws.supabase.co/auth/v1/callback

CLOUDFLARE / GITHUB
-------------------
Sube el contenido de esta carpeta al repositorio:
https://github.com/tinzit0/fila-cero.git

Luego tu despliegue seguirá funcionando en:
https://fila-cero.concepcion.workers.dev/

SEGURIDAD
---------
La publishable key sí puede estar en config.js con RLS habilitado.
NUNCA pongas service_role, secret key ni Client Secret de Google en el frontend.
