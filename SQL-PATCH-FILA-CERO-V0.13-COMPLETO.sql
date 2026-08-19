-- ============================================================================
-- FILA CERO v0.13 — USUARIOS, FAVORITOS, RESEÑAS, ALERTAS, STATS Y MODERACIÓN
-- ============================================================================
-- Seguro para Supabase compartido: SOLO crea/modifica objetos fila_cero_*.
-- NO elimina usuarios de auth.users ni modifica tablas optica_*, hipso_*, etc.
-- ============================================================================

begin;

-- 1) CAMPOS NUEVOS EN EMPRESAS Y RESERVAS -----------------------------------
alter table public.fila_cero_businesses
  add column if not exists profile_enabled boolean not null default true,
  add column if not exists is_verified boolean not null default false,
  add column if not exists views_count bigint not null default 0;

alter table public.fila_cero_reservations
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;

create index if not exists fila_cero_reservations_customer_user_idx
  on public.fila_cero_reservations(customer_user_id);

-- El usuario dueño puede editar su perfil, pero NO auto-verificarse ni alterar vistas.
revoke insert,update on public.fila_cero_businesses from authenticated;
grant insert(owner_id,name,category,description,city,sector,address,whatsapp,instagram,website,portfolio_urls,latitude,longitude,is_active,profile_enabled)
  on public.fila_cero_businesses to authenticated;
grant update(name,category,description,city,sector,address,whatsapp,instagram,website,portfolio_urls,latitude,longitude,is_active,profile_enabled)
  on public.fila_cero_businesses to authenticated;

-- Asegura el rol admin exclusivo de Fila Cero (sin tocar auth.users).
create table if not exists public.fila_cero_admins (
  email text primary key,
  created_at timestamptz not null default now()
);
insert into public.fila_cero_admins(email) values ('martinub250@gmail.com') on conflict(email) do nothing;
alter table public.fila_cero_admins enable row level security;
revoke all on public.fila_cero_admins from anon,authenticated;

create or replace function public.fila_cero_is_admin()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(select 1 from public.fila_cero_admins a where lower(a.email)=lower(coalesce(auth.jwt()->>'email','')));
$$;
revoke all on function public.fila_cero_is_admin() from public,anon;
grant execute on function public.fila_cero_is_admin() to authenticated;

-- 2) FAVORITOS ---------------------------------------------------------------
create table if not exists public.fila_cero_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.fila_cero_businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id,business_id)
);
create index if not exists fila_cero_favorites_user_idx on public.fila_cero_favorites(user_id);
create index if not exists fila_cero_favorites_business_idx on public.fila_cero_favorites(business_id);
alter table public.fila_cero_favorites enable row level security;

drop policy if exists fila_cero_favorites_own_select on public.fila_cero_favorites;
create policy fila_cero_favorites_own_select on public.fila_cero_favorites
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists fila_cero_favorites_own_insert on public.fila_cero_favorites;
create policy fila_cero_favorites_own_insert on public.fila_cero_favorites
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists fila_cero_favorites_own_delete on public.fila_cero_favorites;
create policy fila_cero_favorites_own_delete on public.fila_cero_favorites
for delete to authenticated using (user_id = (select auth.uid()));
grant select,insert,delete on public.fila_cero_favorites to authenticated;

