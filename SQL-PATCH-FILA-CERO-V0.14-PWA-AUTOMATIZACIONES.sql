-- FILA CERO v0.14 — PWA + PUSH + RECORDATORIOS + ABONOS
-- Aislado: solo crea/modifica objetos con prefijo fila_cero_.
-- Requiere haber aplicado v0.7, v0.9, v0.10, v0.13.

begin;

-- ---------------------------------------------------------------------------
-- 1) CUPOS CON ABONO OPCIONAL
-- ---------------------------------------------------------------------------
alter table public.fila_cero_slots
  add column if not exists requires_deposit boolean not null default false,
  add column if not exists deposit_amount integer not null default 0;

alter table public.fila_cero_slots
  drop constraint if exists fila_cero_slots_deposit_check;
alter table public.fila_cero_slots
  add constraint fila_cero_slots_deposit_check check (
    deposit_amount >= 0
    and deposit_amount <= fila_price
    and (requires_deposit = false or deposit_amount > 0)
  );

-- ---------------------------------------------------------------------------
-- 2) RESERVAS: PAGO + RECORDATORIOS
-- ---------------------------------------------------------------------------
alter table public.fila_cero_reservations
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists payment_provider text,
  add column if not exists payment_provider_id text,
  add column if not exists payment_preference_id text,
  add column if not exists payment_amount integer not null default 0,
  add column if not exists payment_access_token uuid not null default gen_random_uuid(),
  add column if not exists payment_expires_at timestamptz,
  add column if not exists reminder_email boolean not null default true,
  add column if not exists reminder_whatsapp boolean not null default false,
  add column if not exists reminder_push boolean not null default true;

alter table public.fila_cero_reservations
  drop constraint if exists fila_cero_reservations_status_check;
alter table public.fila_cero_reservations
  add constraint fila_cero_reservations_status_check check (
    status in ('pending_payment','confirmed','cancelled','completed')
  );

alter table public.fila_cero_reservations
  drop constraint if exists fila_cero_reservations_payment_status_check;
alter table public.fila_cero_reservations
  add constraint fila_cero_reservations_payment_status_check check (
    payment_status in ('not_required','pending','paid','failed','refunded')
  );

create unique index if not exists fila_cero_reservation_payment_token_idx
  on public.fila_cero_reservations(payment_access_token);
create index if not exists fila_cero_reservation_payment_expiry_idx
  on public.fila_cero_reservations(payment_expires_at)
  where status='pending_payment';

-- ---------------------------------------------------------------------------
-- 3) SUSCRIPCIONES WEB PUSH
-- ---------------------------------------------------------------------------
create table if not exists public.fila_cero_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.fila_cero_push_subscriptions enable row level security;

drop policy if exists fila_cero_push_own_select on public.fila_cero_push_subscriptions;
create policy fila_cero_push_own_select on public.fila_cero_push_subscriptions
for select to authenticated using (user_id=(select auth.uid()));

drop policy if exists fila_cero_push_own_insert on public.fila_cero_push_subscriptions;
create policy fila_cero_push_own_insert on public.fila_cero_push_subscriptions
for insert to authenticated with check (user_id=(select auth.uid()));

drop policy if exists fila_cero_push_own_update on public.fila_cero_push_subscriptions;
create policy fila_cero_push_own_update on public.fila_cero_push_subscriptions
for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists fila_cero_push_own_delete on public.fila_cero_push_subscriptions;
create policy fila_cero_push_own_delete on public.fila_cero_push_subscriptions
for delete to authenticated using (user_id=(select auth.uid()));

grant select,insert,update,delete on public.fila_cero_push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- 4) COLA DE ENTREGAS: PUSH / EMAIL / WHATSAPP
-- ---------------------------------------------------------------------------
create table if not exists public.fila_cero_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  reservation_id uuid references public.fila_cero_reservations(id) on delete cascade,
  notification_id uuid references public.fila_cero_notifications(id) on delete cascade,
  channel text not null check(channel in ('push','email','whatsapp')),
  event_type text not null,
  due_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists fila_cero_delivery_due_idx
  on public.fila_cero_delivery_queue(status,due_at);
