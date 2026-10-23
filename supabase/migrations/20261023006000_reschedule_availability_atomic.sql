-- Replace both availability rows atomically during rescheduling. Updating the
-- booking row first overlaps its own old buffer under the immediate exclusion
-- constraint, so the old pair must be removed before inserting the new pair.
create or replace function public.on_job_reschedule_availability()
returns trigger language plpgsql security definer set search_path = public
as $$
declare starts_at timestamptz; ends_at timestamptz; duration integer;
begin
  if new.cleanerId is null or new.status not in ('ASSIGNED','EN_ROUTE','IN_PROGRESS')
     or new.scheduledDateTime is not distinct from old.scheduledDateTime then return new; end if;
  if new.status in ('EN_ROUTE','IN_PROGRESS') then raise exception 'Started bookings cannot be rescheduled'; end if;
  duration := greatest(30, least(720, coalesce(new.estimatedDuration, 120)));
  starts_at := coalesce(new.scheduledDateTime, now());
  ends_at := starts_at + make_interval(mins => duration);

  delete from public.cleanerAvailabilityBlocks where jobId = new.id;
  if exists (
    select 1 from public.cleanerAvailabilityBlocks b
    where b.cleanerId = new.cleanerId
      and tstzrange(b.startsAt, b.endsAt, '[)') && tstzrange(starts_at, ends_at + interval '60 minutes', '[)')
  ) then raise exception 'CLEANER_UNAVAILABLE'; end if;

  insert into public.cleanerAvailabilityBlocks(cleanerId,jobId,startsAt,endsAt,blockType)
  values(new.cleanerId,new.id,starts_at,ends_at,'BOOKING');
  insert into public.cleanerAvailabilityBlocks(cleanerId,jobId,startsAt,endsAt,blockType)
  values(new.cleanerId,new.id,ends_at,ends_at+interval '60 minutes','BUFFER');
  return new;
end;
$$;
