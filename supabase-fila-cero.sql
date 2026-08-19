-- ================================================================
-- FILA CERO — SUPABASE DATABASE v0.6
-- Gran Concepción
-- Pegar completo en Supabase > SQL Editor > New query > Run
-- ================================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------
-- 1) EMPRESAS / PROFESIONALES
-- ------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
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
  constraint businesses_city_check check (
    city in (
      'Concepción','Talcahuano','Hualpén','San Pedro de la Paz',
      'Chiguayante','Penco','Tomé','Hualqui','Coronel','Lota','Santa Juana'
    )
  ),
  constraint businesses_category_check check (
    category in ('Psicología','Dental','Kinesiología','Veterinaria','Nutrición','Otro')
  )
);

create index if not exists businesses_city_idx on public.businesses(city);
create index if not exists businesses_category_idx on public.businesses(category);
create index if not exists businesses_active_idx on public.businesses(is_active);

-- ------------------------------------------------
-- 2) CUPOS / HORAS PUBLICADAS
-- ------------------------------------------------
create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
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
  constraint slots_category_check check (
    category in ('Psicología','Dental','Kinesiología','Veterinaria','Nutrición','Otro')
  ),
  constraint slots_city_check check (
    city in (
      'Concepción','Talcahuano','Hualpén','San Pedro de la Paz',
      'Chiguayante','Penco','Tomé','Hualqui','Coronel','Lota','Santa Juana'
    )
  ),
  constraint slots_status_check check (status in ('active','reserved','cancelled','completed')),
  constraint slots_duration_check check (duration_minutes between 10 and 480),
  constraint slots_price_check check (normal_price >= 0 and fila_price >= 0 and fila_price <= normal_price)
);

create index if not exists slots_business_idx on public.slots(business_id);
create index if not exists slots_status_idx on public.slots(status);
create index if not exists slots_schedule_idx on public.slots(slot_date, start_time);
create index if not exists slots_city_category_idx on public.slots(city, category);

-- ------------------------------------------------
-- 3) RESERVAS
-- ------------------------------------------------
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null unique references public.slots(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_name text not null,
  client_email text not null,
  client_phone text not null,
  status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_status_check check (status in ('confirmed','cancelled','completed'))
);

create index if not exists reservations_business_idx on public.reservations(business_id);
create index if not exists reservations_created_idx on public.reservations(created_at desc);

-- ------------------------------------------------
-- 4) updated_at automático
-- ------------------------------------------------
create or replace function public.set_updated_at()
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

drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

drop trigger if exists trg_slots_updated_at on public.slots;
create trigger trg_slots_updated_at
before update on public.slots
for each row execute function public.set_updated_at();

drop trigger if exists trg_reservations_updated_at on public.reservations;
create trigger trg_reservations_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

-- ------------------------------------------------
-- 5) Crear empresa automáticamente al registrarse
--    Funciona con correo/contraseña y Google OAuth.
-- ------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Mi empresa'
  );

  insert into public.businesses (owner_id, name)
  values (new.id, v_name)
  on conflict (owner_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Si ya existía algún usuario Auth antes de correr este SQL, crea su empresa.
insert into public.businesses (owner_id, name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'business_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Mi empresa'
  )
from auth.users u
on conflict (owner_id) do nothing;

-- ------------------------------------------------
-- 6) RESERVA ATÓMICA: evita doble reserva
-- ------------------------------------------------
create or replace function public.book_slot(
  p_slot_id uuid,
  p_client_name text,
  p_client_email text,
  p_client_phone text
)
returns table (
  reservation_id uuid,
  slot_id uuid,
  business_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.slots%rowtype;
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
  from public.slots s
  join public.businesses b on b.id = s.business_id
  where s.id = p_slot_id
    and s.status = 'active'
    and b.is_active = true
    and (s.slot_date + s.start_time) >= (now() at time zone 'America/Santiago')
  for update of s;

  if not found then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  insert into public.reservations (
    slot_id, business_id, client_name, client_email, client_phone, status
  ) values (
    v_slot.id,
    v_slot.business_id,
    trim(p_client_name),
    lower(trim(p_client_email)),
    trim(p_client_phone),
    'confirmed'
  )
  returning id into v_reservation_id;

  update public.slots
  set status = 'reserved'
  where id = v_slot.id;

  return query
  select v_reservation_id, v_slot.id, v_slot.business_id, 'confirmed'::text;
end;
$$;

revoke all on function public.book_slot(uuid,text,text,text) from public;
grant execute on function public.book_slot(uuid,text,text,text) to anon, authenticated;

-- ------------------------------------------------
-- 7) ROW LEVEL SECURITY
-- ------------------------------------------------
alter table public.businesses enable row level security;
alter table public.slots enable row level security;
alter table public.reservations enable row level security;