create unique index if not exists fila_cero_delivery_dedupe_idx
  on public.fila_cero_delivery_queue(
    coalesce(reservation_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(notification_id,'00000000-0000-0000-0000-000000000000'::uuid),
    channel,event_type
  );

alter table public.fila_cero_delivery_queue enable row level security;
revoke all on public.fila_cero_delivery_queue from anon,authenticated;

-- ---------------------------------------------------------------------------
-- 5) REGISTRO DE PAGOS (AUDITORÍA FILA CERO)
-- ---------------------------------------------------------------------------
create table if not exists public.fila_cero_payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.fila_cero_reservations(id) on delete cascade,
  provider text not null default 'mercadopago',
  provider_payment_id text,
  preference_id text,
  amount integer not null default 0,
  status text not null default 'pending',
  raw_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,provider_payment_id)
);

create index if not exists fila_cero_payments_reservation_idx
  on public.fila_cero_payments(reservation_id,created_at desc);
alter table public.fila_cero_payments enable row level security;
revoke all on public.fila_cero_payments from anon,authenticated;

-- ---------------------------------------------------------------------------
-- 6) RESERVA ATÓMICA
-- La función fila_cero_start_booking se crea inmediatamente después del helper
-- que libera holds vencidos (sección 7).

-- ---------------------------------------------------------------------------
-- 7) LIBERAR HOLD DE PAGO VENCIDO
-- ---------------------------------------------------------------------------
create or replace function public.fila_cero_release_expired_payment_holds()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer:=0;
begin
  with expired as (
    select r.id,r.slot_id
    from public.fila_cero_reservations r
    where r.status='pending_payment'
      and r.payment_status='pending'
      and r.payment_expires_at is not null
      and r.payment_expires_at<now()
    for update skip locked
  ), reopened as (
    update public.fila_cero_slots s
       set status='active',updated_at=now()
      from expired e
     where s.id=e.slot_id and s.status='reserved'
    returning s.id
  ), deleted as (
    delete from public.fila_cero_reservations r
     using expired e
     where r.id=e.id
    returning r.id
  )
  select count(*) into v_count from deleted;
  return v_count;
end;
$$;
revoke all on function public.fila_cero_release_expired_payment_holds() from public,anon,authenticated;
grant execute on function public.fila_cero_release_expired_payment_holds() to service_role;

-- Recreate start_booking now that release helper definitely exists.
create or replace function public.fila_cero_start_booking(
  p_slot_id uuid,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_reminder_email boolean default true,
  p_reminder_whatsapp boolean default false,
  p_reminder_push boolean default true
)
returns table (
  reservation_id uuid,
  reserved_slot_id uuid,
  reserved_business_id uuid,
  reservation_status text,
  payment_required boolean,
  payment_amount integer,
  payment_access_token uuid,
  payment_expires_at timestamptz
)
language plpgsql security definer set search_path=public,pg_temp
as $$ declare
  v_slot public.fila_cero_slots%rowtype; v_reservation_id uuid; v_token uuid;
  v_status text; v_payment_status text; v_expiry timestamptz;
begin
  if length(trim(coalesce(p_client_name,'')))<2 then raise exception using errcode='P0001',message='CLIENT_NAME_REQUIRED'; end if;
  if length(trim(coalesce(p_client_email,'')))<5 then raise exception using errcode='P0001',message='CLIENT_EMAIL_REQUIRED'; end if;
  if length(trim(coalesce(p_client_phone,'')))<6 then raise exception using errcode='P0001',message='CLIENT_PHONE_REQUIRED'; end if;
  perform public.fila_cero_release_expired_payment_holds();
  select s.* into v_slot from public.fila_cero_slots s join public.fila_cero_businesses b on b.id=s.business_id
   where s.id=p_slot_id and s.status='active' and b.is_active=true
     and (s.slot_date+s.start_time)>=(now() at time zone 'America/Santiago') for update of s;
  if not found then raise exception using errcode='P0001',message='SLOT_UNAVAILABLE'; end if;
  if v_slot.requires_deposit and v_slot.deposit_amount>0 then
    v_status:='pending_payment';v_payment_status:='pending';v_expiry:=now()+interval '15 minutes';
  else v_status:='confirmed';v_payment_status:='not_required';v_expiry:=null; end if;
  insert into public.fila_cero_reservations(slot_id,business_id,client_name,client_email,client_phone,customer_user_id,status,
    payment_status,payment_provider,payment_amount,payment_expires_at,reminder_email,reminder_whatsapp,reminder_push)
  values(v_slot.id,v_slot.business_id,trim(p_client_name),lower(trim(p_client_email)),trim(p_client_phone),auth.uid(),v_status,
    v_payment_status,case when v_status='pending_payment' then 'mercadopago' else null end,
    case when v_status='pending_payment' then v_slot.deposit_amount else 0 end,v_expiry,
    coalesce(p_reminder_email,true),coalesce(p_reminder_whatsapp,false),coalesce(p_reminder_push,true))
  returning id,payment_access_token into v_reservation_id,v_token;
  update public.fila_cero_slots set status='reserved' where id=v_slot.id;
  return query select v_reservation_id,v_slot.id,v_slot.business_id,v_status,(v_status='pending_payment'),
    case when v_status='pending_payment' then v_slot.deposit_amount else 0 end,v_token,v_expiry;
