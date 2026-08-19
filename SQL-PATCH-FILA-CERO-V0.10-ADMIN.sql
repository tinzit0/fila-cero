-- ============================================================================
-- FILA CERO v0.10 — ADMINISTRACIÓN + ELIMINACIÓN SEGURA DE EMPRESA
-- ============================================================================
-- Seguro para un Supabase compartido:
-- - SOLO crea/modifica objetos con prefijo fila_cero_* y políticas del bucket
--   fila-cero-portfolio.
-- - NO elimina ni modifica auth.users.
-- - NO toca optica_*, hipso_*, yorka_*, devweb_*, donato_*, mily_* u otros.
--
-- Admin inicial de Fila Cero:
--   martinub250@gmail.com
-- ============================================================================

begin;

-- Asegura que exista la columna de visibilidad de v0.9.2.
alter table public.fila_cero_businesses
  add column if not exists profile_enabled boolean not null default true;

-- --------------------------------------------------------------------------
-- 1) LISTA PRIVADA DE ADMINISTRADORES DE FILA CERO
-- --------------------------------------------------------------------------
create table if not exists public.fila_cero_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.fila_cero_admins enable row level security;
revoke all on public.fila_cero_admins from anon, authenticated;

insert into public.fila_cero_admins(email)
values ('martinub250@gmail.com')
on conflict (email) do nothing;

-- Usuarios bloqueados únicamente en Fila Cero. Su auth.users permanece intacto.
create table if not exists public.fila_cero_blocked_owners (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  reason text not null default 'Moderación de Fila Cero',
  blocked_by uuid references auth.users(id) on delete set null,
  blocked_at timestamptz not null default now()
);

alter table public.fila_cero_blocked_owners enable row level security;
revoke all on public.fila_cero_blocked_owners from anon, authenticated;

-- --------------------------------------------------------------------------
-- 2) HELPERS DE AUTORIZACIÓN
-- --------------------------------------------------------------------------
create or replace function public.fila_cero_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fila_cero_admins a
    where lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;

revoke all on function public.fila_cero_is_admin() from public, anon;
grant execute on function public.fila_cero_is_admin() to authenticated;

create or replace function public.fila_cero_owner_is_blocked(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fila_cero_blocked_owners b
    where b.owner_id = p_owner_id
  );
$$;

revoke all on function public.fila_cero_owner_is_blocked(uuid) from public, anon;
grant execute on function public.fila_cero_owner_is_blocked(uuid) to authenticated;

create or replace function public.fila_cero_is_current_user_blocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    else public.fila_cero_owner_is_blocked(auth.uid())
  end;
$$;

revoke all on function public.fila_cero_is_current_user_blocked() from public, anon;
grant execute on function public.fila_cero_is_current_user_blocked() to authenticated;

-- Impide que un usuario bloqueado vuelva a crear inmediatamente su empresa.
drop policy if exists fila_cero_businesses_owner_insert on public.fila_cero_businesses;
create policy fila_cero_businesses_owner_insert
on public.fila_cero_businesses
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and not public.fila_cero_owner_is_blocked((select auth.uid()))
);

