create or replace function public.admin_reassign_booking(
  p_job_id uuid,
  p_actor_id uuid,
  p_cleaner_id uuid,
  p_reason text,
  p_idempotency_key text
) returns public.jobs
language plpgsql
security definer
set search_path=public
as $$
declare
  booking public.jobs;
  cleaner public.users;
  previous_cleaner uuid;
  previous_status public.booking_status;
begin
  select * into booking from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key) then return booking; end if;
  if booking.status not in ('PENDING','CONFIRMED','ASSIGNED') then
    raise exception 'Only open or assigned bookings can be assigned or reassigned';
  end if;
  if booking.cleanerId=p_cleaner_id then raise exception 'This cleaner is already assigned'; end if;

  select * into cleaner from public.users where id=p_cleaner_id for update;
  if not found or cleaner.role<>'CLEANER' or cleaner.verificationStatus<>'VERIFIED'
     or not cleaner.cleanerAgreementAccepted or cleaner.isSuspended or cleaner.isBanned
     or cleaner.accountDeletedAt is not null or cleaner.status<>'AVAILABLE' then
    raise exception 'Choose an available, verified cleaner';
  end if;
  if exists(select 1 from public.jobs active where active.cleanerId=p_cleaner_id
      and active.id<>p_job_id and active.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS')) then
    raise exception 'Cleaner already has an active booking';
  end if;

  previous_cleaner:=booking.cleanerId;
  previous_status:=booking.status;
  update public.jobs set cleanerId=p_cleaner_id,cleanerName=cleaner.displayName,
    cleanerPhoto=cleaner.photoURL,cleanerRating=cleaner.ratingAverage,
    cleanerPhone=cleaner.phone,status='ASSIGNED',updatedAt=now()
    where id=p_job_id returning * into booking;
  update public.payments set cleanerId=p_cleaner_id,updatedAt=now()
    where jobId=p_job_id and status in ('INITIATING','PENDING','CAPTURED','AUTHORIZED','ESCROWED');
  delete from public.openJobs where jobId=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,reason,data)
    values(p_job_id,p_actor_id,'ADMIN','REASSIGNED',previous_status::text,'ASSIGNED',p_idempotency_key,left(p_reason,500),
      jsonb_build_object('previousCleanerId',previous_cleaner,'newCleanerId',p_cleaner_id));
  return booking;
end;
$$;
revoke all on function public.admin_reassign_booking(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_reassign_booking(uuid,uuid,uuid,text,text) to service_role;
