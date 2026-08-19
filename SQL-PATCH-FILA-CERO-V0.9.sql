-- ============================================================================
-- FILA CERO v0.9 — PATCH SEGURO PARA SUPABASE COMPARTIDO
-- ============================================================================
-- Este parche SOLO crea/reemplaza funciones con prefijo fila_cero_.
-- NO modifica tablas de Óptica, Hipso, Yorka, Donato, Devweb ni otros proyectos.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- ============================================================================

-- 1) Cancelar una reserva de la empresa autenticada.
--    Mantiene historial y deja el cupo como cancelado.
create or replace function public.fila_cero_cancel_reservation(
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select r.slot_id, r.business_id
    into v_slot_id, v_business_id
  from public.fila_cero_reservations r
  join public.fila_cero_businesses b on b.id = r.business_id
  where r.id = p_reservation_id
    and b.owner_id = auth.uid()
  for update of r;

  if not found then
    raise exception using errcode = 'P0001', message = 'RESERVATION_NOT_OWNED';
  end if;

  update public.fila_cero_reservations
  set status = 'cancelled'
  where id = p_reservation_id;

  update public.fila_cero_slots
  set status = 'cancelled'
  where id = v_slot_id
    and business_id = v_business_id;

  return true;
end;
$$;

revoke all on function public.fila_cero_cancel_reservation(uuid) from public;
revoke all on function public.fila_cero_cancel_reservation(uuid) from anon;
grant execute on function public.fila_cero_cancel_reservation(uuid) to authenticated;

-- 2) Eliminar definitivamente una cita.
--    Elimina el cupo asociado; la reserva desaparece automáticamente por ON DELETE CASCADE.
create or replace function public.fila_cero_delete_reservation(
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select r.slot_id, r.business_id
    into v_slot_id, v_business_id
  from public.fila_cero_reservations r
  join public.fila_cero_businesses b on b.id = r.business_id
  where r.id = p_reservation_id
    and b.owner_id = auth.uid()
  for update of r;

  if not found then
    raise exception using errcode = 'P0001', message = 'RESERVATION_NOT_OWNED';
  end if;

  delete from public.fila_cero_slots
  where id = v_slot_id
    and business_id = v_business_id;

  return true;
end;
$$;

revoke all on function public.fila_cero_delete_reservation(uuid) from public;
revoke all on function public.fila_cero_delete_reservation(uuid) from anon;
grant execute on function public.fila_cero_delete_reservation(uuid) to authenticated;

-- Verificación rápida: deben aparecer 2 filas.
select proname
from pg_proc
where proname in ('fila_cero_cancel_reservation','fila_cero_delete_reservation')
order by proname;
