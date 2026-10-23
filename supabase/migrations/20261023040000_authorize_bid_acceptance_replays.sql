-- An idempotent acceptance retry must remain bound to the original customer,
-- bid, and payment method. Check ownership before reading a cached result.
create or replace function public.accept_bid(p_actor_id uuid,p_job_id uuid,p_bid_id uuid,p_payment_method text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  j public.jobs;
  b public.bids;
  cleaner public.users;
  customer public.users;
  existing_event public.jobEvents;
  payment public.payments;
  amount numeric(12,2);
  commission numeric(12,2);
  payment_status text;
  payment_reference text;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if j.customerId<>p_actor_id then raise exception 'Only the customer can accept a bid'; end if;

  select * into existing_event from public.jobEvents
    where jobId=p_job_id and idempotencyKey=p_idempotency_key and type='BID_ACCEPTED';
  if found then
    if existing_event.actorId<>p_actor_id or existing_event.data->>'bidId'<>p_bid_id::text then
      raise exception 'Idempotency key is already bound to another acceptance';
    end if;
    select * into payment from public.payments where id=p_job_id::text||'_booking';
    select * into cleaner from public.users where id=j.cleanerId;
    return jsonb_build_object(
      'success',true,'state','ASSIGNED','replayed',true,
      'paymentMethod',existing_event.data->>'paymentMethod',
      'payment',jsonb_build_object('status',payment.status,'amount',payment.amount,'reference',payment.reference),
      'redirectUrl',payment.redirectUrl,'cleanerId',j.cleanerId,'cleanerName',cleaner.displayName
    );
  end if;

  select * into b from public.bids where id=p_bid_id and jobId=p_job_id for update;
  if not found then raise exception 'Bid not found'; end if;
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
  return jsonb_build_object('success',true,'state','ASSIGNED','replayed',false,'paymentMethod',p_payment_method,
    'payment',jsonb_build_object('status',payment_status,'amount',amount,'reference',payment_reference),
    'cleanerId',b.cleanerId,'cleanerName',b.cleanerName);
end; $$;
revoke all on function public.accept_bid(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.accept_bid(uuid,uuid,uuid,text,text) to service_role;
