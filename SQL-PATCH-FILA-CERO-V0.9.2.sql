-- FILA CERO v0.9.2 — Habilitar / deshabilitar perfil público
-- Seguro para Supabase compartido: solo modifica fila_cero_businesses.

alter table public.fila_cero_businesses
  add column if not exists profile_enabled boolean not null default true;

create index if not exists fila_cero_businesses_profile_enabled_idx
  on public.fila_cero_businesses(profile_enabled);

comment on column public.fila_cero_businesses.profile_enabled is
  'Controla si el perfil tipo red social de la empresa se muestra públicamente en Fila Cero.';
