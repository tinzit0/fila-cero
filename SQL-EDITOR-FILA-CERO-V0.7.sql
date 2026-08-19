-- ============================================================================
-- FILA CERO v0.7 — SUPABASE COMPARTIDO / INSTALACIÓN SEGURA
-- ============================================================================
-- Este script crea SOLAMENTE objetos con prefijo fila_cero_* y el bucket
-- fila-cero-portfolio. NO borra ni modifica tablas de otros proyectos.
--
-- IMPORTANTE:
-- - No renombra ni elimina: businesses, slots, reservations, optica_*, hipso_*,
--   yorka_*, donato_*, devweb_*, mily_*, etc.
-- - No crea un trigger global para nuevos usuarios en auth.users.
-- - Incluye una limpieza MUY específica del trigger legado de Fila Cero v0.6
--   SOLO si detecta exactamente la función antigua que insertaba en
--   public.businesses. Si no coincide, no lo toca.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 0) LIMPIEZA SEGURA DEL TRIGGER LEGADO v0.6 (sin tocar otros triggers)
-- --------------------------------------------------------------------------
do $$
declare
  v_func_oid oid;
  v_func_def text;
begin
  select t.tgfoid
  into v_func_oid
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'auth'
    and c.relname = 'users'
    and t.tgname = 'on_auth_user_created'
    and not t.tgisinternal
  limit 1;

  if v_func_oid is not null then
    select pg_get_functiondef(v_func_oid) into v_func_def;

    if v_func_def ilike '%insert into public.businesses (owner_id, name)%'
       and v_func_def ilike '%raw_user_meta_data%business_name%'
       and v_func_def ilike '%Mi empresa%' then
      execute 'drop trigger on_auth_user_created on auth.users';
      raise notice 'Se eliminó únicamente el trigger legado de Fila Cero v0.6 sobre auth.users.';
    else
      raise notice 'Existe on_auth_user_created, pero NO coincide con Fila Cero v0.6. No se modificó.';
    end if;
  else
    raise notice 'No existe el trigger legado on_auth_user_created. Nada que limpiar.';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 1) EMPRESAS / PROFESIONALES DE FILA CERO
-- --------------------------------------------------------------------------
create table if not exists public.fila_cero_businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Mi empresa',
  category text not null default 'Otro',
  description text not null default '',
  city text not null default 'Concepción',
  sector text not null default '',
  address text not null default '',
  whatsapp text not null default '',
  instagram text not null default '',
  website text not null default '',
  portfolio_urls text[] not null default '{}'::text[],
  latitude double precision,
  longitude double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fila_cero_businesses_city_check check (
    city in (
      'Concepción','Talcahuano','Hualpén','San Pedro de la Paz',
      'Chiguayante','Penco','Tomé','Hualqui','Coronel','Lota','Santa Juana'
    )
  ),
  constraint fila_cero_businesses_category_check check (
    category in ('Psicología','Dental','Kinesiología','Veterinaria','Nutrición','Otro')
  )
);

create index if not exists fila_cero_businesses_city_idx
  on public.fila_cero_businesses(city);
create index if not exists fila_cero_businesses_category_idx
  on public.fila_cero_businesses(category);
create index if not exists fila_cero_businesses_active_idx
  on public.fila_cero_businesses(is_active);

-- --------------------------------------------------------------------------
-- 2) CUPOS / HORAS PUBLICADAS
-- --------------------------------------------------------------------------
create table if not exists public.fila_cero_slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.fila_cero_businesses(id) on delete cascade,
  service text not null,
  category text not null,
  city text not null,
  sector text not null default '',
  address text not null,
  slot_date date not null,
  start_time time not null,
  duration_minutes integer not null default 30,
  normal_price integer not null default 0,
  fila_price integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fila_cero_slots_category_check check (
    category in ('Psicología','Dental','Kinesiología','Veterinaria','Nutrición','Otro')
  ),
  constraint fila_cero_slots_city_check check (
    city in (
      'Concepción','Talcahuano','Hualpén','San Pedro de la Paz',
      'Chiguayante','Penco','Tomé','Hualqui','Coronel','Lota','Santa Juana'
    )
  ),
  constraint fila_cero_slots_status_check check (
    status in ('active','reserved','cancelled','completed')
  ),
  constraint fila_cero_slots_duration_check check (duration_minutes between 10 and 480),
  constraint fila_cero_slots_price_check check (
    normal_price >= 0 and fila_price >= 0 and fila_price <= normal_price
  )
);