-- --------------------------------------------------------------------------
-- 3) ELIMINAR MI EMPRESA — SOLO DATOS DE FILA CERO
-- --------------------------------------------------------------------------
create or replace function public.fila_cero_delete_my_business()
returns table (
  deleted_business_id uuid,
  deleted_owner_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select b.id, b.owner_id
    into v_business_id, v_owner_id
  from public.fila_cero_businesses b
  where b.owner_id = auth.uid()
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FILA_CERO_BUSINESS_NOT_FOUND';
  end if;

  -- ON DELETE CASCADE elimina únicamente fila_cero_slots y fila_cero_reservations.
  delete from public.fila_cero_businesses
  where id = v_business_id;

  return query select v_business_id, v_owner_id;
end;
$$;

revoke all on function public.fila_cero_delete_my_business() from public, anon;
grant execute on function public.fila_cero_delete_my_business() to authenticated;

-- --------------------------------------------------------------------------
-- 4) PANEL ADMIN — LISTAR TODAS LAS EMPRESAS, INCLUSO OCULTAS
-- --------------------------------------------------------------------------
create or replace function public.fila_cero_admin_list_businesses()
returns table (
  id uuid,
  owner_id uuid,
  owner_email text,
  name text,
  category text,
  description text,
  city text,
  sector text,
  address text,
  whatsapp text,
  instagram text,
  website text,
  portfolio_urls text[],
  profile_enabled boolean,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  slots_total bigint,
  reservations_total bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.fila_cero_is_admin() then
    raise exception using errcode = '42501', message = 'FILA_CERO_ADMIN_REQUIRED';
  end if;

  return query
  select
    b.id,
    b.owner_id,
    u.email::text,
    b.name,
    b.category,
    b.description,
    b.city,
    b.sector,
    b.address,
    b.whatsapp,
    b.instagram,
    b.website,
    b.portfolio_urls,
    b.profile_enabled,
    b.is_active,
    b.created_at,
    b.updated_at,
    (select count(*) from public.fila_cero_slots s where s.business_id = b.id)::bigint,
    (select count(*) from public.fila_cero_reservations r where r.business_id = b.id)::bigint
  from public.fila_cero_businesses b
  left join auth.users u on u.id = b.owner_id
  order by b.created_at desc;
end;
$$;

revoke all on function public.fila_cero_admin_list_businesses() from public, anon;
grant execute on function public.fila_cero_admin_list_businesses() to authenticated;

-- --------------------------------------------------------------------------
-- 5) ADMIN: ELIMINAR EMPRESA Y OPCIONALMENTE BLOQUEAR SU RECREACIÓN
-- --------------------------------------------------------------------------
create or replace function public.fila_cero_admin_delete_business(
  p_business_id uuid,
  p_block_owner boolean default true,
  p_reason text default 'Contenido o uso no permitido en Fila Cero'
)
returns table (
  deleted_business_id uuid,
  deleted_owner_id uuid,
  owner_blocked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_owner_email text;
begin
  if auth.uid() is null or not public.fila_cero_is_admin() then
    raise exception using errcode = '42501', message = 'FILA_CERO_ADMIN_REQUIRED';
  end if;

  select b.owner_id, u.email::text
    into v_owner_id, v_owner_email
  from public.fila_cero_businesses b
  left join auth.users u on u.id = b.owner_id
  where b.id = p_business_id
  for update of b;

  if not found then
    raise exception using errcode = 'P0001', message = 'FILA_CERO_BUSINESS_NOT_FOUND';
  end if;

  -- Un administrador no puede bloquear por accidente a otro administrador.
  if p_block_owner and exists (
    select 1 from public.fila_cero_admins a
    where lower(a.email) = lower(coalesce(v_owner_email,''))
  ) then
    raise exception using errcode = 'P0001', message = 'CANNOT_BLOCK_FILA_CERO_ADMIN';
  end if;

  if p_block_owner then
    insert into public.fila_cero_blocked_owners(owner_id,email,reason,blocked_by,blocked_at)
    values (
      v_owner_id,
      v_owner_email,
      coalesce(nullif(trim(p_reason),''),'Moderación de Fila Cero'),
      auth.uid(),
      now()
    )
    on conflict (owner_id) do update set
      email = excluded.email,
      reason = excluded.reason,
      blocked_by = excluded.blocked_by,
      blocked_at = excluded.blocked_at;
  end if;

  delete from public.fila_cero_businesses where id = p_business_id;

  return query select p_business_id, v_owner_id, p_block_owner;
end;
$$;

revoke all on function public.fila_cero_admin_delete_business(uuid,boolean,text) from public, anon;
grant execute on function public.fila_cero_admin_delete_business(uuid,boolean,text) to authenticated;

-- --------------------------------------------------------------------------
-- 6) ADMIN: BLOQUEADOS / DESBLOQUEAR
-- --------------------------------------------------------------------------
create or replace function public.fila_cero_admin_list_blocked()
returns table (
  owner_id uuid,
  email text,
  reason text,
  blocked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.fila_cero_is_admin() then
    raise exception using errcode = '42501', message = 'FILA_CERO_ADMIN_REQUIRED';
  end if;

  return query
  select b.owner_id, b.email, b.reason, b.blocked_at
  from public.fila_cero_blocked_owners b
  order by b.blocked_at desc;
end;
$$;

revoke all on function public.fila_cero_admin_list_blocked() from public, anon;
grant execute on function public.fila_cero_admin_list_blocked() to authenticated;

create or replace function public.fila_cero_admin_unblock_owner(p_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.fila_cero_is_admin() then
    raise exception using errcode = '42501', message = 'FILA_CERO_ADMIN_REQUIRED';
  end if;

  delete from public.fila_cero_blocked_owners
  where owner_id = p_owner_id;

  return true;
end;
$$;

revoke all on function public.fila_cero_admin_unblock_owner(uuid) from public, anon;
grant execute on function public.fila_cero_admin_unblock_owner(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 7) STORAGE: PERMITE BORRAR FOTOS PROPIAS Y AL ADMIN MODERAR FOTOS AJENAS
-- --------------------------------------------------------------------------
drop policy if exists fila_cero_portfolio_owner_select on storage.objects;
drop policy if exists fila_cero_portfolio_owner_delete on storage.objects;
drop policy if exists fila_cero_portfolio_admin_select on storage.objects;
drop policy if exists fila_cero_portfolio_admin_delete on storage.objects;

create policy fila_cero_portfolio_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fila-cero-portfolio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy fila_cero_portfolio_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fila-cero-portfolio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy fila_cero_portfolio_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fila-cero-portfolio'
  and public.fila_cero_is_admin()
);

create policy fila_cero_portfolio_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fila-cero-portfolio'
  and public.fila_cero_is_admin()
);

commit;

-- --------------------------------------------------------------------------
-- VERIFICACIÓN
-- --------------------------------------------------------------------------
select email as fila_cero_admin from public.fila_cero_admins order by email;
select proname
from pg_proc
where proname in (
  'fila_cero_is_admin',
  'fila_cero_is_current_user_blocked',
  'fila_cero_delete_my_business',
  'fila_cero_admin_list_businesses',
  'fila_cero_admin_delete_business',
  'fila_cero_admin_list_blocked',
  'fila_cero_admin_unblock_owner'
)
order by proname;
