-- Forward-only security, scheduling, and marketplace capabilities.
create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- Open bookings have a deliberately small public projection. Keep exact
-- customer location and private booking JSON on jobs, visible to participants.
drop policy if exists "Job participant and eligible cleaner read" on public.jobs;
create policy "Booking participants read jobs" on public.jobs for select to authenticated
using (customerId = auth.uid() or cleanerId = auth.uid() or public.is_admin());

drop policy if exists "Verified cleaners read open feed" on public.openJobs;
create policy "Verified cleaners read sanitized open feed" on public.openJobs for select to authenticated
using (
  customerId = auth.uid() or public.is_admin() or
  (status = 'PENDING' and exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'CLEANER'
      and u.verificationStatus = 'VERIFIED' and u.cleanerAgreementAccepted
      and not u.isSuspended and not u.isBanned
  ))
);
alter table public.jobs add column if not exists bookingMode text not null default 'SCHEDULED'
  check (bookingMode in ('SCHEDULED','INSTANT'));
alter table public.jobs add column if not exists suppliesRequired boolean not null default false;
alter table public.jobs add column if not exists suppliesFee numeric(12,2) not null default 0 check (suppliesFee >= 0);
alter table public.jobs add column if not exists arrivalAt timestamptz;
alter table public.jobs add column if not exists serviceStartedAt timestamptz;
alter table public.jobs add column if not exists completionSubmittedAt timestamptz;
alter table public.jobs add column if not exists customerResponseAt timestamptz;
alter table public.jobs add column if not exists matchExpiresAt timestamptz;
update public.openJobs oj set data=jsonb_build_object(
  'bookingMode',coalesce(j.bookingMode,'SCHEDULED'),'scheduledDateTime',j.scheduledDateTime,
  'timePreference',j.timePreference,'serviceType',j.serviceType,'category',j.category,
  'estimatedDuration',coalesce(j.estimatedDuration,120),'suppliesRequired',coalesce(j.suppliesRequired,false),
  'suppliesFee',coalesce(j.suppliesFee,0)
) from public.jobs j where j.id=oj.jobId;
alter table public.users add column if not exists locationPoint extensions.geography(Point,4326);
alter table public.users add column if not exists locationUpdatedAt timestamptz;
alter table public.users add column if not exists walletRestricted boolean not null default false;
update public.users set locationPoint = extensions.st_setsrid(extensions.st_makepoint(
  (location->>'lng')::float8, (location->>'lat')::float8),4326)::extensions.geography,
  locationUpdatedAt = coalesce(locationUpdatedAt,updatedAt)
where locationPoint is null and location ? 'lat' and location ? 'lng'
  and (location->>'lat') ~ '^-?[0-9]+([.][0-9]+)?$'
  and (location->>'lng') ~ '^-?[0-9]+([.][0-9]+)?$'
  and (location->>'lat')::float8 between -90 and 90
  and (location->>'lng')::float8 between -180 and 180;
create index if not exists users_location_point_gix on public.users using gist(locationPoint);

create table if not exists public.cleanerAvailabilityBlocks (
  id uuid primary key default gen_random_uuid(),
  cleanerId uuid not null references public.users(id) on delete cascade,
  jobId uuid references public.jobs(id) on delete cascade,
  startsAt timestamptz not null,
  endsAt timestamptz not null,
  blockType text not null default 'BOOKING' check (blockType in ('BOOKING','BUFFER','MANUAL')),
  createdAt timestamptz not null default now(),
  check (endsAt > startsAt)
);
create index if not exists cleaner_availability_time_idx on public.cleanerAvailabilityBlocks(cleanerId,startsAt,endsAt);
create unique index if not exists cleaner_availability_job_type_uidx on public.cleanerAvailabilityBlocks(jobId,blockType) where jobId is not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='cleaner_availability_no_overlap') then
    alter table public.cleanerAvailabilityBlocks add constraint cleaner_availability_no_overlap
      exclude using gist (cleanerId with =, tstzrange(startsAt,endsAt,'[)') with &&);
  end if;
end $$;
alter table public.cleanerAvailabilityBlocks enable row level security;
create policy "Cleaners read own availability blocks" on public.cleanerAvailabilityBlocks for select to authenticated
using (cleanerId=auth.uid() or public.is_admin());
revoke all on public.cleanerAvailabilityBlocks from anon,authenticated;
grant select on public.cleanerAvailabilityBlocks to authenticated;

create table if not exists public.instantOffers (
  id uuid primary key default gen_random_uuid(),
  jobId uuid not null references public.jobs(id) on delete cascade,
  cleanerId uuid not null references public.users(id) on delete cascade,
  status text not null default 'OFFERED' check (status in ('OFFERED','ACCEPTED','DECLINED','EXPIRED','WITHDRAWN')),
  expiresAt timestamptz not null,
  distanceMeters integer,
  createdAt timestamptz not null default now(),
  respondedAt timestamptz,
  unique(jobId,cleanerId)
);
create index if not exists instant_offers_cleaner_status_idx on public.instantOffers(cleanerId,status,expiresAt);
alter table public.instantOffers enable row level security;
create policy "Offer parties read instant offers" on public.instantOffers for select to authenticated
using (cleanerId=auth.uid() or exists(select 1 from public.jobs j where j.id=jobId and j.customerId=auth.uid()) or public.is_admin());
revoke all on public.instantOffers from anon,authenticated;
grant select on public.instantOffers to authenticated;