-- 3) RESEÑAS -----------------------------------------------------------------
create table if not exists public.fila_cero_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.fila_cero_businesses(id) on delete cascade,
  reservation_id uuid not null unique references public.fila_cero_reservations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  status text not null default 'visible' check (status in ('visible','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fila_cero_reviews_business_idx on public.fila_cero_reviews(business_id,created_at desc);
create index if not exists fila_cero_reviews_user_idx on public.fila_cero_reviews(user_id);
alter table public.fila_cero_reviews enable row level security;

drop policy if exists fila_cero_reviews_public_read on public.fila_cero_reviews;
create policy fila_cero_reviews_public_read on public.fila_cero_reviews
for select to anon,authenticated using (status='visible' or user_id=(select auth.uid()));
revoke select on public.fila_cero_reviews from anon,authenticated;
grant select(id,business_id,reservation_id,rating,comment,status,created_at,updated_at) on public.fila_cero_reviews to anon,authenticated;

-- Enviar reseña solo después de una reserva propia y una hora ya iniciada.
create or replace function public.fila_cero_submit_review(
  p_reservation_id uuid,
  p_rating integer,
  p_comment text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.fila_cero_reservations%rowtype;
  v_slot public.fila_cero_slots%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='AUTH_REQUIRED'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception using errcode='P0001', message='INVALID_RATING'; end if;

  select * into v_res from public.fila_cero_reservations where id=p_reservation_id;
  if not found then raise exception using errcode='P0001', message='RESERVATION_NOT_FOUND'; end if;
  if v_res.customer_user_id is distinct from auth.uid() then
    raise exception using errcode='42501', message='REVIEW_NOT_ALLOWED';
  end if;
  if v_res.status='cancelled' then raise exception using errcode='P0001', message='CANCELLED_RESERVATION'; end if;

  select * into v_slot from public.fila_cero_slots where id=v_res.slot_id;
  if not found then raise exception using errcode='P0001', message='SLOT_NOT_FOUND'; end if;
  if (v_slot.slot_date + v_slot.start_time) > (now() at time zone 'America/Santiago') then
    raise exception using errcode='P0001', message='REVIEW_TOO_EARLY';
  end if;

  insert into public.fila_cero_reviews(business_id,reservation_id,user_id,rating,comment,status)
  values(v_res.business_id,v_res.id,auth.uid(),p_rating,left(trim(coalesce(p_comment,'')),1500),'visible')
  on conflict(reservation_id) do update set
    rating=excluded.rating, comment=excluded.comment, status='visible', updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.fila_cero_submit_review(uuid,integer,text) from public,anon;
grant execute on function public.fila_cero_submit_review(uuid,integer,text) to authenticated;

-- 4) ALERTAS Y NOTIFICACIONES ------------------------------------------------
create table if not exists public.fila_cero_alert_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text,
  city text,
  business_id uuid references public.fila_cero_businesses(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint fila_cero_alert_category_check check (category is null or category in ('Psicología','Dental','Kinesiología','Veterinaria','Nutrición','Otro')),
  constraint fila_cero_alert_city_check check (city is null or city in ('Concepción','Talcahuano','Hualpén','San Pedro de la Paz','Chiguayante','Penco','Tomé','Hualqui','Coronel','Lota','Santa Juana'))
);
create index if not exists fila_cero_alert_preferences_user_idx on public.fila_cero_alert_preferences(user_id);
alter table public.fila_cero_alert_preferences enable row level security;

drop policy if exists fila_cero_alerts_own_all on public.fila_cero_alert_preferences;
create policy fila_cero_alerts_own_all on public.fila_cero_alert_preferences
for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select,insert,update,delete on public.fila_cero_alert_preferences to authenticated;

create table if not exists public.fila_cero_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'new_slot',
  title text not null,
  body text not null default '',
  business_id uuid references public.fila_cero_businesses(id) on delete cascade,
  slot_id uuid references public.fila_cero_slots(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,slot_id,type)
);
create index if not exists fila_cero_notifications_user_idx on public.fila_cero_notifications(user_id,created_at desc);
alter table public.fila_cero_notifications enable row level security;

drop policy if exists fila_cero_notifications_own_select on public.fila_cero_notifications;
create policy fila_cero_notifications_own_select on public.fila_cero_notifications
for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists fila_cero_notifications_own_update on public.fila_cero_notifications;
create policy fila_cero_notifications_own_update on public.fila_cero_notifications
for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists fila_cero_notifications_own_delete on public.fila_cero_notifications;
create policy fila_cero_notifications_own_delete on public.fila_cero_notifications
for delete to authenticated using (user_id=(select auth.uid()));
grant select,update,delete on public.fila_cero_notifications to authenticated;

create or replace function public.fila_cero_notify_new_slot()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_business_name text;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op='UPDATE' and old.status='active' then return new; end if;
  select name into v_business_name from public.fila_cero_businesses where id=new.business_id and is_active=true;
  if v_business_name is null then return new; end if;

  insert into public.fila_cero_notifications(user_id,type,title,body,business_id,slot_id)
  select distinct a.user_id,'new_slot','Nueva hora disponible',
    v_business_name || ' publicó ' || new.service || ' para ' || to_char(new.slot_date,'DD/MM') || ' a las ' || left(new.start_time::text,5),
    new.business_id,new.id
  from public.fila_cero_alert_preferences a
  where a.enabled=true
    and (a.category is null or a.category=new.category)
    and (a.city is null or a.city=new.city)
    and (a.business_id is null or a.business_id=new.business_id)
  on conflict(user_id,slot_id,type) do nothing;
  return new;
end;
$$;

drop trigger if exists fila_cero_slot_notifications on public.fila_cero_slots;
create trigger fila_cero_slot_notifications
after insert or update of status on public.fila_cero_slots
for each row execute function public.fila_cero_notify_new_slot();

-- 5) REPORTES / MODERACIÓN ---------------------------------------------------
create table if not exists public.fila_cero_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.fila_cero_businesses(id) on delete cascade,
  slot_id uuid references public.fila_cero_slots(id) on delete set null,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check(status in ('open','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fila_cero_reports_business_idx on public.fila_cero_reports(business_id,created_at desc);
create index if not exists fila_cero_reports_status_idx on public.fila_cero_reports(status);
alter table public.fila_cero_reports enable row level security;

drop policy if exists fila_cero_reports_own_insert on public.fila_cero_reports;
create policy fila_cero_reports_own_insert on public.fila_cero_reports
for insert to authenticated with check (reporter_user_id=(select auth.uid()));
drop policy if exists fila_cero_reports_own_select on public.fila_cero_reports;
create policy fila_cero_reports_own_select on public.fila_cero_reports
for select to authenticated using (reporter_user_id=(select auth.uid()));
grant select on public.fila_cero_reports to authenticated;
grant insert(reporter_user_id,business_id,slot_id,reason,details) on public.fila_cero_reports to authenticated;

create or replace function public.fila_cero_admin_list_reports()
returns table(
  id uuid, reporter_user_id uuid, reporter_email text, business_id uuid, business_name text,
  slot_id uuid, reason text, details text, status text, created_at timestamptz
)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.fila_cero_is_admin() then
    raise exception using errcode='42501',message='FILA_CERO_ADMIN_REQUIRED';
  end if;
  return query
  select r.id,r.reporter_user_id,u.email::text,r.business_id,b.name,r.slot_id,r.reason,r.details,r.status,r.created_at
  from public.fila_cero_reports r
  join public.fila_cero_businesses b on b.id=r.business_id
  left join auth.users u on u.id=r.reporter_user_id
  order by case when r.status='open' then 0 else 1 end,r.created_at desc;
end;$$;
revoke all on function public.fila_cero_admin_list_reports() from public,anon;
grant execute on function public.fila_cero_admin_list_reports() to authenticated;

create or replace function public.fila_cero_admin_update_report(p_report_id uuid,p_status text)
returns boolean
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.fila_cero_is_admin() then
    raise exception using errcode='42501',message='FILA_CERO_ADMIN_REQUIRED';
  end if;
  if p_status not in ('open','reviewed','dismissed','actioned') then
    raise exception using errcode='P0001',message='INVALID_REPORT_STATUS';
  end if;
  update public.fila_cero_reports set status=p_status,updated_at=now() where id=p_report_id;
  return found;
end;$$;
revoke all on function public.fila_cero_admin_update_report(uuid,text) from public,anon;
grant execute on function public.fila_cero_admin_update_report(uuid,text) to authenticated;

-- 6) VERIFICACIÓN Y ESTADÍSTICAS --------------------------------------------
create or replace function public.fila_cero_admin_set_verified(p_business_id uuid,p_verified boolean)
returns boolean
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.fila_cero_is_admin() then
    raise exception using errcode='42501',message='FILA_CERO_ADMIN_REQUIRED';
  end if;
  update public.fila_cero_businesses set is_verified=coalesce(p_verified,false),updated_at=now() where id=p_business_id;
  return found;
end;$$;
revoke all on function public.fila_cero_admin_set_verified(uuid,boolean) from public,anon;
grant execute on function public.fila_cero_admin_set_verified(uuid,boolean) to authenticated;

create or replace function public.fila_cero_record_profile_view(p_business_id uuid)
returns bigint
language plpgsql security definer set search_path=''
as $$
declare v_count bigint;
begin
  update public.fila_cero_businesses set views_count=views_count+1 where id=p_business_id and is_active=true
  returning views_count into v_count;
  return coalesce(v_count,0);
end;$$;
revoke all on function public.fila_cero_record_profile_view(uuid) from public;
grant execute on function public.fila_cero_record_profile_view(uuid) to anon,authenticated;

create or replace function public.fila_cero_business_stats()
returns table(
  profile_views bigint,
  slots_total bigint,
  slots_active bigint,
  reservations_total bigint,
  reservations_confirmed bigint,
  reservations_cancelled bigint,
  reviews_total bigint,
  rating_average numeric,
  conversion_rate numeric
)
language plpgsql security definer set search_path=''
as $$
declare v_business_id uuid; v_views bigint;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select id,views_count into v_business_id,v_views from public.fila_cero_businesses where owner_id=auth.uid();
  if v_business_id is null then raise exception using errcode='P0001',message='FILA_CERO_BUSINESS_NOT_FOUND'; end if;
  return query
  select
    v_views,
    (select count(*) from public.fila_cero_slots where business_id=v_business_id),
    (select count(*) from public.fila_cero_slots where business_id=v_business_id and status='active' and (slot_date+start_time)>=(now() at time zone 'America/Santiago')),
    (select count(*) from public.fila_cero_reservations where business_id=v_business_id),
    (select count(*) from public.fila_cero_reservations where business_id=v_business_id and status='confirmed'),
    (select count(*) from public.fila_cero_reservations where business_id=v_business_id and status='cancelled'),
    (select count(*) from public.fila_cero_reviews where business_id=v_business_id and status='visible'),
    coalesce((select round(avg(rating)::numeric,2) from public.fila_cero_reviews where business_id=v_business_id and status='visible'),0),
    case when v_views>0 then round(((select count(*) from public.fila_cero_reservations where business_id=v_business_id)::numeric/v_views::numeric)*100,2) else 0 end;
end;$$;
revoke all on function public.fila_cero_business_stats() from public,anon;
grant execute on function public.fila_cero_business_stats() to authenticated;

-- Admin list enriquecida v13 (se conserva la función anterior para compatibilidad)
create or replace function public.fila_cero_admin_list_businesses_v13()
returns table (
  id uuid, owner_id uuid, owner_email text, name text, category text, description text,
  city text, sector text, address text, whatsapp text, instagram text, website text,
  portfolio_urls text[], profile_enabled boolean, is_active boolean, is_verified boolean,
  views_count bigint, created_at timestamptz, updated_at timestamptz,
  slots_total bigint, reservations_total bigint, reviews_total bigint, rating_average numeric
)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.fila_cero_is_admin() then
    raise exception using errcode='42501',message='FILA_CERO_ADMIN_REQUIRED';
  end if;
  return query
  select b.id,b.owner_id,u.email::text,b.name,b.category,b.description,b.city,b.sector,b.address,b.whatsapp,b.instagram,b.website,
    b.portfolio_urls,b.profile_enabled,b.is_active,b.is_verified,b.views_count,b.created_at,b.updated_at,
    (select count(*) from public.fila_cero_slots s where s.business_id=b.id)::bigint,
    (select count(*) from public.fila_cero_reservations r where r.business_id=b.id)::bigint,
    (select count(*) from public.fila_cero_reviews rv where rv.business_id=b.id and rv.status='visible')::bigint,
    coalesce((select round(avg(rv.rating)::numeric,2) from public.fila_cero_reviews rv where rv.business_id=b.id and rv.status='visible'),0)
  from public.fila_cero_businesses b left join auth.users u on u.id=b.owner_id order by b.created_at desc;
end;$$;
revoke all on function public.fila_cero_admin_list_businesses_v13() from public,anon;
grant execute on function public.fila_cero_admin_list_businesses_v13() to authenticated;

-- 7) HISTORIAL: ASOCIAR RESERVAS A LA CUENTA --------------------------------
create or replace function public.fila_cero_claim_reservations()
returns integer
language plpgsql security definer set search_path=''
as $$
declare v_email text; v_count integer;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_email=lower(coalesce(auth.jwt()->>'email',''));
  update public.fila_cero_reservations
  set customer_user_id=auth.uid(),updated_at=now()
  where customer_user_id is null and lower(client_email)=v_email;
  get diagnostics v_count=row_count;
  return v_count;
