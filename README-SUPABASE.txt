============================================================
FILA CERO v0.6 — SUPABASE REAL
Gran Concepción
============================================================

ESTE PROYECTO YA ESTÁ CONFIGURADO CON:

Supabase URL:
https://kxldsjodgfonrrlwjbws.supabase.co

Publishable key:
sb_publishable_J5s_2YqtASIYSqu2k00SGA_copdr39x

IMPORTANTE:
La publishable key sí puede estar en el frontend cuando RLS está habilitado.
NUNCA coloques una Secret Key o Service Role Key dentro de config.js.

------------------------------------------------------------
PASO 1 — CREAR LA BASE DE DATOS
------------------------------------------------------------

1. Entra a tu proyecto de Supabase.
2. Abre SQL Editor.
3. Presiona New query.
4. Abre el archivo:

   supabase-fila-cero.sql

5. Copia TODO su contenido.
6. Pégalo en SQL Editor.
7. Presiona RUN.

El script crea:

- public.businesses
- public.slots
- public.reservations
- Función book_slot() contra doble reserva
- Trigger para crear empresa al crear un usuario
- RLS (Row Level Security)
- Bucket Storage: business-portfolio
- Políticas de subida de imágenes
- Supabase Realtime para empresas, cupos y reservas

------------------------------------------------------------
PASO 2 — AUTH POR CORREO
------------------------------------------------------------

Después de ejecutar el SQL, Crear cuenta / Iniciar sesión ya usa
Supabase Auth en vez de localStorage.

Si Email Confirmation está activado en Supabase, una cuenta nueva
tendrá que confirmar su correo antes de iniciar sesión.

------------------------------------------------------------
PASO 3 — ABRIR FILA CERO LOCALMENTE
------------------------------------------------------------

NO uses doble clic en index.html para probar Google Login.

Ejecuta:

   ABRIR-FILA-CERO.bat

La aplicación intentará abrirse en:

   http://localhost:5500

El BAT intenta usar primero Python y, si no existe, Node/npx.

------------------------------------------------------------
PASO 4 — ACTIVAR LOGIN CON GOOGLE
------------------------------------------------------------

En Google Cloud Console:

1. Crea/configura una aplicación OAuth.
2. Crea un OAuth Client ID de tipo Web application.
3. Authorized JavaScript origins:

   http://localhost:5500

4. Authorized redirect URI de Supabase:

   https://kxldsjodgfonrrlwjbws.supabase.co/auth/v1/callback

Luego, en Supabase:

Authentication > Providers > Google

- Activa Google.
- Pega el Google Client ID.
- Pega el Google Client Secret.
- Guarda.

Después ve a:

Authentication > URL Configuration

Para desarrollo configura/autoriza:

Site URL:
   http://localhost:5500

Redirect URL adicional:
   http://localhost:5500/profesional.html

Cuando publiques Fila Cero en un dominio, agrega también el dominio
real y su URL profesional.html.

------------------------------------------------------------
PASO 5 — PROBAR EL FLUJO
------------------------------------------------------------

1. Abre Fila Cero.
2. Crear cuenta.
3. Ingresa nombre de empresa, email y contraseña.
4. Inicia sesión.
5. Completa Perfil público:
   - Nombre
   - Rubro
   - Descripción
   - Comuna
   - Sector
   - Dirección
   - WhatsApp
   - Instagram
   - Web
   - Portafolio
6. Guarda el perfil.
7. Añade una hora.
8. Abre el Marketplace en otra ventana/celular.
9. La hora debe aparecer desde Supabase.
10. Reserva el cupo.
11. En el dashboard de la empresa aparecerá la reserva.

------------------------------------------------------------
PORTAFOLIO
------------------------------------------------------------

Ahora puedes subir hasta 3 imágenes directamente.
Formatos:
- JPG
- PNG
- WEBP

Máximo: 5 MB por imagen.

Se guardan en:
Storage > business-portfolio

Cada usuario solo puede subir/modificar/eliminar archivos dentro de
su propia carpeta de Auth UID.

------------------------------------------------------------
REALTIME
------------------------------------------------------------

Cuando una empresa publica una hora:

EMPRESA -> SUPABASE -> MARKETPLACE

Los clientes conectados reciben la actualización sin depender del
localStorage del computador de la empresa.

Cuando alguien reserva:

CLIENTE -> book_slot() -> RESERVA + SLOT=RESERVED

La función bloquea el cupo durante la operación para reducir el riesgo
de doble reserva.

------------------------------------------------------------
GOOGLE MAPS
------------------------------------------------------------

Google Maps sigue separado de Supabase.

Para incrustar mapas dentro de Fila Cero agrega en config.js:

googleMapsApiKey: "TU_API_KEY"

Sin API key, el botón "Abrir en Google Maps" sigue funcionando.

============================================================