-- Do not store the whole customer payload in the cleaner-visible feed.
create or replace function public.create_booking(p_actor_id uuid,p_idempotency_key text,p_booking jsonb)
returns uuid language plpgsql security definer set search_path=public,extensions
as $$
declare existing_id uuid; result_id uuid:=gen_random_uuid(); now_at timestamptz:=now(); mode text;
begin
  select jobId into existing_id from public.jobEvents where idempotencyKey='created_'||p_idempotency_key limit 1;
  if existing_id is not null then return existing_id; end if;
  if p_booking->>'category' not in ('HOUSE','CAR') or coalesce(trim(p_booking->>'serviceType'),'')='' or coalesce(trim(p_booking#>>'{location,address}'),'')='' then raise exception 'Service and location are required'; end if;
  mode:=upper(coalesce(p_booking->>'bookingMode','SCHEDULED'));
  if mode not in ('SCHEDULED','INSTANT') then raise exception 'Invalid booking mode'; end if;
  if mode='INSTANT' and coalesce(p_booking->>'scheduledDateTime','')<>'' then raise exception 'Instant bookings cannot carry a scheduled time'; end if;
  insert into public.jobs(id,customerId,customerName,customerPhoto,category,serviceType,checklist,description,location,
    scheduledTime,scheduledDateTime,timePreference,status,pricingStrategy,budget,biddingExpiresAt,reminderSent,photos,createdAt,data,
    bookingMode,suppliesRequired,suppliesFee,estimatedDuration,matchExpiresAt,price)
  values(result_id,p_actor_id,p_booking->>'customerName',p_booking->>'customerPhoto',p_booking->>'category',p_booking->>'serviceType',p_booking->'checklist',
    coalesce(p_booking->>'description',''),coalesce(p_booking->'location','{}'::jsonb),p_booking->>'scheduledTime',
    nullif(p_booking->>'scheduledDateTime','')::timestamptz,p_booking->>'timePreference','PENDING',coalesce(p_booking->>'pricingStrategy','RECEIVE_BIDS'),
    nullif(p_booking->>'budget','')::numeric,nullif(p_booking->>'biddingExpiresAt','')::timestamptz,coalesce((p_booking->>'reminderSent')::boolean,false),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_booking->'photos','[]'::jsonb))),'{}'),now_at,p_booking,
    mode,coalesce((p_booking->>'suppliesRequired')::boolean,false),greatest(0,coalesce(nullif(p_booking->>'suppliesFee','')::numeric,0)),
    greatest(30,least(720,coalesce(nullif(p_booking->>'estimatedDuration','')::integer,120))),
    case when mode='INSTANT' then now_at+interval '3 minutes' else null end,
    nullif(p_booking->>'price','')::numeric);
  insert into public.openJobs(jobId,status,category,serviceType,budget,biddingExpiresAt,customerId,createdAt,data)
  values(result_id,'PENDING',p_booking->>'category',p_booking->>'serviceType',nullif(p_booking->>'budget','')::numeric,
    nullif(p_booking->>'biddingExpiresAt','')::timestamptz,p_actor_id,now_at,
    jsonb_build_object('bookingMode',mode,'scheduledDateTime',p_booking->>'scheduledDateTime','timePreference',p_booking->>'timePreference',
      'serviceType',p_booking->>'serviceType','category',p_booking->>'category','estimatedDuration',coalesce(p_booking->>'estimatedDuration','120'),
      'suppliesRequired',coalesce((p_booking->>'suppliesRequired')::boolean,false),'suppliesFee',greatest(0,coalesce(nullif(p_booking->>'suppliesFee','')::numeric,0))));
  insert into public.jobEvents(jobId,actorId,actorRole,type,newState,idempotencyKey,createdAt)
    values(result_id,p_actor_id,'CUSTOMER','CREATION','PENDING','created_'||p_idempotency_key,now_at);
  return result_id;
end; $$;
revoke all on function public.create_booking(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_booking(uuid,text,jsonb) to service_role;

-- Include the server-stored supplies surcharge in scheduled quotes. Instant
-- service prices already include this surcharge when the request is created.
create or replace function public.accept_bid(p_actor_id uuid,p_job_id uuid,p_bid_id uuid,p_payment_method text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare j public.jobs; b public.bids; cleaner public.users; customer public.users; event_exists boolean; amount numeric(12,2); commission numeric(12,2); payment_status text; payment_reference text;
begin
  select exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key) into event_exists;
  select * into j from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  select * into b from public.bids where id=p_bid_id and jobId=p_job_id for update;
  if not found then raise exception 'Bid not found'; end if;
  if event_exists then return jsonb_build_object('success',true,'state','ASSIGNED','payment',jsonb_build_object('status',j.paymentStatus,'amount',j.price)); end if;
  if j.customerId<>p_actor_id then raise exception 'Only the customer can accept a bid'; end if;
  if j.status not in ('PENDING','CONFIRMED') or j.cleanerId is not null then raise exception 'JOB_UNAVAILABLE'; end if;
  if b.status not in ('PENDING','COUNTERED') then raise exception 'BID_UNAVAILABLE'; end if;
  if p_payment_method not in ('WALLET','CASH','ECOCASH','INNBUCKS','PAYNOW') then raise exception 'Invalid payment method'; end if;
  select * into customer from public.users where id=p_actor_id for update;
  select * into cleaner from public.users where id=b.cleanerId for update;
  if cleaner.id is null or cleaner.role<>'CLEANER' or cleaner.verificationStatus<>'VERIFIED' or not cleaner.cleanerAgreementAccepted or cleaner.isSuspended or cleaner.isBanned then raise exception 'Cleaner is not eligible'; end if;
  amount:=round(b.bidPrice+case when j.bookingMode='INSTANT' then 0 else coalesce(j.suppliesFee,0) end,2);
  commission:=round(amount*0.1,2);
  if p_payment_method='WALLET' then
    if customer.balance<amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
    perform public.record_wallet_transaction(p_actor_id,'DEBIT',amount,'GENERAL','Held for booking '||p_job_id,'booking_capture_'||p_job_id,p_job_id,null);
  elsif p_payment_method in ('CASH','ECOCASH','INNBUCKS') then
    if cleaner.commissionBalance<commission then raise exception 'Cleaner commission balance is insufficient'; end if;
    perform public.record_wallet_transaction(cleaner.id,'DEBIT',commission,'COMMISSION','Commission reserve for booking '||p_job_id,'commission_reserve_'||p_job_id,p_job_id,null);
  end if;
  payment_status:=case when p_payment_method='WALLET' then 'CAPTURED' when p_payment_method='PAYNOW' then 'INITIATING' else 'AUTHORIZED' end;
  payment_reference:=case when p_payment_method='PAYNOW' then p_job_id::text||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,12) else null end;
  insert into public.payments(id,jobId,customerId,cleanerId,provider,reference,amount,status,idempotencyKey,createdAt,data)
    values(p_job_id::text||'_booking',p_job_id,p_actor_id,b.cleanerId,case when p_payment_method='PAYNOW' then 'PAYNOW' else p_payment_method end,payment_reference,amount,payment_status,p_idempotency_key,now(),jsonb_build_object('method',p_payment_method,'originalSource',p_payment_method,'suppliesFee',coalesce(j.suppliesFee,0)))
    on conflict(id) do update set cleanerId=excluded.cleanerId,amount=excluded.amount,status=excluded.status,idempotencyKey=excluded.idempotencyKey,reference=excluded.reference,data=excluded.data;
  update public.bids set status=case when id=p_bid_id then 'ACCEPTED' else 'REJECTED' end,updatedAt=now() where jobId=p_job_id and status in ('PENDING','COUNTERED');
  update public.jobs set status='ASSIGNED',cleanerId=b.cleanerId,cleanerName=b.cleanerName,cleanerPhoto=b.cleanerPhoto,cleanerRating=b.cleanerRating,
    cleanerPhone=cleaner.phone,customerPhone=customer.phone,price=amount,paymentMethod=p_payment_method,paymentStatus=payment_status,
    updatedAt=now(),data=data||jsonb_build_object('acceptedAt',now()) where id=p_job_id returning * into j;
  delete from public.openJobs where jobId=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,data)
    values(p_job_id,p_actor_id,'CUSTOMER','BID_ACCEPTED','CONFIRMED','ASSIGNED',p_idempotency_key,jsonb_build_object('bidId',p_bid_id,'paymentMethod',p_payment_method,'amount',amount));
  return jsonb_build_object('success',true,'state','ASSIGNED','payment',jsonb_build_object('status',payment_status,'amount',amount,'reference',payment_reference),'cleanerId',b.cleanerId,'cleanerName',b.cleanerName);