end;$$;
revoke all on function public.fila_cero_start_booking(uuid,text,text,text,boolean,boolean,boolean) from public;
grant execute on function public.fila_cero_start_booking(uuid,text,text,text,boolean,boolean,boolean) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 8) CONSULTA PÚBLICA SEGURA DEL ESTADO DE UN PAGO (TOKEN ALEATORIO)
-- ---------------------------------------------------------------------------
create or replace function public.fila_cero_payment_status(
  p_reservation_id uuid,
  p_access_token uuid
)
returns table(
  reservation_id uuid,
  reservation_status text,
  payment_status text,
  payment_amount integer,
  payment_expires_at timestamptz,
  slot_id uuid,
  service text,
  category text,
  slot_date date,
  start_time time,
  duration_minutes integer,
  fila_price integer,
  business_id uuid,
  business_name text,
  city text,
  sector text,
  address text
)
language sql
security definer
set search_path=''
as $$
  select r.id,r.status,r.payment_status,r.payment_amount,r.payment_expires_at,
         s.id,s.service,s.category,s.slot_date,s.start_time,s.duration_minutes,s.fila_price,
         b.id,b.name,s.city,s.sector,s.address
  from public.fila_cero_reservations r
  join public.fila_cero_slots s on s.id=r.slot_id
  join public.fila_cero_businesses b on b.id=r.business_id
  where r.id=p_reservation_id and r.payment_access_token=p_access_token
  limit 1
$$;
revoke all on function public.fila_cero_payment_status(uuid,uuid) from public;
grant execute on function public.fila_cero_payment_status(uuid,uuid) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 9) RECORDATORIOS: CREA TAREAS AL CONFIRMAR UNA RESERVA
-- ---------------------------------------------------------------------------
create or replace function public.fila_cero_schedule_reservation_reminders()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_slot public.fila_cero_slots%rowtype;
  v_business public.fila_cero_businesses%rowtype;
  v_start timestamptz;
  v_payload jsonb;
begin
  if new.status<>'confirmed' then return new; end if;
  if tg_op='UPDATE' and old.status='confirmed' then return new; end if;

  select * into v_slot from public.fila_cero_slots where id=new.slot_id;
  select * into v_business from public.fila_cero_businesses where id=new.business_id;
  if v_slot.id is null then return new; end if;

  v_start:=((v_slot.slot_date+v_slot.start_time) at time zone 'America/Santiago');
  v_payload:=jsonb_build_object(
    'client_name',new.client_name,'client_email',new.client_email,'client_phone',new.client_phone,
    'service',v_slot.service,'business_name',coalesce(v_business.name,'Fila Cero'),
    'slot_date',v_slot.slot_date,'start_time',left(v_slot.start_time::text,5),
    'city',v_slot.city,'address',v_slot.address
  );

  -- 24 h antes
  if v_start-interval '24 hours'>now() then
    if new.reminder_email then
      insert into public.fila_cero_delivery_queue(user_id,reservation_id,channel,event_type,due_at,payload)
      values(new.customer_user_id,new.id,'email','reservation_24h',v_start-interval '24 hours',v_payload)
      on conflict do nothing;
    end if;
    if new.reminder_whatsapp then
      insert into public.fila_cero_delivery_queue(user_id,reservation_id,channel,event_type,due_at,payload)
      values(new.customer_user_id,new.id,'whatsapp','reservation_24h',v_start-interval '24 hours',v_payload)
      on conflict do nothing;
    end if;
    if new.reminder_push and new.customer_user_id is not null then
      insert into public.fila_cero_delivery_queue(user_id,reservation_id,channel,event_type,due_at,payload)
      values(new.customer_user_id,new.id,'push','reservation_24h',v_start-interval '24 hours',v_payload)
      on conflict do nothing;
    end if;
  end if;

  -- 2 h antes
  if v_start-interval '2 hours'>now() then
    if new.reminder_email then
      insert into public.fila_cero_delivery_queue(user_id,reservation_id,channel,event_type,due_at,payload)
      values(new.customer_user_id,new.id,'email','reservation_2h',v_start-interval '2 hours',v_payload)
      on conflict do nothing;
    end if;
    if new.reminder_whatsapp then
      insert into public.fila_cero_delivery_queue(user_id,reservation_id,channel,event_type,due_at,payload)
      values(new.customer_user_id,new.id,'whatsapp','reservation_2h',v_start-interval '2 hours',v_payload)
      on conflict do nothing;
    end if;
    if new.reminder_push and new.customer_user_id is not null then
      insert into public.fila_cero_delivery_queue(user_id,reservation_id,channel,event_type,due_at,payload)
      values(new.customer_user_id,new.id,'push','reservation_2h',v_start-interval '2 hours',v_payload)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;$$;

