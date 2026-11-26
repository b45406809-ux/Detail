-- 1. Bookings show each participant's current profile photo. Photo fields were
--    copied from the client at booking time and were often empty or stale, so
--    profile pictures never appeared. Use the canonical storage path from users.
-- 2. "Jobs" on the cleaner home screen counts completed bookings. It was only
--    incremented by payment-settlement paths that direct (offline) payments never
--    reach, so it stayed at 0. It is now always the number of COMPLETED bookings.

create or replace function public.sync_job_participant_photos()
returns trigger language plpgsql security definer set search_path=public as $$
declare photo text;
begin
  if tg_op='INSERT' or new.customerId is distinct from old.customerId then
    select photoURL into photo from public.users where id=new.customerId and accountDeletedAt is null;
    if photo like 'detail-media/profile-photos/%' then new.customerPhoto:=photo; end if;
  end if;
  if new.cleanerId is not null and (tg_op='INSERT' or new.cleanerId is distinct from old.cleanerId) then
    photo:=null;
    select photoURL into photo from public.users where id=new.cleanerId and accountDeletedAt is null;
    if photo like 'detail-media/profile-photos/%' then new.cleanerPhoto:=photo; end if;
  end if;
  return new;
end; $$;
drop trigger if exists jobs_sync_participant_photos on public.jobs;
create trigger jobs_sync_participant_photos before insert or update of customerId,cleanerId on public.jobs
  for each row execute function public.sync_job_participant_photos();

update public.jobs j set customerPhoto=u.photoURL from public.users u
where u.id=j.customerId and u.accountDeletedAt is null and u.photoURL like 'detail-media/profile-photos/%'
  and j.customerPhoto is distinct from u.photoURL;
update public.jobs j set cleanerPhoto=u.photoURL from public.users u
where u.id=j.cleanerId and u.accountDeletedAt is null and u.photoURL like 'detail-media/profile-photos/%'
  and j.cleanerPhoto is distinct from u.photoURL;

-- Any write to jobsCompleted (including the old +1 increments) resolves to the true count.
create or replace function public.enforce_cleaner_jobs_completed()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.jobsCompleted is distinct from old.jobsCompleted then
    select count(*) into new.jobsCompleted from public.jobs where cleanerId=new.id and status='COMPLETED';
  end if;
  return new;
end; $$;
drop trigger if exists users_enforce_jobs_completed on public.users;
create trigger users_enforce_jobs_completed before update of jobsCompleted on public.users
  for each row execute function public.enforce_cleaner_jobs_completed();

create or replace function public.refresh_cleaner_jobs_completed()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.cleanerId is not null then
    update public.users set jobsCompleted=(select count(*) from public.jobs where cleanerId=new.cleanerId and status='COMPLETED')
      where id=new.cleanerId;
  end if;
  if tg_op='UPDATE' and old.cleanerId is not null and old.cleanerId is distinct from new.cleanerId then
    update public.users set jobsCompleted=(select count(*) from public.jobs where cleanerId=old.cleanerId and status='COMPLETED')
      where id=old.cleanerId;
  end if;
  return null;
end; $$;
drop trigger if exists jobs_refresh_cleaner_jobs_completed on public.jobs;
create trigger jobs_refresh_cleaner_jobs_completed after insert or update of status,cleanerId on public.jobs
  for each row execute function public.refresh_cleaner_jobs_completed();

revoke all on function public.sync_job_participant_photos() from public,anon,authenticated;
revoke all on function public.enforce_cleaner_jobs_completed() from public,anon,authenticated;
revoke all on function public.refresh_cleaner_jobs_completed() from public,anon,authenticated;

update public.users u set jobsCompleted=c.n
from (select cleanerId,count(*)::integer n from public.jobs where status='COMPLETED' and cleanerId is not null group by cleanerId) c
where c.cleanerId=u.id and u.jobsCompleted is distinct from c.n;
