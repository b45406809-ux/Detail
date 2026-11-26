-- App Review sandbox, single-account flow: a review account can quote on and accept
-- its own booking (switching between Customer and Cleaner), so a reviewer can test
-- everything with one account. Real accounts are unchanged: OWN_QUOTE still applies.

create or replace function public.accept_bid(
  p_actor_id uuid,p_job_id uuid,p_bid_id uuid,p_payment_method text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  j public.jobs; b public.bids; cleaner public.users; customer public.users;
  existing_event public.jobEvents; payment public.payments;
  amount numeric(12,2); commission numeric(12,2); payment_status text;
  payment_reference text; payment_provider text; commission_policy smallint;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if j.customerId<>p_actor_id then raise exception 'Only the customer can accept a bid'; end if;
  select * into existing_event from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key and type='BID_ACCEPTED';
  if found then
    if existing_event.actorId<>p_actor_id or existing_event.data->>'bidId'<>p_bid_id::text then raise exception 'Idempotency key is already bound to another acceptance'; end if;
    select * into payment from public.payments where id=p_job_id::text||'_booking';
    select * into cleaner from public.users where id=j.cleanerId;
    return jsonb_build_object('success',true,'state','ASSIGNED','replayed',true,'paymentMethod',existing_event.data->>'paymentMethod',
      'payment',jsonb_build_object('status',payment.status,'amount',payment.amount,'reference',payment.reference),
      'redirectUrl',payment.redirectUrl,'cleanerId',j.cleanerId,'cleanerName',cleaner.displayName);
  end if;
  select * into b from public.bids where id=p_bid_id and jobId=p_job_id for update;
  if not found then raise exception 'Bid not found'; end if;
  if j.status not in ('PENDING','CONFIRMED') or j.cleanerId is not null then raise exception 'JOB_UNAVAILABLE'; end if;
  if b.status not in ('PENDING','COUNTERED') then raise exception 'BID_UNAVAILABLE'; end if;
  if p_payment_method not in ('WALLET','CASH','ECOCASH','INNBUCKS','PAYNOW','DIRECT_OFFLINE') then raise exception 'Invalid payment method'; end if;
  p_payment_method:='DIRECT_OFFLINE';
  select * into customer from public.users where id=p_actor_id for update;
  select * into cleaner from public.users where id=b.cleanerId for update;
  -- A review (sandbox) account may accept its own quote so one App Review account can test both sides.
  if b.cleanerId=p_actor_id and not public.is_review_account(p_actor_id) then raise exception 'OWN_QUOTE'; end if;
  -- Eligibility is the cleaner's registration, not the role they are currently
  -- viewing the app in: a cleaner who switches to customer mode keeps quotes valid.
  if cleaner.id is null or cleaner.verificationStatus<>'VERIFIED' or not cleaner.cleanerAgreementAccepted
     or not cleaner.cleanerOnboardingComplete or cleaner.isSuspended or cleaner.isBanned
     or cleaner.accountDeletedAt is not null then raise exception 'Cleaner is not eligible'; end if;
  if cleaner.photoURL is distinct from 'detail-media/profile-photos/'||cleaner.id::text||'/avatar.jpg' or cleaner.cleanerSelfieAt is null then
    raise exception 'This cleaner must update their customer-visible profile selfie before this quote can be accepted';
  end if;
  if coalesce(cleaner.commissionOwed,0)>0 then raise exception 'Pay any outstanding commission before accepting more work'; end if;
  amount:=round(b.bidPrice,2); commission:=round(amount*0.1,2);
  if p_payment_method='WALLET' then
    if customer.balance<amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
    perform public.record_wallet_transaction(p_actor_id,'DEBIT',amount,'GENERAL','Held for booking '||p_job_id,'booking_capture_'||p_job_id,p_job_id,null);
  end if;
  payment_status:=case when p_payment_method='WALLET' then 'CAPTURED' when p_payment_method='PAYNOW' then 'INITIATING' when p_payment_method='DIRECT_OFFLINE' then 'PENDING' else 'AUTHORIZED' end;
  payment_reference:=case when p_payment_method='PAYNOW' then p_job_id::text||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,12) else null end;
  payment_provider:=case when p_payment_method='PAYNOW' then 'PAYNOW' when p_payment_method='DIRECT_OFFLINE' then 'OFFLINE' else p_payment_method end;
  commission_policy:=case when p_payment_method='DIRECT_OFFLINE' then 2 else null end;
  insert into public.payments(id,jobId,customerId,cleanerId,provider,reference,amount,status,idempotencyKey,createdAt,data)
    values(p_job_id::text||'_booking',p_job_id,p_actor_id,b.cleanerId,payment_provider,payment_reference,amount,payment_status,p_idempotency_key,now(),
      jsonb_build_object('method',p_payment_method,'originalSource',p_payment_method,'suppliesFee',0,'paymentUnavailable',p_payment_method='DIRECT_OFFLINE','detailProcessing',p_payment_method<>'DIRECT_OFFLINE'))
    on conflict(id) do update set cleanerId=excluded.cleanerId,amount=excluded.amount,status=excluded.status,idempotencyKey=excluded.idempotencyKey,reference=excluded.reference,data=excluded.data;
  update public.bids set status=case when id=p_bid_id then 'ACCEPTED' else 'REJECTED' end,updatedAt=now() where jobId=p_job_id and status in ('PENDING','COUNTERED');
  update public.jobs set status='ASSIGNED',cleanerId=b.cleanerId,cleanerName=b.cleanerName,cleanerPhoto=b.cleanerPhoto,cleanerRating=b.cleanerRating,
    cleanerPhone=cleaner.phone,customerPhone=customer.phone,price=amount,paymentMethod=p_payment_method,paymentStatus=payment_status,
    paidAt=case when p_payment_method='DIRECT_OFFLINE' then null else paidAt end,directCommissionPolicyVersion=commission_policy,
    updatedAt=now(),data=data||jsonb_build_object('acceptedAt',now(),'paymentUnavailable',p_payment_method='DIRECT_OFFLINE',
      'directCommissionPolicyVersion',commission_policy,'directCommissionRate',case when p_payment_method='DIRECT_OFFLINE' then 0.10 else null end) where id=p_job_id returning * into j;
  delete from public.openJobs where jobId=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,data)
    values(p_job_id,p_actor_id,'CUSTOMER','BID_ACCEPTED','CONFIRMED','ASSIGNED',p_idempotency_key,jsonb_build_object('bidId',p_bid_id,'paymentMethod',p_payment_method,'amount',amount,'commissionReserve',0));
  return jsonb_build_object('success',true,'state','ASSIGNED','replayed',false,'paymentMethod',p_payment_method,
    'payment',jsonb_build_object('status',payment_status,'amount',amount,'reference',payment_reference),
    'cleanerId',b.cleanerId,'cleanerName',b.cleanerName,'commissionReserved',0);
