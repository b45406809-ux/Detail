-- Serialize message inserts with cancellation and reject messages without both parties.
create or replace function public.guard_booking_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare booking public.jobs;
begin
  select * into booking from public.jobs where id = new.jobId for update;
  if not found or booking.customerId is null or booking.cleanerId is null then
    raise exception 'CHAT_NO_PARTICIPANT';
  end if;
  if upper(booking.status::text) in ('CANCELLED', 'CANCELED') then
    raise exception 'CHAT_BOOKING_CANCELLED';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_booking_message_insert on public.messages;
create trigger guard_booking_message_insert before insert on public.messages
for each row execute function public.guard_booking_message_insert();
