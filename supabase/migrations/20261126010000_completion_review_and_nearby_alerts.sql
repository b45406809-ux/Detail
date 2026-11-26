-- 1. Commission is taken when the cleaner submits completion, so record the
--    cleaner's earnings (job value minus 10%) at the same moment. The customer
--    still confirms and rates afterwards; accrue_direct_booking_commission
--    rewrites the same figures when they confirm.
-- 2. Nearby-job alerts name the service, distance, budget and time, and never
--    go to the customer's own cleaner account.
create or replace function public.transition_booking(p_job_id uuid,p_actor_id uuid,p_new_status public.booking_status,p_idempotency_key text,p_reason text default null)
returns public.jobs language plpgsql security definer set search_path=public
as $$
declare job public.jobs; old_status public.booking_status; allowed boolean:=false; actor_role public.user_role;
begin
  select * into job from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select role into actor_role from public.users where id=p_actor_id;
  if exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key) then return job; end if;
  old_status:=job.status;
  if p_actor_id=job.cleanerId and actor_role='CLEANER' then
    allowed:=case old_status when 'ASSIGNED' then p_new_status='EN_ROUTE'
      when 'EN_ROUTE' then p_new_status='IN_PROGRESS' when 'IN_PROGRESS' then p_new_status='COMPLETED' else false end;
    if p_new_status='IN_PROGRESS' and job.arrivalAt is null then raise exception 'Cleaner arrival must be recorded first'; end if;
    if p_new_status='COMPLETED' and cardinality(job.completionPhotos)<1 then raise exception 'Completion evidence is required'; end if;
    if p_new_status='EN_ROUTE' and job.paymentMethod='PAYNOW' and job.paymentStatus not in ('ESCROWED','DELIVERED','PAID') then raise exception 'Paynow escrow is not funded'; end if;
  elsif p_actor_id=job.customerId and actor_role='CUSTOMER' then
    allowed:=false;
  else raise exception 'Actor is not authorized for this booking'; end if;
  if not allowed then raise exception 'Invalid booking transition for actor'; end if;
  update public.jobs set status=p_new_status,updatedAt=now(),
    serviceStartedAt=case when p_new_status='IN_PROGRESS' then coalesce(serviceStartedAt,now()) else serviceStartedAt end,
    completionSubmittedAt=case when p_new_status='COMPLETED' then coalesce(completionSubmittedAt,now()) else completionSubmittedAt end
    where id=p_job_id returning * into job;
  if p_new_status='COMPLETED' then
    update public.jobs set customerResponseAt=null where id=p_job_id;
  end if;
  if p_new_status in ('COMPLETED','CANCELLED') then delete from public.openJobs where jobId=p_job_id; end if;
  if p_new_status='COMPLETED' and job.paymentMethod in ('CASH','ECOCASH','INNBUCKS','DIRECT_OFFLINE') and coalesce(job.price,0)>0 then
    perform public.record_wallet_transaction(job.cleanerId,'DEBIT',round(job.price*0.10,2),'COMMISSION','Commission for completed booking '||p_job_id,'commission_reserve_'||p_job_id,p_job_id,null);
    update public.jobs set earnings=jsonb_build_object('gross',job.price,'commission',round(job.price*0.10,2),
        'net',greatest(0,job.price-round(job.price*0.10,2)),'finalized',true,'source','DIRECT_OFFLINE','prepaid',true)
      where id=p_job_id returning * into job;
  end if;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,reason)
    values(p_job_id,p_actor_id,'CLEANER','STATUS_CHANGE',old_status::text,p_new_status::text,p_idempotency_key,left(p_reason,500));
  return job;
end; $$;
revoke all on function public.transition_booking(uuid,uuid,public.booking_status,text,text) from public,anon,authenticated;
grant execute on function public.transition_booking(uuid,uuid,public.booking_status,text,text) to service_role;

-- Backfill bookings already completed under the new policy.
update public.jobs j set earnings=jsonb_build_object('gross',j.price,'commission',round(j.price*0.10,2),
    'net',greatest(0,j.price-round(j.price*0.10,2)),'finalized',true,'source','DIRECT_OFFLINE','prepaid',true),updatedAt=now()
where j.status='COMPLETED' and coalesce(j.price,0)>0 and coalesce((j.earnings->>'finalized')::boolean,false) is not true
  and exists(select 1 from public.walletTransactions w where w.idempotencyKey='commission_reserve_'||j.id::text and w.type='DEBIT');