end; $$;
revoke all on function public.accept_bid(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.accept_bid(uuid,uuid,uuid,text,text) to service_role;

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
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,reason)
    values(p_job_id,p_actor_id,'CLEANER','STATUS_CHANGE',old_status::text,p_new_status::text,p_idempotency_key,left(p_reason,500));
  return job;
end; $$;
revoke all on function public.transition_booking(uuid,uuid,public.booking_status,text,text) from public,anon,authenticated;
grant execute on function public.transition_booking(uuid,uuid,public.booking_status,text,text) to service_role;

create or replace function public.mark_booking_arrived(p_job_id uuid,p_actor_id uuid,p_idempotency_key text)
returns timestamptz language plpgsql security definer set search_path=public
as $$
declare job public.jobs; arrival timestamptz;
begin
  select * into job from public.jobs where id=p_job_id for update;
  if not found or job.cleanerId<>p_actor_id or job.status<>'EN_ROUTE' then raise exception 'Only the assigned cleaner can record arrival while en route'; end if;
  if job.arrivalAt is not null then return job.arrivalAt; end if;
  arrival:=now();
  update public.jobs set arrivalAt=arrival,updatedAt=arrival where id=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,newState,idempotencyKey,data)
    values(p_job_id,p_actor_id,'CLEANER','ARRIVED','EN_ROUTE',p_idempotency_key,jsonb_build_object('arrivalAt',arrival)) on conflict(jobId,idempotencyKey) do nothing;
  return arrival;
