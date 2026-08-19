FILA CERO v0.9.2 — Visibilidad del perfil

NUEVO
- Interruptor Habilitado / Deshabilitado en Mi empresa > Perfil público.
- Habilitado: aparece en directorio y empresa.html.
- Deshabilitado: no aparece en directorio ni permite abrir el perfil público.
- El dashboard, publicación de horas y gestión de reservas siguen funcionando.
- Los cupos pueden seguir apareciendo en el marketplace, pero sin enlace al perfil público.

ANTES DE SUBIR EL FRONTEND
1. Supabase > SQL Editor > New query.
2. Ejecutar SOLO SQL-PATCH-FILA-CERO-V0.9.2.sql.
3. Reemplazar los archivos del frontend.
4. git add .
5. git commit -m "Fila Cero v0.9.2 visibilidad de perfil"
6. git push