create or replace function public.notify_scheduled_job_cleaners(p_job_id uuid,p_customer_id uuid,p_limit integer default 20)
returns integer language plpgsql security definer set search_path=public,extensions
as $$
declare job_record public.jobs; point extensions.geography(Point,4326); starts_at timestamptz;
  duration integer; candidate record; target_cleaner_id uuid; notified integer:=0;
  service_label text; budget_label text; when_label text; distance_label text;
begin
  select * into job_record from public.jobs where id=p_job_id and customerId=p_customer_id for update;
  if not found or job_record.status<>'PENDING' or job_record.bookingMode<>'SCHEDULED' then raise exception 'Scheduled booking is unavailable'; end if;
  if coalesce((job_record.data->>'isFavoriteRebook')::boolean,false) then
    begin target_cleaner_id:=nullif(job_record.data->>'preferredCleanerId','')::uuid;
    exception when invalid_text_representation then raise exception 'Invalid preferred cleaner on rebooking'; end;
    if target_cleaner_id is null then raise exception 'Rebooking has no selected cleaner'; end if;
  end if;
  if coalesce(job_record.location->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
     or coalesce(job_record.location->>'lng','') !~ '^-?[0-9]+([.][0-9]+)?$' then return 0; end if;
  if (job_record.location->>'lat')::double precision not between -90 and 90
     or (job_record.location->>'lng')::double precision not between -180 and 180
     or ((job_record.location->>'lat')::double precision=0 and (job_record.location->>'lng')::double precision=0) then return 0; end if;
  point:=extensions.st_setsrid(extensions.st_makepoint((job_record.location->>'lng')::float8,(job_record.location->>'lat')::float8),4326)::extensions.geography;
  starts_at:=coalesce(job_record.scheduledDateTime,now()+interval '30 minutes');
  duration:=greatest(30,least(720,coalesce(job_record.estimatedDuration,120)));
  service_label:=coalesce(nullif(trim(job_record.serviceType),''),case when job_record.category='CAR' then 'Car cleaning' else 'Home cleaning' end);
  budget_label:=case when coalesce(job_record.budget,0)>0 then 'Budget $'||trim(to_char(job_record.budget,'FM999990.00')) else 'Open budget' end;
  when_label:=to_char(starts_at at time zone 'Africa/Harare','Dy DD Mon, HH24:MI');
  for candidate in
    select u.id, extensions.st_distance(u.locationPoint,point) as meters from public.users u
    where (target_cleaner_id is null or u.id=target_cleaner_id)
      and u.id<>p_customer_id
      and u.role='CLEANER' and u.verificationStatus='VERIFIED' and u.cleanerAgreementAccepted
      and not u.isSuspended and not u.isBanned and u.accountDeletedAt is null and u.status='AVAILABLE'
      and u.locationPoint is not null and u.locationUpdatedAt>now()-interval '60 minutes'
      and extensions.st_dwithin(u.locationPoint,point,least(100000,coalesce(u.serviceRadiusKm,25)*1000))
      and (cardinality(u.serviceCategories)=0 or job_record.category=any(u.serviceCategories))
      and not exists(select 1 from public.jobs a where a.cleanerId=u.id and a.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS'))
      and not exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=u.id
        and b.startsAt<starts_at+make_interval(mins=>duration+60) and b.endsAt>starts_at)
    order by u.locationPoint<->point limit case when target_cleaner_id is null then greatest(1,least(coalesce(p_limit,20),50)) else 1 end
  loop
    insert into public.scheduledJobNotices(jobId,cleanerId) values(p_job_id,candidate.id) on conflict(jobId,cleanerId) do nothing;
    if found then
      distance_label:=case when candidate.meters<1000 then 'under 1 km away' else trim(to_char(candidate.meters/1000.0,'FM990.0'))||' km away' end;
      perform public.create_notification_outbox(candidate.id,
        case when target_cleaner_id is null then service_label||' request '||distance_label else 'A customer wants to book you again' end,
        case when target_cleaner_id is null then budget_label||' · '||when_label||'. Review the job and send a quote if it fits.'
          else service_label||' · '||when_label||'. Review the job details and send your quote in Detail.' end,
        'NEW_SCHEDULED_JOB',p_job_id,jsonb_build_object('bookingMode','SCHEDULED','isFavoriteRebook',target_cleaner_id is not null,'distanceMeters',round(candidate.meters)));
      notified:=notified+1;
    end if;
  end loop;
  return notified;
end;
$$;