create index if not exists fila_cero_slots_business_idx
  on public.fila_cero_slots(business_id);
create index if not exists fila_cero_slots_status_idx
  on public.fila_cero_slots(status);
create index if not exists fila_cero_slots_schedule_idx
  on public.fila_cero_slots(slot_date, start_time);
create index if not exists fila_cero_slots_city_category_idx
  on public.fila_cero_slots(city, category);

-- --------------------------------------------------------------------------
-- 3) RESERVAS
-- --------------------------------------------------------------------------
create table if not exists public.fila_cero_reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null unique references public.fila_cero_slots(id) on delete cascade,
  business_id uuid not null references public.fila_cero_businesses(id) on delete cascade,
  client_name text not null,
  client_email text not null,
  client_phone text not null,
  status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fila_cero_reservations_status_check check (
    status in ('confirmed','cancelled','completed')
  )
);

create index if not exists fila_cero_reservations_business_idx
  on public.fila_cero_reservations(business_id);
create index if not exists fila_cero_reservations_created_idx
  on public.fila_cero_reservations(created_at desc);

-- --------------------------------------------------------------------------
-- 4) updated_at EXCLUSIVO DE FILA CERO
-- --------------------------------------------------------------------------
create or replace function public.fila_cero_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fila_cero_businesses_updated_at on public.fila_cero_businesses;
create trigger fila_cero_businesses_updated_at
before update on public.fila_cero_businesses
for each row execute function public.fila_cero_set_updated_at();

drop trigger if exists fila_cero_slots_updated_at on public.fila_cero_slots;
create trigger fila_cero_slots_updated_at
before update on public.fila_cero_slots
for each row execute function public.fila_cero_set_updated_at();

drop trigger if exists fila_cero_reservations_updated_at on public.fila_cero_reservations;
create trigger fila_cero_reservations_updated_at
before update on public.fila_cero_reservations
for each row execute function public.fila_cero_set_updated_at();