end; $$;
revoke all on function public.mark_booking_arrived(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mark_booking_arrived(uuid,uuid,text) to service_role;

create or replace function public.search_instant_cleaners(p_job_id uuid,p_actor_id uuid,p_limit integer default 20)
returns table(cleaner_id uuid,distance_meters integer,display_name text,rating numeric,category_match boolean)
language plpgsql security definer set search_path=public,extensions
as $$
declare job public.jobs; point extensions.geography(Point,4326); max_count integer;
begin
  select * into job from public.jobs where id=p_job_id and customerId=p_actor_id and status='PENDING' for update;
  if not found or job.bookingMode<>'INSTANT' then raise exception 'Instant booking not available'; end if;
  if job.matchExpiresAt<now() then raise exception 'Instant booking matching expired'; end if;
  point:=extensions.st_setsrid(extensions.st_makepoint((job.location->>'lng')::float8,(job.location->>'lat')::float8),4326)::extensions.geography;
  max_count:=greatest(1,least(coalesce(p_limit,20),50));
  return query select u.id,extensions.st_distance(u.locationPoint,point)::integer,u.displayName,u.ratingAverage,
    coalesce(job.category=any(u.serviceCategories),false)
    from public.users u
    where u.role='CLEANER' and u.verificationStatus='VERIFIED' and u.cleanerAgreementAccepted
      and not u.isSuspended and not u.isBanned and u.status='AVAILABLE'
      and u.locationPoint is not null and u.locationUpdatedAt>now()-interval '5 minutes'
      and (u.serviceRadiusKm is null or extensions.st_dwithin(u.locationPoint,point,u.serviceRadiusKm*1000))
      and (cardinality(u.serviceCategories)=0 or job.category=any(u.serviceCategories))
      and not exists(select 1 from public.jobs active where active.cleanerId=u.id and active.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS'))
      and not exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=u.id and b.startsAt<now()+make_interval(mins=>job.estimatedDuration+60) and b.endsAt>now())
    order by u.locationPoint<->point limit max_count;
end; $$;
revoke all on function public.search_instant_cleaners(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.search_instant_cleaners(uuid,uuid,integer) to service_role;

create or replace function public.create_instant_offers(p_job_id uuid,p_actor_id uuid,p_cleaner_ids uuid[],p_distances integer[],p_expires_at timestamptz)
returns integer language plpgsql security definer set search_path=public
as $$
declare job public.jobs; cleaner_id uuid; inserted integer:=0; i integer;
begin
  select * into job from public.jobs where id=p_job_id and customerId=p_actor_id and status='PENDING' and bookingMode='INSTANT' for update;
  if not found then raise exception 'Instant booking not available'; end if;
  for i in 1..coalesce(array_length(p_cleaner_ids,1),0) loop
    cleaner_id:=p_cleaner_ids[i];
    if exists(select 1 from public.users u where u.id=cleaner_id and u.role='CLEANER' and u.status='AVAILABLE' and u.verificationStatus='VERIFIED' and u.cleanerAgreementAccepted and not u.isSuspended and not u.isBanned) then
      insert into public.instantOffers(jobId,cleanerId,expiresAt,distanceMeters)
      values(p_job_id,cleaner_id,least(p_expires_at,now()+interval '3 minutes'),p_distances[i])
      on conflict(jobId,cleanerId) do update set status='OFFERED',expiresAt=excluded.expiresAt,distanceMeters=excluded.distanceMeters,createdAt=now(),respondedAt=null
      where public.instantOffers.status in ('DECLINED','EXPIRED','WITHDRAWN');
      if found then inserted:=inserted+1; end if;
    end if;
  end loop;
  return inserted;
end; $$;
revoke all on function public.create_instant_offers(uuid,uuid,uuid[],integer[],timestamptz) from public,anon,authenticated;
grant execute on function public.create_instant_offers(uuid,uuid,uuid[],integer[],timestamptz) to service_role;

create or replace function public.respond_instant_offer(p_offer_id uuid,p_actor_id uuid,p_accept boolean,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare offer public.instantOffers; job public.jobs; cleaner public.users; bid_id uuid;
begin
  select * into offer from public.instantOffers where id=p_offer_id and cleanerId=p_actor_id for update;
  if not found then raise exception 'Offer not found'; end if;
  select * into job from public.jobs where id=offer.jobId for update;
  if exists(select 1 from public.jobEvents where jobId=job.id and idempotencyKey=p_idempotency_key) then return jsonb_build_object('status',job.status,'jobId',job.id); end if;
  if offer.status<>'OFFERED' or offer.expiresAt<=now() or job.status<>'PENDING' then raise exception 'Offer expired'; end if;
  if not p_accept then update public.instantOffers set status='DECLINED',respondedAt=now() where id=offer.id; return jsonb_build_object('status','DECLINED','jobId',job.id); end if;
  select * into cleaner from public.users where id=p_actor_id for update;
  if cleaner.status<>'AVAILABLE' or cleaner.verificationStatus<>'VERIFIED' or not cleaner.cleanerAgreementAccepted or cleaner.isSuspended or cleaner.isBanned then raise exception 'Cleaner is no longer eligible'; end if;
  if exists(select 1 from public.jobs active where active.cleanerId=p_actor_id and active.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS')) then raise exception 'Cleaner is already assigned'; end if;
  if exists(select 1 from public.bids where jobId=job.id and status='ACCEPTED') then raise exception 'A cleaner has already accepted this instant request'; end if;
  insert into public.bids(jobId,cleanerId,cleanerName,cleanerPhoto,cleanerRating,cleanerReviewCount,cleanerJobsCompleted,bidPrice,estimatedArrival,status,message,history)
    values(job.id,p_actor_id,cleaner.displayName,cleaner.photoURL,cleaner.ratingAverage,cleaner.ratingCount,cleaner.jobsCompleted,job.price,
      greatest(1,ceil(coalesce(offer.distanceMeters,1000)::numeric/500)::integer),'PENDING','Book Now request accepted; waiting for customer payment confirmation.',jsonb_build_array(jsonb_build_object('by','CLEANER','price',job.price,'createdAt',now()))) returning id into bid_id;
  update public.instantOffers set status=case when id=offer.id then 'ACCEPTED' else 'WITHDRAWN' end,respondedAt=case when id=offer.id then now() else respondedAt end where jobId=job.id and status='OFFERED';
  update public.instantOffers set status='WITHDRAWN' where jobId=job.id and id<>offer.id and status='OFFERED';
  delete from public.openJobs where jobId=job.id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,data)
    values(job.id,p_actor_id,'CLEANER','INSTANT_CLEANER_ACCEPTED','PENDING','PENDING',p_idempotency_key,jsonb_build_object('offerId',offer.id,'bidId',bid_id));
  return jsonb_build_object('status','CUSTOMER_ACTION_REQUIRED','jobId',job.id,'customerId',job.customerId,'bidId',bid_id);
end; $$;
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
  if new.cleanerId is not null and new.status='ASSIGNED' and (tg_op='INSERT' or old.cleanerId is distinct from new.cleanerId or old.status is distinct from new.status) then
    duration:=greatest(30,least(720,coalesce(new.estimatedDuration,120)));
    starts_at:=coalesce(new.scheduledDateTime,now()); ends_at:=starts_at+make_interval(mins=>duration);
    if exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=new.cleanerId and tstzrange(b.startsAt,b.endsAt,'[)') && tstzrange(starts_at,ends_at+interval '60 minutes','[)') and (b.jobId is null or b.jobId<>new.id)) then
      raise exception 'CLEANER_UNAVAILABLE';
    end if;
    insert into public.cleanerAvailabilityBlocks(cleanerId,jobId,startsAt,endsAt,blockType)
      values(new.cleanerId,new.id,starts_at,ends_at,'BOOKING') on conflict(jobId,blockType) where jobId is not null do nothing;
    insert into public.cleanerAvailabilityBlocks(cleanerId,jobId,startsAt,endsAt,blockType)
      values(new.cleanerId,new.id,ends_at,ends_at+interval '60 minutes','BUFFER') on conflict(jobId,blockType) where jobId is not null do nothing;
  elsif new.status not in ('ASSIGNED','EN_ROUTE','IN_PROGRESS') and old.status is distinct from new.status then
    delete from public.cleanerAvailabilityBlocks where jobId=new.id;
  end if;
  return new;
end; $$;
drop trigger if exists jobs_assignment_availability on public.jobs;
create trigger jobs_assignment_availability before update of cleanerId,status on public.jobs
for each row execute function public.on_job_assignment_block_availability();

-- Keep accepted assignments and their travel buffers in sync when either
-- participant reschedules. The exclusion constraint makes this atomic with
-- any competing acceptance or reschedule.
create or replace function public.on_job_reschedule_availability()
returns trigger language plpgsql security definer set search_path=public
as $$
declare starts_at timestamptz; ends_at timestamptz; duration integer;
begin
  if new.cleanerId is null or new.status not in ('ASSIGNED','EN_ROUTE','IN_PROGRESS')
     or new.scheduledDateTime is not distinct from old.scheduledDateTime then return new; end if;
  if new.status in ('EN_ROUTE','IN_PROGRESS') then raise exception 'Started bookings cannot be rescheduled'; end if;
  duration:=greatest(30,least(720,coalesce(new.estimatedDuration,120)));
  starts_at:=coalesce(new.scheduledDateTime,now()); ends_at:=starts_at+make_interval(mins=>duration);
  update public.cleanerAvailabilityBlocks set startsAt=starts_at,endsAt=ends_at
    where jobId=new.id and blockType='BOOKING';
  update public.cleanerAvailabilityBlocks set startsAt=ends_at,endsAt=ends_at+interval '60 minutes'
    where jobId=new.id and blockType='BUFFER';
  return new;
end; $$;
drop trigger if exists jobs_reschedule_availability on public.jobs;
create trigger jobs_reschedule_availability before update of scheduledDateTime on public.jobs
for each row execute function public.on_job_reschedule_availability();

-- Cover historical assigned jobs that predate availability blocks. This is a
-- second guard in addition to the exclusion constraint for all new bookings.
create or replace function public.guard_job_assignment_conflicts()
returns trigger language plpgsql security definer set search_path=public
as $$
declare starts_at timestamptz; ends_at timestamptz;
begin
  if new.cleanerId is null or new.status not in ('ASSIGNED','EN_ROUTE','IN_PROGRESS') then return new; end if;
  starts_at:=coalesce(new.scheduledDateTime,now());
  ends_at:=starts_at+make_interval(mins=>greatest(30,least(720,coalesce(new.estimatedDuration,120)))+60);
  if exists(select 1 from public.jobs other where other.id<>new.id and other.cleanerId=new.cleanerId
    and other.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS')
    and tstzrange(coalesce(other.scheduledDateTime,now()),coalesce(other.scheduledDateTime,now())+
      make_interval(mins=>greatest(30,least(720,coalesce(other.estimatedDuration,120)))+60),'[)') && tstzrange(starts_at,ends_at,'[)')) then
    raise exception 'CLEANER_UNAVAILABLE';
  end if;
  return new;
end; $$;
drop trigger if exists jobs_assignment_conflict_guard on public.jobs;
create trigger jobs_assignment_conflict_guard before insert or update of cleanerId,status,scheduledDateTime,estimatedDuration on public.jobs
for each row execute function public.guard_job_assignment_conflicts();

create or replace function public.reschedule_booking(p_job_id uuid,p_actor_id uuid,p_scheduled_at timestamptz,p_idempotency_key text)
returns timestamptz language plpgsql security definer set search_path=public
as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or (p_actor_id<>j.customerId and p_actor_id is distinct from j.cleanerId) then raise exception 'Only a booking participant can reschedule'; end if;
  if j.status not in ('PENDING','CONFIRMED','ASSIGNED') or p_scheduled_at<now()+interval '2 hours'
     or (j.scheduledDateTime is not null and j.scheduledDateTime<now()+interval '2 hours') then raise exception 'Booking cannot be rescheduled at this time'; end if;
  if exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key) then return j.scheduledDateTime; end if;
  update public.jobs set scheduledDateTime=p_scheduled_at,updatedAt=now() where id=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,reason,data)
    values(p_job_id,p_actor_id,case when p_actor_id=j.customerId then 'CUSTOMER' else 'CLEANER' end,'RESCHEDULED',j.status::text,j.status::text,p_idempotency_key,'Participant reschedule',jsonb_build_object('scheduledDateTime',p_scheduled_at));
  return p_scheduled_at;