drop trigger if exists fila_cero_reservation_reminders on public.fila_cero_reservations;
create trigger fila_cero_reservation_reminders
after insert or update of status on public.fila_cero_reservations
for each row execute function public.fila_cero_schedule_reservation_reminders();

-- ---------------------------------------------------------------------------
-- 10) NUEVAS ALERTAS DE CUPOS -> PUSH REAL SI HAY SUSCRIPCIÓN
-- ---------------------------------------------------------------------------
create or replace function public.fila_cero_enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.fila_cero_delivery_queue(user_id,notification_id,channel,event_type,due_at,payload)
  values(new.user_id,new.id,'push',new.type,now(),jsonb_build_object(
    'title',new.title,'body',new.body,'business_id',new.business_id,'slot_id',new.slot_id,
    'url',case when new.slot_id is not null then 'index.html?book='||new.slot_id::text else 'cuenta.html#notificaciones' end
  )) on conflict do nothing;
  return new;
end;$$;

drop trigger if exists fila_cero_notification_push_queue on public.fila_cero_notifications;
create trigger fila_cero_notification_push_queue
after insert on public.fila_cero_notifications
for each row execute function public.fila_cero_enqueue_notification_push();

-- ---------------------------------------------------------------------------
-- 11) FUNCIONES SERVER-SIDE PARA EDGE FUNCTIONS
-- ---------------------------------------------------------------------------
create or replace function public.fila_cero_dispatch_claim(p_limit integer default 50)
returns setof public.fila_cero_delivery_queue
language plpgsql
security definer
set search_path=''
as $$
begin
  return query
  with picked as (
    select q.id from public.fila_cero_delivery_queue q
    where q.status='pending' and q.due_at<=now() and q.attempts<5
    order by q.due_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,50),100))
  ), upd as (
    update public.fila_cero_delivery_queue q
       set status='processing',attempts=q.attempts+1
      from picked p
     where q.id=p.id
    returning q.*
  ) select * from upd;
end;$$;
revoke all on function public.fila_cero_dispatch_claim(integer) from public,anon,authenticated;
grant execute on function public.fila_cero_dispatch_claim(integer) to service_role;

create or replace function public.fila_cero_dispatch_finish(p_id uuid,p_status text,p_error text default null)
returns boolean
language plpgsql security definer set search_path=''
as $$ begin
  update public.fila_cero_delivery_queue
     set status=case
           when p_status='sent' then 'sent'
           when p_status='skipped' then 'skipped'
           when p_status='failed' and attempts<5 then 'pending'
           else 'failed'
         end,
         due_at=case when p_status='failed' and attempts<5 then now()+interval '5 minutes' else due_at end,
         last_error=p_error,
         sent_at=case when p_status='sent' then now() else sent_at end
   where id=p_id;
  return found;
end;$$;
revoke all on function public.fila_cero_dispatch_finish(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fila_cero_dispatch_finish(uuid,text,text) to service_role;

-- Edge Functions acceden con secret/service key; no se conceden a clientes.

commit;

-- NOTA: no se crea un CRON automáticamente para no afectar otras apps del proyecto compartido.
-- Configura un Cron exclusivo llamado "fila-cero-dispatch-v014" después de desplegar la Edge Function.