-- --------------------------------------------------------------------------
-- 5) RESERVA ATÓMICA EXCLUSIVA DE FILA CERO
-- --------------------------------------------------------------------------
create or replace function public.fila_cero_book_slot(
  p_slot_id uuid,
  p_client_name text,
  p_client_email text,
  p_client_phone text
)
returns table (
  reservation_id uuid,
  reserved_slot_id uuid,
  reserved_business_id uuid,
  reservation_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.fila_cero_slots%rowtype;
  v_reservation_id uuid;
begin
  if length(trim(coalesce(p_client_name, ''))) < 2 then
    raise exception using errcode = 'P0001', message = 'CLIENT_NAME_REQUIRED';
  end if;
  if length(trim(coalesce(p_client_email, ''))) < 5 then
    raise exception using errcode = 'P0001', message = 'CLIENT_EMAIL_REQUIRED';
  end if;
  if length(trim(coalesce(p_client_phone, ''))) < 6 then
    raise exception using errcode = 'P0001', message = 'CLIENT_PHONE_REQUIRED';
  end if;

  select s.*
  into v_slot
  from public.fila_cero_slots s
  join public.fila_cero_businesses b on b.id = s.business_id
  where s.id = p_slot_id
    and s.status = 'active'
    and b.is_active = true
    and (s.slot_date + s.start_time) >= (now() at time zone 'America/Santiago')
  for update of s;

  if not found then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  insert into public.fila_cero_reservations (
    slot_id,
    business_id,
    client_name,
    client_email,
    client_phone,
    status
  ) values (
    v_slot.id,
    v_slot.business_id,
    trim(p_client_name),
    lower(trim(p_client_email)),
    trim(p_client_phone),
    'confirmed'
  )
  returning id into v_reservation_id;

  update public.fila_cero_slots
  set status = 'reserved'
  where id = v_slot.id;

  return query
  select
    v_reservation_id,
    v_slot.id,
    v_slot.business_id,
    'confirmed'::text;
end;
$$;

revoke all on function public.fila_cero_book_slot(uuid,text,text,text) from public;
grant execute on function public.fila_cero_book_slot(uuid,text,text,text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- 6) ROW LEVEL SECURITY — AISLADO POR EMPRESA
-- --------------------------------------------------------------------------
alter table public.fila_cero_businesses enable row level security;
alter table public.fila_cero_slots enable row level security;
alter table public.fila_cero_reservations enable row level security;

drop policy if exists fila_cero_businesses_public_read on public.fila_cero_businesses;
drop policy if exists fila_cero_businesses_owner_insert on public.fila_cero_businesses;
drop policy if exists fila_cero_businesses_owner_update on public.fila_cero_businesses;
drop policy if exists fila_cero_businesses_owner_delete on public.fila_cero_businesses;

drop policy if exists fila_cero_slots_public_and_owner_read on public.fila_cero_slots;
drop policy if exists fila_cero_slots_owner_insert on public.fila_cero_slots;
drop policy if exists fila_cero_slots_owner_update on public.fila_cero_slots;
drop policy if exists fila_cero_slots_owner_delete on public.fila_cero_slots;

drop policy if exists fila_cero_reservations_owner_read on public.fila_cero_reservations;
drop policy if exists fila_cero_reservations_owner_update on public.fila_cero_reservations;

create policy fila_cero_businesses_public_read
on public.fila_cero_businesses
for select
to anon, authenticated
using (is_active = true or owner_id = (select auth.uid()));

create policy fila_cero_businesses_owner_insert
on public.fila_cero_businesses
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy fila_cero_businesses_owner_update
on public.fila_cero_businesses
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy fila_cero_businesses_owner_delete
on public.fila_cero_businesses
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy fila_cero_slots_public_and_owner_read
on public.fila_cero_slots
for select
to anon, authenticated
using (
  (
    status = 'active'
    and (slot_date + start_time) >= (now() at time zone 'America/Santiago')
    and exists (
      select 1
      from public.fila_cero_businesses b
      where b.id = business_id and b.is_active = true
    )
  )
  or exists (
    select 1
    from public.fila_cero_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy fila_cero_slots_owner_insert
on public.fila_cero_slots
for insert
to authenticated
with check (
  exists (
    select 1
    from public.fila_cero_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy fila_cero_slots_owner_update
on public.fila_cero_slots
for update
to authenticated
using (
  exists (
    select 1
    from public.fila_cero_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.fila_cero_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy fila_cero_slots_owner_delete
on public.fila_cero_slots
for delete
to authenticated
using (
  exists (
    select 1
    from public.fila_cero_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy fila_cero_reservations_owner_read
on public.fila_cero_reservations
for select
to authenticated
using (
  exists (
    select 1
    from public.fila_cero_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy fila_cero_reservations_owner_update
on public.fila_cero_reservations
for update
to authenticated
using (
  exists (
    select 1
    from public.fila_cero_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.fila_cero_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

-- Privilegios mínimos de Data API. RLS sigue aplicándose.
grant usage on schema public to anon, authenticated;
grant select on public.fila_cero_businesses to anon, authenticated;
grant select on public.fila_cero_slots to anon, authenticated;
grant insert, update, delete on public.fila_cero_businesses to authenticated;
grant insert, update, delete on public.fila_cero_slots to authenticated;
grant select, update on public.fila_cero_reservations to authenticated;

revoke insert, delete on public.fila_cero_reservations from anon;
revoke insert, delete on public.fila_cero_reservations from authenticated;

-- --------------------------------------------------------------------------
-- 7) STORAGE EXCLUSIVO DE FILA CERO
-- --------------------------------------------------------------------------
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'fila-cero-portfolio',
  'fila-cero-portfolio',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fila_cero_portfolio_owner_insert on storage.objects;
drop policy if exists fila_cero_portfolio_owner_update on storage.objects;
drop policy if exists fila_cero_portfolio_owner_delete on storage.objects;

create policy fila_cero_portfolio_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fila-cero-portfolio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy fila_cero_portfolio_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'fila-cero-portfolio'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'fila-cero-portfolio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy fila_cero_portfolio_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fila-cero-portfolio'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- --------------------------------------------------------------------------
-- 8) REALTIME — SOLO TABLAS FILA CERO
-- --------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fila_cero_businesses'
    ) then
      execute 'alter publication supabase_realtime add table public.fila_cero_businesses';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fila_cero_slots'
    ) then
      execute 'alter publication supabase_realtime add table public.fila_cero_slots';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fila_cero_reservations'
    ) then
      execute 'alter publication supabase_realtime add table public.fila_cero_reservations';
    end if;
  else
    raise notice 'No existe la publicación supabase_realtime. Las tablas se crearon, pero Realtime debe habilitarse desde Supabase.';
  end if;
end $$;

commit;

-- ============================================================================
-- FIN
-- Tablas creadas:
--   public.fila_cero_businesses
--   public.fila_cero_slots
--   public.fila_cero_reservations
-- RPC:
--   public.fila_cero_book_slot(...)
-- Storage:
--   fila-cero-portfolio
--
-- NO SE BORRAN las tablas genéricas businesses / slots / reservations.
-- ============================================================================
