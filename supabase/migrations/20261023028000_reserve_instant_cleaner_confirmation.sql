-- Reserve a cleaner while the customer confirms an instant offer. The hold is
-- a real availability block so both dispatch search and concurrent accepts
-- see it; job expiry/cancellation and assignment release it transactionally.
alter table public.cleanerAvailabilityBlocks
  drop constraint if exists cleaneravailabilityblocks_blocktype_check;
alter table public.cleanerAvailabilityBlocks
  add constraint cleaneravailabilityblocks_blocktype_check
  check (blockType in ('BOOKING','BUFFER','MANUAL','CONFIRMATION'));

create or replace function public.respond_instant_offer(
  p_offer_id uuid,
  p_actor_id uuid,
  p_accept boolean,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  offer public.instantOffers;
  job public.jobs;
  cleaner public.users;
  bid_id uuid;
  duration integer;
  hold_ends_at timestamptz;
  hold_starts_at timestamptz := now();
begin
  select * into offer from public.instantOffers
  where id=p_offer_id and cleanerId=p_actor_id for update;
  if not found then raise exception 'Offer not found'; end if;

  select * into job from public.jobs where id=offer.jobId for update;
  if not found then raise exception 'Booking not found'; end if;
  if exists(select 1 from public.jobEvents where jobId=job.id and idempotencyKey=p_idempotency_key) then
    return jsonb_build_object('status',job.status,'jobId',job.id);
  end if;
  if offer.status<>'OFFERED' or offer.expiresAt<=now() or job.status<>'PENDING'
     or (job.matchExpiresAt is not null and job.matchExpiresAt<=now()) then
    raise exception 'Offer expired';
  end if;
  if not p_accept then
    update public.instantOffers set status='DECLINED',respondedAt=now() where id=offer.id;
    return jsonb_build_object('status','DECLINED','jobId',job.id);
  end if;

  select * into cleaner from public.users where id=p_actor_id for update;
  if cleaner.status<>'AVAILABLE' or cleaner.verificationStatus<>'VERIFIED'
     or not cleaner.cleanerAgreementAccepted or not cleaner.cleanerOnboardingComplete
     or cleaner.isSuspended or cleaner.isBanned or cleaner.accountDeletedAt is not null then
    raise exception 'Cleaner is no longer eligible';
  end if;
  if exists(select 1 from public.jobs active where active.cleanerId=p_actor_id
            and active.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS')) then
    raise exception 'Cleaner is already assigned';
  end if;
  if exists(select 1 from public.bids where jobId=job.id and status in ('PENDING','COUNTERED','ACCEPTED')) then
    raise exception 'Another cleaner is already awaiting customer confirmation';
  end if;

  duration:=greatest(30,least(720,coalesce(job.estimatedDuration,120)));
  hold_ends_at:=hold_starts_at+make_interval(mins=>duration+60+15);
  if exists(
    select 1 from public.cleanerAvailabilityBlocks block
    where block.cleanerId=p_actor_id
      and tstzrange(block.startsAt,block.endsAt,'[)') && tstzrange(hold_starts_at,hold_ends_at,'[)')
  ) then raise exception 'Cleaner is not available for another customer confirmation'; end if;

  insert into public.cleanerAvailabilityBlocks(cleanerId,jobId,startsAt,endsAt,blockType)
  values(p_actor_id,job.id,hold_starts_at,hold_ends_at,'CONFIRMATION');

  insert into public.bids(jobId,cleanerId,cleanerName,cleanerPhoto,cleanerRating,cleanerReviewCount,
    cleanerJobsCompleted,bidPrice,estimatedArrival,status,message,history)
  values(job.id,p_actor_id,cleaner.displayName,cleaner.photoURL,cleaner.ratingAverage,cleaner.ratingCount,
    cleaner.jobsCompleted,job.price,greatest(1,ceil(coalesce(offer.distanceMeters,1000)::numeric/500)::integer),
    'PENDING','Book Now request accepted; waiting for customer payment confirmation.',
    jsonb_build_array(jsonb_build_object('by','CLEANER','price',job.price,'createdAt',now())))
  returning id into bid_id;

  update public.instantOffers
  set status=case when id=offer.id then 'ACCEPTED' else 'WITHDRAWN' end,
      respondedAt=case when id=offer.id then now() else respondedAt end
  where jobId=job.id and status='OFFERED';
  delete from public.openJobs where jobId=job.id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,data)
  values(job.id,p_actor_id,'CLEANER','INSTANT_CLEANER_ACCEPTED','PENDING','PENDING',p_idempotency_key,
    jsonb_build_object('offerId',offer.id,'bidId',bid_id,'confirmationHoldExpiresAt',now()+interval '15 minutes'));
  return jsonb_build_object('status','CUSTOMER_ACTION_REQUIRED','jobId',job.id,
    'customerId',job.customerId,'bidId',bid_id);
end;
$$;
revoke all on function public.respond_instant_offer(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.respond_instant_offer(uuid,uuid,boolean,text) to service_role;

create or replace function public.on_job_assignment_block_availability()
returns trigger language plpgsql security definer set search_path=public
as $$
declare starts_at timestamptz; ends_at timestamptz; duration integer;
begin
  if tg_op='UPDATE' and old.cleanerId is distinct from new.cleanerId then
    delete from public.cleanerAvailabilityBlocks where jobId=new.id;
  end if;
  if new.cleanerId is not null and new.status='ASSIGNED'
     and (tg_op='INSERT' or old.cleanerId is distinct from new.cleanerId or old.status is distinct from new.status) then
    delete from public.cleanerAvailabilityBlocks where jobId=new.id and blockType='CONFIRMATION';
    duration:=greatest(30,least(720,coalesce(new.estimatedDuration,120)));
    starts_at:=coalesce(new.scheduledDateTime,now()); ends_at:=starts_at+make_interval(mins=>duration);
    if exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=new.cleanerId
      and tstzrange(b.startsAt,b.endsAt,'[)') && tstzrange(starts_at,ends_at+interval '60 minutes','[)')
      and (b.jobId is null or b.jobId<>new.id)) then raise exception 'CLEANER_UNAVAILABLE'; end if;
    insert into public.cleanerAvailabilityBlocks(cleanerId,jobId,startsAt,endsAt,blockType)
      values(new.cleanerId,new.id,starts_at,ends_at,'BOOKING') on conflict(jobId,blockType) where jobId is not null do nothing;
    insert into public.cleanerAvailabilityBlocks(cleanerId,jobId,startsAt,endsAt,blockType)
      values(new.cleanerId,new.id,ends_at,ends_at+interval '60 minutes','BUFFER') on conflict(jobId,blockType) where jobId is not null do nothing;
  elsif new.status not in ('ASSIGNED','EN_ROUTE','IN_PROGRESS') and old.status is distinct from new.status then
    delete from public.cleanerAvailabilityBlocks where jobId=new.id;
  end if;
  return new;
end;
$$;

create or replace function public.reject_bid_secure(p_job_id uuid,p_bid_id uuid,p_customer_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare job_record public.jobs; bid_record public.bids;
begin
  select * into job_record from public.jobs where id=p_job_id for update;
  if not found or job_record.customerId<>p_customer_id then raise exception 'Only the customer can reject this quote'; end if;
  select * into bid_record from public.bids where id=p_bid_id and jobId=p_job_id for update;
  if not found then raise exception 'Quote not found'; end if;
  if bid_record.status='REJECTED' then return true; end if;
  if bid_record.status not in ('PENDING','COUNTERED') or job_record.status not in ('PENDING','CONFIRMED')
     or job_record.cleanerId is not null then raise exception 'This quote can no longer be rejected'; end if;
  update public.bids set status='REJECTED',updatedAt=now() where id=p_bid_id;
  if job_record.bookingMode='INSTANT' then
    delete from public.cleanerAvailabilityBlocks where jobId=p_job_id and blockType='CONFIRMATION';
    update public.instantOffers set status='WITHDRAWN',respondedAt=now()
      where jobId=p_job_id and cleanerId=bid_record.cleanerId and status='ACCEPTED';
    update public.jobs set matchExpiresAt=now()+interval '3 minutes',updatedAt=now() where id=p_job_id;
  end if;
  return true;
end;
$$;
revoke all on function public.reject_bid_secure(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reject_bid_secure(uuid,uuid,uuid) to service_role;
