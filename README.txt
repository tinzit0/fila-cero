FILA CERO v0.7 — SUPABASE

Esta versión dejó de usar localStorage como base principal para empresas,
cupos y reservas. Ahora utiliza Supabase Auth + PostgreSQL + Realtime + Storage.

PRIMERO:
1. Lee README-SUPABASE.txt
2. Ejecuta supabase-fila-cero.sql en Supabase > SQL Editor
3. Abre ABRIR-FILA-CERO.bat
4. Crea una cuenta y publica tu primer cupo

Archivos principales:
- config.js                 credenciales públicas del proyecto
- supabase-client.js        inicializa Supabase JS
- supabase-fila-cero.sql    esquema + RLS + Realtime + Storage
- login.html                Supabase Auth + Google OAuth preparado
- profesional.html          dashboard privado
- empresa.html              perfil público
- index.html                marketplace