end;$$;
revoke all on function public.fila_cero_claim_reservations() from public,anon;
grant execute on function public.fila_cero_claim_reservations() to authenticated;

-- Permitir a cada cliente autenticado leer SU historial.
drop policy if exists fila_cero_reservations_customer_read on public.fila_cero_reservations;
create policy fila_cero_reservations_customer_read on public.fila_cero_reservations
for select to authenticated using (customer_user_id=(select auth.uid()));

-- Actualizar reserva atómica para guardar customer_user_id si hay sesión.
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
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_slot public.fila_cero_slots%rowtype; v_reservation_id uuid;
begin
  if length(trim(coalesce(p_client_name,'')))<2 then raise exception using errcode='P0001',message='CLIENT_NAME_REQUIRED'; end if;
  if length(trim(coalesce(p_client_email,'')))<5 then raise exception using errcode='P0001',message='CLIENT_EMAIL_REQUIRED'; end if;
  if length(trim(coalesce(p_client_phone,'')))<6 then raise exception using errcode='P0001',message='CLIENT_PHONE_REQUIRED'; end if;
  select s.* into v_slot from public.fila_cero_slots s join public.fila_cero_businesses b on b.id=s.business_id
  where s.id=p_slot_id and s.status='active' and b.is_active=true and (s.slot_date+s.start_time)>=(now() at time zone 'America/Santiago') for update of s;
  if not found then raise exception using errcode='P0001',message='SLOT_UNAVAILABLE'; end if;
  insert into public.fila_cero_reservations(slot_id,business_id,client_name,client_email,client_phone,customer_user_id,status)
  values(v_slot.id,v_slot.business_id,trim(p_client_name),lower(trim(p_client_email)),trim(p_client_phone),auth.uid(),'confirmed')
  returning id into v_reservation_id;
  update public.fila_cero_slots set status='reserved' where id=v_slot.id;
  return query select v_reservation_id,v_slot.id,v_slot.business_id,'confirmed'::text;
end;$$;
revoke all on function public.fila_cero_book_slot(uuid,text,text,text) from public;
grant execute on function public.fila_cero_book_slot(uuid,text,text,text) to anon,authenticated;

-- 8) REALTIME SOLO PARA OBJETOS DE FILA CERO ---------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fila_cero_notifications') then
    execute 'alter publication supabase_realtime add table public.fila_cero_notifications';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fila_cero_reviews') then
    execute 'alter publication supabase_realtime add table public.fila_cero_reviews';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fila_cero_reports') then
    execute 'alter publication supabase_realtime add table public.fila_cero_reports';
  end if;
end $$;

commit;

-- FIN v0.13