end; $$;
revoke all on function public.reschedule_booking(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.reschedule_booking(uuid,uuid,timestamptz,text) to service_role;

-- Preserve legacy overlaps for support review; future changes are blocked.
do $$ declare j record; starts_at timestamptz; ends_at timestamptz; duration integer;
begin
  for j in select * from public.jobs where cleanerId is not null and status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS')
    order by scheduledDateTime nulls first,createdAt,id loop
    duration:=greatest(30,least(720,coalesce(j.estimatedDuration,120)));
    starts_at:=coalesce(j.scheduledDateTime,now()); ends_at:=starts_at+make_interval(mins=>duration);
    if not exists(select 1 from public.cleanerAvailabilityBlocks b where b.jobId=j.id)
      and not exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=j.cleanerId
        and tstzrange(b.startsAt,b.endsAt,'[)') && tstzrange(starts_at,ends_at+interval '60 minutes','[)')) then
      insert into public.cleanerAvailabilityBlocks(cleanerId,jobId,startsAt,endsAt,blockType)
        values(j.cleanerId,j.id,starts_at,ends_at,'BOOKING');
      insert into public.cleanerAvailabilityBlocks(cleanerId,jobId,startsAt,endsAt,blockType)
        values(j.cleanerId,j.id,ends_at,ends_at+interval '60 minutes','BUFFER');
    end if;
  end loop;
end $$;