-- Limpiar políticas si vuelves a ejecutar el script.
drop policy if exists businesses_public_read on public.businesses;
drop policy if exists businesses_owner_insert on public.businesses;
drop policy if exists businesses_owner_update on public.businesses;
drop policy if exists businesses_owner_delete on public.businesses;

drop policy if exists slots_public_and_owner_read on public.slots;
drop policy if exists slots_owner_insert on public.slots;
drop policy if exists slots_owner_update on public.slots;
drop policy if exists slots_owner_delete on public.slots;

drop policy if exists reservations_owner_read on public.reservations;
drop policy if exists reservations_owner_update on public.reservations;

create policy businesses_public_read
on public.businesses
for select
to anon, authenticated
using (is_active = true or owner_id = (select auth.uid()));

create policy businesses_owner_insert
on public.businesses
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy businesses_owner_update
on public.businesses
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy businesses_owner_delete
on public.businesses
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy slots_public_and_owner_read
on public.slots
for select
to anon, authenticated
using (
  (
    status = 'active'
    and (slot_date + start_time) >= (now() at time zone 'America/Santiago')
    and exists (
      select 1 from public.businesses b
      where b.id = business_id and b.is_active = true
    )
  )
  or exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy slots_owner_insert
on public.slots
for insert
to authenticated
with check (
  exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy slots_owner_update
on public.slots
for update
to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy slots_owner_delete
on public.slots
for delete
to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy reservations_owner_read
on public.reservations
for select
to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

create policy reservations_owner_update
on public.reservations
for update
to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

-- Privilegios mínimos de la Data API.
grant usage on schema public to anon, authenticated;
grant select on public.businesses to anon, authenticated;
grant select on public.slots to anon, authenticated;
grant insert, update, delete on public.businesses to authenticated;
grant insert, update, delete on public.slots to authenticated;
grant select, update on public.reservations to authenticated;

-- No permitimos INSERT público directo en reservations: se usa book_slot().
revoke insert, delete on public.reservations from anon;
revoke insert, delete on public.reservations from authenticated;

-- ------------------------------------------------
-- 8) SUPABASE STORAGE — PORTAFOLIO DE EMPRESAS
-- ------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-portfolio',
  'business-portfolio',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists portfolio_owner_insert on storage.objects;
drop policy if exists portfolio_owner_update on storage.objects;
drop policy if exists portfolio_owner_delete on storage.objects;

create policy portfolio_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-portfolio'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy portfolio_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-portfolio'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
)
with check (
  bucket_id = 'business-portfolio'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy portfolio_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-portfolio'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

-- ------------------------------------------------
-- 9) REALTIME
-- ------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'businesses'
  ) then
    execute 'alter publication supabase_realtime add table public.businesses';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'slots'
  ) then
    execute 'alter publication supabase_realtime add table public.slots';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
  ) then
    execute 'alter publication supabase_realtime add table public.reservations';
  end if;
end $$;

commit;

-- ================================================================
-- LISTO.
-- Después de ejecutar:
-- 1) Authentication > Providers > Google (opcional) para activar OAuth.
-- 2) Authentication > URL Configuration: agrega tu URL local y producción.
-- 3) Prueba creando una cuenta desde Fila Cero.
-- ================================================================