end; $$;
revoke all on function public.accept_bid(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.accept_bid(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.notify_scheduled_job_cleaners(p_job_id uuid,p_customer_id uuid,p_limit integer default 20)
returns integer language plpgsql security definer set search_path=public,extensions
as $$
declare job_record public.jobs; point extensions.geography(Point,4326); starts_at timestamptz;
  duration integer; candidate record; target_cleaner_id uuid; notified integer:=0;
  service_label text; budget_label text; when_label text; distance_label text; review_pair boolean;
begin
  select * into job_record from public.jobs where id=p_job_id and customerId=p_customer_id for update;
  if not found or job_record.status<>'PENDING' or job_record.bookingMode<>'SCHEDULED' then raise exception 'Scheduled booking is unavailable'; end if;
  if coalesce((job_record.data->>'isFavoriteRebook')::boolean,false) then
    begin target_cleaner_id:=nullif(job_record.data->>'preferredCleanerId','')::uuid;
    exception when invalid_text_representation then raise exception 'Invalid preferred cleaner on rebooking'; end;
    if target_cleaner_id is null then raise exception 'Rebooking has no selected cleaner'; end if;
  end if;
  review_pair:=public.is_review_account(p_customer_id);
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
      and (u.id<>p_customer_id or review_pair)
      and u.isReviewAccount=review_pair
      and u.role in ('CLEANER','CUSTOMER') and u.verificationStatus='VERIFIED' and u.cleanerAgreementAccepted
      and not u.isSuspended and not u.isBanned and u.accountDeletedAt is null
      -- Review accounts reach each other from any location, online or not; real cleaners must be online nearby.
      and (review_pair or (u.role='CLEANER' and u.status='AVAILABLE'
        and u.locationPoint is not null and u.locationUpdatedAt>now()-interval '60 minutes'
        and extensions.st_dwithin(u.locationPoint,point,least(100000,coalesce(u.serviceRadiusKm,25)*1000))))
      and (cardinality(u.serviceCategories)=0 or job_record.category=any(u.serviceCategories))
      and not exists(select 1 from public.jobs a where a.cleanerId=u.id and a.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS'))
      and not exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=u.id
        and b.startsAt<starts_at+make_interval(mins=>duration+60) and b.endsAt>starts_at)
    order by u.locationPoint<->point nulls last limit case when target_cleaner_id is null then greatest(1,least(coalesce(p_limit,20),50)) else 1 end
  loop
    insert into public.scheduledJobNotices(jobId,cleanerId) values(p_job_id,candidate.id) on conflict(jobId,cleanerId) do nothing;
    if found then
      distance_label:=case when candidate.meters is null then 'nearby' when candidate.meters<1000 then 'under 1 km away' else trim(to_char(candidate.meters/1000.0,'FM990.0'))||' km away' end;
      perform public.create_notification_outbox(candidate.id,
        case when target_cleaner_id is null then service_label||' request '||distance_label else 'A customer wants to book you again' end,
        case when target_cleaner_id is null then budget_label||' · '||when_label||'. Review the job and send a quote if it fits.'
          else service_label||' · '||when_label||'. Review the job details and send your quote in Detail.' end,
        'NEW_SCHEDULED_JOB',p_job_id,jsonb_build_object('bookingMode','SCHEDULED','isFavoriteRebook',target_cleaner_id is not null,'distanceMeters',case when candidate.meters is null then null else round(candidate.meters) end));
      notified:=notified+1;
    end if;
  end loop;
  return notified;
end;
$$;