create or replace function public.consume_rate_limit(p_key text,p_max integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public
as $$
declare current_count integer;
begin
  insert into public.authRateLimits(key,count,windowStartedAt,expiresAt)
    values(left(p_key,180),1,now(),now()+make_interval(secs=>greatest(1,p_window_seconds)))
  on conflict(key) do update set
    count=case when public.authRateLimits.expiresAt<=now() then 1 else public.authRateLimits.count+1 end,
    windowStartedAt=case when public.authRateLimits.expiresAt<=now() then now() else public.authRateLimits.windowStartedAt end,
    expiresAt=case when public.authRateLimits.expiresAt<=now() then now()+make_interval(secs=>greatest(1,p_window_seconds)) else public.authRateLimits.expiresAt end
  returning count into current_count;
  return current_count<=greatest(1,p_max);
end; $$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

-- Mirror provider disputes/refunds into the support queue operators actually use.
create or replace function public.mirror_review_case_to_support()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.supportCases(id,jobId,customerId,cleanerId,reason,status,data)
  values('review_'||left(new.id,140),new.jobId,new.customerId,new.cleanerId,coalesce(new.reason,'Payment review required'),
    case when new.status in ('PAYNOW_DISPUTE','PAYNOW_REFUND_AFTER_RELEASE') then 'URGENT' else 'OPEN' end,
    jsonb_build_object('type',new.status,'source','REVIEW_CASE','reviewCaseId',new.id,'evidence',new.evidence,'reviewData',new.data))
  on conflict(id) do update set status=case when public.supportCases.status='RESOLVED' then public.supportCases.status else excluded.status end,
    data=public.supportCases.data||excluded.data;
  return new;
end; $$;
drop trigger if exists review_case_to_support on public.reviewCases;
create trigger review_case_to_support after insert or update on public.reviewCases
for each row execute function public.mirror_review_case_to_support();

create table if not exists public.walletReconciliations(
  id uuid primary key default gen_random_uuid(),paymentId text not null references public.payments(id),userId uuid not null references public.users(id),
  amount numeric(12,2) not null check(amount>0),status text not null default 'OPEN' check(status in ('OPEN','PARTIAL','RESOLVED')),
  createdAt timestamptz not null default now(),resolvedAt timestamptz,data jsonb not null default '{}'::jsonb,
  unique(paymentId)
);
alter table public.walletReconciliations enable row level security;
create policy "Wallet reconciliation visible to owner and admin" on public.walletReconciliations for select to authenticated using(userId=auth.uid() or public.is_admin());
revoke all on public.walletReconciliations from anon,authenticated;
grant select on public.walletReconciliations to authenticated;

create or replace function public.guard_restricted_wallet_debits()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  if new.type='DEBIT' and exists(select 1 from public.users where id=new.userId and walletRestricted)
    and new.idempotencyKey not like 'topup_refund_%' and new.idempotencyKey not like 'topup_debt_offset_%' then
    raise exception 'Wallet is restricted while a refunded top-up is being reconciled';
  end if;
  return new;
end; $$;
drop trigger if exists wallet_restricted_debit_guard on public.walletTransactions;
create trigger wallet_restricted_debit_guard before insert on public.walletTransactions for each row execute function public.guard_restricted_wallet_debits();

create or replace function public.offset_wallet_reconciliation(p_user_id uuid,p_amount numeric)
returns numeric language plpgsql security definer set search_path=public
as $$
declare rec public.walletReconciliations; remaining numeric:=greatest(0,p_amount); offset_amount numeric;
begin
  for rec in select * from public.walletReconciliations where userId=p_user_id and status in ('OPEN','PARTIAL') order by createdAt for update loop
    exit when remaining<=0;
    offset_amount:=least(rec.amount,remaining);remaining:=remaining-offset_amount;
    update public.walletReconciliations set amount=greatest(0,rec.amount-offset_amount),status=case when rec.amount<=offset_amount then 'RESOLVED' else 'PARTIAL' end,resolvedAt=case when rec.amount<=offset_amount then now() else null end where id=rec.id;
  end loop;
  if not exists(select 1 from public.walletReconciliations where userId=p_user_id and status in ('OPEN','PARTIAL')) then update public.users set walletRestricted=false where id=p_user_id; end if;
  return greatest(0,p_amount)-remaining;
end; $$;
revoke all on function public.offset_wallet_reconciliation(uuid,numeric) from public,anon,authenticated;
grant execute on function public.offset_wallet_reconciliation(uuid,numeric) to service_role;

alter table public.payoutRequests add column if not exists approvedBy uuid references public.users(id);
alter table public.payoutRequests add column if not exists accountNumberCiphertext text;
alter table public.payoutRequests add column if not exists accountNumberLast4 text;

create or replace function public.request_cleaner_payout_secure(p_cleaner_id uuid,p_amount numeric,p_method text,p_account_name text,p_ciphertext text,p_last4 text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare u public.users; payout_id uuid:=gen_random_uuid(); available numeric;
begin
  select * into u from public.users where id=p_cleaner_id for update;
  if not found or u.role<>'CLEANER' then raise exception 'Only cleaners can request payouts'; end if;
  available:=greatest(0,u.earningsBalance-u.commissionBalance);
  if p_amount<5 or p_amount>available or p_method not in ('ECOCASH','INNBUCKS','BANK') or trim(p_account_name)='' or length(p_ciphertext)<32 or p_last4 !~ '^[0-9A-Za-z]{4}$' then raise exception 'Invalid payout details or amount'; end if;
  if available<p_amount then raise exception 'Insufficient cleared earnings'; end if;
  insert into public.payoutRequests(id,cleanerId,amount,method,accountName,accountNumber,accountNumberCiphertext,accountNumberLast4)
    values(payout_id,p_cleaner_id,p_amount,p_method,left(trim(p_account_name),100),'••••'||p_last4,p_ciphertext,p_last4);
  perform public.record_wallet_transaction(p_cleaner_id,'DEBIT',p_amount,'EARNINGS','Payout requested — funds reserved','payout_hold_'||payout_id,null,null);
  return payout_id;
end; $$;
revoke all on function public.request_cleaner_payout_secure(uuid,numeric,text,text,text,text) from public,anon,authenticated;
grant execute on function public.request_cleaner_payout_secure(uuid,numeric,text,text,text,text) to service_role;

create or replace function public.approve_cleaner_payout(p_payout_id uuid,p_actor_id uuid)
returns public.payoutRequests language plpgsql security definer set search_path=public
as $$
declare p public.payoutRequests;
begin
  select * into p from public.payoutRequests where id=p_payout_id for update;
  if not found or p.status<>'PENDING' then raise exception 'Payout is not awaiting approval'; end if;
  update public.payoutRequests set status='APPROVED',approvedBy=p_actor_id where id=p_payout_id returning * into p;
  insert into public.adminAuditEvents(id,action,actorId,targetId,amount,createdAt) values('payout_approve_'||p_payout_id,'cleaner_payout_approved',p_actor_id,p_payout_id::text,p.amount,now()) on conflict(id) do nothing;
  return p;
end; $$;
revoke all on function public.approve_cleaner_payout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_cleaner_payout(uuid,uuid) to service_role;

create or replace function public.settle_cleaner_payout(p_payout_id uuid,p_actor_id uuid,p_decision text,p_transfer_reference text)
returns public.payoutRequests language plpgsql security definer set search_path=public
as $$
declare p public.payoutRequests;
begin
  select * into p from public.payoutRequests where id=p_payout_id for update;
  if not found or p.status<>'APPROVED' or p.approvedBy=p_actor_id then raise exception 'A different administrator must settle an approved payout'; end if;
  if p_decision not in ('PAID','REJECTED') or (p_decision='PAID' and coalesce(trim(p_transfer_reference),'')='') then raise exception 'Invalid payout decision'; end if;
  if p_decision='REJECTED' then
    perform public.record_wallet_transaction(p.cleanerId,'CREDIT',p.amount,'EARNINGS','Payout declined — reserved funds returned','payout_reversal_'||p_payout_id,null,null);
    update public.walletTransactions set status='REVERSED' where idempotencyKey='payout_hold_'||p_payout_id;
  else
    update public.walletTransactions set status='COMPLETED',description='Payout sent ('||p_transfer_reference||')' where idempotencyKey='payout_hold_'||p_payout_id;
    -- The hold already debited earnings at request time. Do not debit a second
    -- time when recording the completed transfer.
  end if;
  update public.payoutRequests set status=p_decision,transferReference=case when p_decision='PAID' then left(trim(p_transfer_reference),120) else null end,settledBy=p_actor_id,settledAt=now() where id=p_payout_id returning * into p;
  insert into public.adminAuditEvents(id,action,actorId,targetId,amount,createdAt) values('payout_'||p_payout_id,'cleaner_payout_'||lower(p_decision),p_actor_id,p_payout_id::text,p.amount,now()) on conflict(id) do nothing;
  return p;
end; $$;
revoke all on function public.settle_cleaner_payout(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.settle_cleaner_payout(uuid,uuid,text,text) to service_role;

create or replace function public.apply_paynow_status(p_reference text,p_status text,p_amount numeric)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare p public.payments; j public.jobs; normalized text; current_status text; balance_type text; available numeric; reversed numeric; debt numeric;
begin
  normalized:=case lower(regexp_replace(trim(p_status),'[_-]+',' ','g')) when 'awaiting delivery' then 'ESCROWED' when 'delivered' then 'DELIVERED' when 'paid' then 'PAID' when 'disputed' then 'DISPUTED' when 'refunded' then 'REFUNDED' else null end;
  if normalized is null then return jsonb_build_object('status','IGNORED'); end if;
  select * into p from public.payments where reference=p_reference for update;
  if not found then raise exception 'Paynow reference not found'; end if;
  if abs(p.amount-p_amount)>0.009 then raise exception 'Paynow amount does not match'; end if;
  current_status:=coalesce(p.status,'PENDING');
  if p.jobId is null and p.data->>'type'='wallet_topup' then
    if current_status='REFUNDED' then return jsonb_build_object('status','REFUNDED','paymentId',p.id); end if;
    if normalized='REFUNDED' then
      update public.payments set status='REFUNDED',providerStatus=p_status,updatedAt=now() where id=p.id;
      select case when coalesce(u.role,'CUSTOMER')='CLEANER' then 'COMMISSION' else 'GENERAL' end,
        case when coalesce(u.role,'CUSTOMER')='CLEANER' then u.commissionBalance else u.balance end
        into balance_type,available from public.users u where u.id=p.customerId for update;
      if current_status='PAID' then
        reversed:=least(p.amount,greatest(0,coalesce(available,0))); debt:=p.amount-reversed;
        if reversed>0 then perform public.record_wallet_transaction(p.customerId,'DEBIT',reversed,balance_type,'Reversal of refunded Paynow wallet top-up','topup_refund_'||p.id,null,p.id); end if;
        if debt>0 then
          insert into public.walletReconciliations(paymentId,userId,amount,status,data) values(p.id,p.customerId,debt,'OPEN',jsonb_build_object('providerStatus',p_status,'creditedAmount',p.amount,'reversedAmount',reversed)) on conflict(paymentId) do nothing;
          update public.users set walletRestricted=true where id=p.customerId;
        end if;
      end if;
      return jsonb_build_object('status','REFUNDED','paymentId',p.id,'reversedAmount',coalesce(reversed,0),'requiresReconciliation',coalesce(debt,0)>0);
    end if;
    if current_status='PAID' and normalized<>'REFUNDED' then return jsonb_build_object('status','PAID','paymentId',p.id); end if;
    update public.payments set status=normalized,providerStatus=p_status,updatedAt=now() where id=p.id;
    if normalized='PAID' and current_status<>'PAID' then
      select role into current_status from public.users where id=p.customerId;
      balance_type:=case when current_status='CLEANER' then 'COMMISSION' else 'GENERAL' end;
      perform public.record_wallet_transaction(p.customerId,'CREDIT',p.amount,balance_type,'Paynow wallet top-up '||p.reference,'wallet_topup_'||p.id,null,p.id);
      reversed:=public.offset_wallet_reconciliation(p.customerId,p.amount);
      if reversed>0 then perform public.record_wallet_transaction(p.customerId,'DEBIT',reversed,balance_type,'Offset of refunded Paynow top-up balance','topup_debt_offset_'||p.id,null,p.id); end if;
    end if;
    return jsonb_build_object('status',normalized,'paymentId',p.id);
  end if;
  select * into j from public.jobs where id=p.jobId for update;
  if not found then raise exception 'Paynow booking not found'; end if;
  if current_status='REFUNDED' then return jsonb_build_object('status','REFUNDED','jobId',j.id); end if;
  if current_status='PAID' and normalized not in ('REFUNDED','DISPUTED') then return jsonb_build_object('status','PAID','jobId',j.id); end if;
  update public.payments set status=normalized,providerStatus=p_status,updatedAt=now(),data=data||jsonb_build_object('statusUpdatedAt',now()) where id=p.id;
  update public.jobs set paymentStatus=normalized,updatedAt=now(),data=data||case when normalized='DISPUTED' then jsonb_build_object('reviewState','PAYNOW_DISPUTE') else '{}'::jsonb end where id=j.id;
  if normalized='DISPUTED' then
    insert into public.reviewCases(id,jobId,customerId,cleanerId,reporterId,status,reason,data)
    values('paynow_'||j.id,j.id,j.customerId,j.cleanerId,j.customerId,'PAYNOW_DISPUTE','Customer opened a Paynow BuySafe dispute.','{}'::jsonb) on conflict(id) do nothing;
  elsif normalized='REFUNDED' and (current_status in ('PAID','DISPUTED','DELIVERED','ESCROWED','PENDING')) then
    insert into public.reviewCases(id,jobId,customerId,cleanerId,reporterId,status,reason,data)
    values('paynow_refund_'||j.id,j.id,j.customerId,j.cleanerId,j.customerId,'PAYNOW_REFUND','Paynow reported a refund requiring reconciliation.','{}'::jsonb) on conflict(id) do nothing;
  elsif normalized='PAID' then perform public.release_paynow_earnings(j.id);
  end if;
  return jsonb_build_object('status',normalized,'jobId',j.id,'cleanerId',j.cleanerId);
end; $$;
revoke all on function public.apply_paynow_status(text,text,numeric) from public,anon,authenticated;
grant execute on function public.apply_paynow_status(text,text,numeric) to service_role;

create table if not exists public.notificationDeliveries(
  id uuid primary key default gen_random_uuid(),notificationId uuid not null references public.notifications(id) on delete cascade,
  userId uuid not null references public.users(id) on delete cascade,provider text not null check(provider in ('EXPO','TWILIO')),
  destination text not null,payload jsonb not null default '{}'::jsonb,status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','DELIVERED','FAILED')),
  attempts integer not null default 0,nextAttemptAt timestamptz not null default now(),lastError text,providerReceiptId text,receiptCheckedAt timestamptz,createdAt timestamptz not null default now(),updatedAt timestamptz not null default now(),
  unique(notificationId,provider)
);
create index if not exists notification_deliveries_due_idx on public.notificationDeliveries(status,nextAttemptAt,createdAt);
alter table public.notificationDeliveries enable row level security;
revoke all on public.notificationDeliveries from anon,authenticated;

create or replace function public.claim_notification_deliveries(p_limit integer default 100)
returns setof public.notificationDeliveries language plpgsql security definer set search_path=public
as $$ begin
  return query with due as (
    select id from public.notificationDeliveries where (status='PENDING' and nextAttemptAt<=now()) or (status='PROCESSING' and updatedAt<now()-interval '5 minutes')
    order by nextAttemptAt,createdAt for update skip locked limit greatest(1,least(p_limit,200))
  ) update public.notificationDeliveries d set status='PROCESSING',attempts=d.attempts+1,updatedAt=now() from due where d.id=due.id returning d.*;
end; $$;
revoke all on function public.claim_notification_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;

create or replace function public.finish_notification_delivery(p_id uuid,p_success boolean,p_error text default null,p_receipt_id text default null)
returns void language plpgsql security definer set search_path=public
as $$ declare current_delivery public.notificationDeliveries; begin
  select * into current_delivery from public.notificationDeliveries where id=p_id for update;
  if not found then return; end if;
  update public.notificationDeliveries set status=case when p_success then 'DELIVERED' when attempts>=6 then 'FAILED' else 'PENDING' end,
    nextAttemptAt=now()+make_interval(secs=>least(3600,power(2,least(attempts,10))::integer*15)),lastError=case when p_success then null else left(coalesce(p_error,'Provider delivery failed'),500) end,
    providerReceiptId=case when p_success then left(p_receipt_id,200) else providerReceiptId end,updatedAt=now()
    where id=p_id;
end; $$;
revoke all on function public.finish_notification_delivery(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.finish_notification_delivery(uuid,boolean,text,text) to service_role;

create or replace function public.complete_booking_customer_response(p_job_id uuid,p_actor_id uuid,p_response text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare job public.jobs; response text:=upper(p_response);
begin
  select * into job from public.jobs where id=p_job_id and customerId=p_actor_id for update;
  if not found or job.status<>'COMPLETED' or job.completionSubmittedAt is null then raise exception 'Completion response is not available'; end if;
  if not exists(select 1 from public.users where id=p_actor_id and role='CUSTOMER') then raise exception 'Only the customer can respond to completion'; end if;
  if job.customerResponseAt is not null then return jsonb_build_object('status','ALREADY_RESPONDED'); end if;
  if response not in ('CONFIRMED','DISPUTED') then raise exception 'Invalid completion response'; end if;
  update public.jobs set customerResponseAt=now(),data=data||jsonb_build_object('customerCompletionResponse',jsonb_build_object('status',response,'reason',left(p_reason,1000),'at',now())) where id=p_job_id;
  if response='DISPUTED' then
    insert into public.supportCases(id,jobId,customerId,cleanerId,reason,status,data)
      values('completion_'||p_job_id,p_job_id,job.customerId,job.cleanerId,left(coalesce(p_reason,'Customer disputed completion'),500),'URGENT',jsonb_build_object('type','COMPLETION_DISPUTE','reporterId',p_actor_id)) on conflict(id) do nothing;
    return jsonb_build_object('status','DISPUTED');
  end if;
  insert into public.jobEvents(jobId,actorId,actorRole,type,newState,idempotencyKey,data)
    values(p_job_id,p_actor_id,'CUSTOMER','COMPLETION_CONFIRMED','COMPLETED','customer_confirmed_'||p_job_id::text,jsonb_build_object('at',now())) on conflict(jobId,idempotencyKey) do nothing;
  return jsonb_build_object('status','CONFIRMED');
end; $$;
revoke all on function public.complete_booking_customer_response(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_booking_customer_response(uuid,uuid,text,text) to service_role;

create or replace function public.expire_unanswered_completions(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public
as $$
declare affected integer;
begin
  with due as (select id from public.jobs where status='COMPLETED' and completionSubmittedAt<=now()-interval '24 hours' and customerResponseAt is null order by completionSubmittedAt for update skip locked limit greatest(1,least(p_limit,500))),
  updated as (update public.jobs j set customerResponseAt=now(),data=j.data||jsonb_build_object('customerCompletionResponse',jsonb_build_object('status','AUTO_CONFIRMED','at',now())) from due where j.id=due.id returning j.id)
  insert into public.jobEvents(jobId,actorRole,type,newState,idempotencyKey,data)
    select updated.id,'SYSTEM','COMPLETION_AUTO_CONFIRMED','COMPLETED','completion_timeout_'||updated.id::text,jsonb_build_object('at',now()) from updated on conflict(jobId,idempotencyKey) do nothing;
  get diagnostics affected=row_count;
  return affected;
end; $$;
revoke all on function public.expire_unanswered_completions(integer) from public,anon,authenticated;
grant execute on function public.expire_unanswered_completions(integer) to service_role;
