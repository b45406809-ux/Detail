-- A cleaner's quotes stay acceptable when they switch the app to customer mode.
-- accept_bid previously required users.role='CLEANER', but role is the mode the
-- account is currently using, so any cleaner who booked something as a customer
-- had every outstanding quote rejected as "not currently approved".
-- Also reject accepting a quote from your own account explicitly.

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
  if b.cleanerId=p_actor_id then raise exception 'OWN_QUOTE'; end if;
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
  elsif p_payment_method in ('CASH','ECOCASH','INNBUCKS','DIRECT_OFFLINE') then
    if cleaner.commissionBalance<commission then
      raise exception 'Prepaid commission is too low. Add at least $% to accept this $% booking',
        to_char(commission,'FM9999990.00'),to_char(amount,'FM9999990.00');
    end if;
    perform public.record_wallet_transaction(cleaner.id,'DEBIT',commission,'COMMISSION','Prepaid 10% commission reserve for booking '||p_job_id,'commission_reserve_'||p_job_id,p_job_id,null);
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
    values(p_job_id,p_actor_id,'CUSTOMER','BID_ACCEPTED','CONFIRMED','ASSIGNED',p_idempotency_key,jsonb_build_object('bidId',p_bid_id,'paymentMethod',p_payment_method,'amount',amount,'commissionReserve',case when p_payment_method in ('CASH','ECOCASH','INNBUCKS','DIRECT_OFFLINE') then commission else 0 end));
  return jsonb_build_object('success',true,'state','ASSIGNED','replayed',false,'paymentMethod',p_payment_method,
    'payment',jsonb_build_object('status',payment_status,'amount',amount,'reference',payment_reference),
    'cleanerId',b.cleanerId,'cleanerName',b.cleanerName,'commissionReserved',case when p_payment_method in ('CASH','ECOCASH','INNBUCKS','DIRECT_OFFLINE') then commission else 0 end);
end; $$;
revoke all on function public.accept_bid(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.accept_bid(uuid,uuid,uuid,text,text) to service_role;
