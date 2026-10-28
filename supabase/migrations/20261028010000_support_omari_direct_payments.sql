-- Add Omari as a direct-to-cleaner payment method.
-- It does not use Paynow BuySafe; preserve commission reserves and booking
-- cancellation behavior for this manually reconciled transfer method.
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
  if p_payment_method not in ('WALLET','CASH','ECOCASH','INNBUCKS','OMARI','PAYNOW') then raise exception 'Invalid payment method'; end if;
  select * into customer from public.users where id=p_actor_id for update;
  select * into cleaner from public.users where id=b.cleanerId for update;
  if cleaner.id is null or cleaner.role<>'CLEANER' or cleaner.verificationStatus<>'VERIFIED' or not cleaner.cleanerAgreementAccepted or cleaner.isSuspended or cleaner.isBanned then raise exception 'Cleaner is not eligible'; end if;
  amount:=round(b.bidPrice+case when j.bookingMode='INSTANT' then 0 else coalesce(j.suppliesFee,0) end,2);
  commission:=round(amount*0.1,2);
  if p_payment_method='WALLET' then
    if customer.balance<amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
    perform public.record_wallet_transaction(p_actor_id,'DEBIT',amount,'GENERAL','Held for booking '||p_job_id,'booking_capture_'||p_job_id,p_job_id,null);
  elsif p_payment_method in ('CASH','ECOCASH','INNBUCKS','OMARI') then
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

create or replace function public.settle_job_payment(p_job_id uuid,p_actor_id uuid,p_payment_method text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare
  j public.jobs;
  gross numeric(12,2);
  commission numeric(12,2);
  net numeric(12,2);
  completion_response text;
  dispute_release boolean;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.customerId<>p_actor_id then raise exception 'Only the customer can settle this booking'; end if;
  if j.paidAt is not null or j.paymentMethod='PAYNOW' then raise exception 'Booking is already paid or uses Paynow'; end if;
  if j.status<>'COMPLETED' or j.cleanerId is null then raise exception 'Cleaner must complete the booking first'; end if;
  if j.paymentMethod is not null and j.paymentMethod<>p_payment_method then raise exception 'Payment method cannot be changed'; end if;
  if p_payment_method not in ('WALLET','CASH','ECOCASH','INNBUCKS','OMARI') then raise exception 'Invalid payment method'; end if;

  completion_response:=j.data #>> '{customerCompletionResponse,status}';
  select exists(select 1 from public.supportCases c where c.jobId=p_job_id
    and c.data->>'type'='COMPLETION_DISPUTE'
    and c.data->>'settlementDecision'='RELEASE_EARNINGS') into dispute_release;
  if j.customerResponseAt is null or (coalesce(completion_response,'') not in ('CONFIRMED','AUTO_CONFIRMED') and not dispute_release) then
    raise exception 'Completion must be confirmed or the dispute resolved before settlement';
  end if;
  if exists(select 1 from public.supportCases c where c.jobId=p_job_id
      and c.data->>'type'='COMPLETION_DISPUTE'
      and c.data->>'settlementDecision' is distinct from 'RELEASE_EARNINGS') then
    raise exception 'Completion dispute is still open or held for refund review';
  end if;

  gross:=round(coalesce(j.price,0),2);
  if gross<=0 then raise exception 'Invalid booking price'; end if;
  commission:=round(gross*0.1,2); net:=gross-commission;
  if p_payment_method='WALLET' then
    perform public.record_wallet_transaction(j.cleanerId,'CREDIT',net,'EARNINGS','Earnings from '||j.serviceType,'wallet_earning_'||p_job_id,p_job_id,null);
  end if;
  update public.users set jobsCompleted=jobsCompleted+1 where id=j.cleanerId;
  insert into public.platformTransactions(id,jobId,type,amount,status,data)
    values('commission_'||p_job_id,p_job_id,'COMMISSION',commission,'COMPLETED',jsonb_build_object('rate',0.1,'source',p_payment_method))
    on conflict(id) do nothing;
  update public.jobs set paidAt=now(),paymentMethod=p_payment_method,paymentStatus='PAID',
    earnings=jsonb_build_object('gross',gross,'commission',commission,'net',net,'finalized',true),updatedAt=now()
    where id=p_job_id;
  update public.payments set status='PAID',data=data||jsonb_build_object('settledAt',now(),'commission',commission,'cleanerNet',net)
    where jobId=p_job_id;
  return true;
end;
$$;
revoke all on function public.settle_job_payment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.settle_job_payment(uuid,uuid,text) to service_role;

create or replace function public.cancel_booking(p_job_id uuid,p_actor_id uuid,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare j public.jobs; old_status public.booking_status; event_exists boolean; refund_amount numeric(12,2) := 0; reserve public.walletTransactions;
begin
  select exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key) into event_exists;
  select * into j from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if event_exists then return coalesce(j.data->'cancellation','{}'::jsonb); end if;
  if p_actor_id <> j.customerId and p_actor_id is distinct from j.cleanerId then raise exception 'Not a booking participant'; end if;
  if j.status not in ('PENDING','CONFIRMED','ASSIGNED','EN_ROUTE','IN_PROGRESS') then raise exception 'Booking cannot be cancelled in its current state'; end if;
  old_status := j.status;
  if j.paymentMethod='PAYNOW' and j.paymentStatus in ('INITIATING','PENDING','ESCROWED','DELIVERED','PAID','DISPUTED') then raise exception 'Paynow BuySafe payment requires support review'; end if;
  if j.paymentMethod='WALLET' then
    refund_amount := round(coalesce(j.price,0) * case when j.status in ('EN_ROUTE','IN_PROGRESS') then 0.5 else 1 end,2);
    if refund_amount > 0 then perform public.record_wallet_transaction(j.customerId,'CREDIT',refund_amount,'GENERAL','Booking cancellation refund','refund_'||p_idempotency_key,p_job_id,null); end if;
  end if;
  select * into reserve from public.walletTransactions where idempotencyKey='commission_reserve_'||p_job_id;
  if j.paymentMethod in ('CASH','ECOCASH','INNBUCKS','OMARI') and reserve.id is not null and reserve.status <> 'REVERSED' then
    perform public.record_wallet_transaction(j.cleanerId,'CREDIT',reserve.amount,'COMMISSION','Commission reserve returned after cancellation','commission_reserve_refund_'||p_job_id,p_job_id,null);
    update public.walletTransactions set status='REVERSED' where id=reserve.id;
  end if;
  update public.jobs set status='CANCELLED',updatedAt=now(),data=data||jsonb_build_object('cancellation',jsonb_build_object('reason',left(p_reason,500),'actorId',p_actor_id,'refundAmount',refund_amount,'refundStatus',case when refund_amount>0 then 'REFUNDED' else 'NOT_REQUIRED' end),'cancelledAt',now()) where id=p_job_id returning * into j;
  delete from public.openJobs where jobId=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,data)
  values(p_job_id,p_actor_id,case when p_actor_id=j.customerId then 'CUSTOMER' else 'CLEANER' end,'CANCELLATION',old_status::text,'CANCELLED',p_idempotency_key,jsonb_build_object('refundAmount',refund_amount,'reason',p_reason));
  return jsonb_build_object('status',case when refund_amount>0 then 'REFUNDED' else 'NOT_REQUIRED' end,'amount',refund_amount);
end;
$$;
revoke all on function public.cancel_booking(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.cancel_booking(uuid,uuid,text,text) to service_role;

create or replace function public.admin_cancel_booking(p_job_id uuid,p_actor_id uuid,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare j public.jobs; reserve public.walletTransactions; old_status public.booking_status; refund numeric(12,2):=0; refund_state text:='NOT_REQUIRED';
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key) then return coalesce(j.data->'cancellation','{}'::jsonb); end if;
  if j.status in ('COMPLETED','CANCELLED') then raise exception 'Booking is already closed'; end if;
  old_status:=j.status;
  if j.paymentMethod='WALLET' and coalesce(j.price,0)>0 then
    refund:=round(j.price*case when j.status in ('EN_ROUTE','IN_PROGRESS') then 0.5 else 1 end,2);
    perform public.record_wallet_transaction(j.customerId,'CREDIT',refund,'GENERAL','Admin booking cancellation refund','admin_cancel_'||p_idempotency_key,p_job_id,null);
    refund_state:='REFUNDED';
  elsif j.paymentMethod='PAYNOW' and j.paymentStatus in ('PENDING','ESCROWED','DELIVERED','PAID','DISPUTED') then refund_state:='PAYNOW_MANUAL_REVIEW';
  end if;
  if j.paymentMethod in ('CASH','ECOCASH','INNBUCKS','OMARI') and j.cleanerId is not null then
    select * into reserve from public.walletTransactions where idempotencyKey='commission_reserve_'||p_job_id for update;
    if found and reserve.status<>'REVERSED' then
      perform public.record_wallet_transaction(j.cleanerId,'CREDIT',reserve.amount,'COMMISSION','Commission reserve returned after admin cancellation','admin_commission_refund_'||p_idempotency_key,p_job_id,null);
      update public.walletTransactions set status='REVERSED' where id=reserve.id;
    end if;
  end if;
  update public.jobs set status='CANCELLED',updatedAt=now(),data=data||jsonb_build_object('cancellation',jsonb_build_object('reason',left(p_reason,500),'actorId',p_actor_id,'refundAmount',refund,'refundStatus',refund_state,'requestedAt',now())) where id=p_job_id returning * into j;
  delete from public.openJobs where jobId=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,reason,data)
  values(p_job_id,p_actor_id,'ADMIN','CANCELLATION',old_status::text,'CANCELLED',p_idempotency_key,left(p_reason,500),jsonb_build_object('refundAmount',refund,'refundStatus',refund_state));
  return jsonb_build_object('status',refund_state,'amount',refund);
end; $$;
revoke all on function public.admin_cancel_booking(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_cancel_booking(uuid,uuid,text,text) to service_role;


-- Allow encrypted manual cleaner payouts to an Omari wallet.
create or replace function public.request_cleaner_payout_idempotent(
  p_cleaner_id uuid,
  p_amount numeric,
  p_method text,
  p_account_name text,
  p_ciphertext text,
  p_last4 text,
  p_operation_key text,
  p_request_hash text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  cleaner public.users;
  existing public.payoutRequests;
  payout_id uuid:=gen_random_uuid();
  available numeric;
begin
  select * into cleaner from public.users where id=p_cleaner_id for update;
  if not found or cleaner.role<>'CLEANER' or cleaner.isSuspended or cleaner.isBanned or cleaner.accountDeletedAt is not null then
    raise exception 'Only an active cleaner can request a payout';
  end if;
  if p_operation_key is null or p_request_hash is null
     or p_operation_key !~ '^[A-Za-z0-9_-]{8,160}$' or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid payout operation key';
  end if;
  select * into existing from public.payoutRequests where cleanerId=p_cleaner_id and operationKey=p_operation_key;
  if found then
    if existing.requestHash is distinct from p_request_hash then raise exception 'Payout operation key was already used for different details'; end if;
    return existing.id;
  end if;
  available:=greatest(0,cleaner.earningsBalance-cleaner.commissionBalance);
  if p_amount<5 or p_amount>available or p_method not in ('ECOCASH','INNBUCKS','OMARI','BANK')
     or trim(coalesce(p_account_name,''))='' or length(coalesce(p_ciphertext,''))<32 or p_last4 !~ '^[0-9A-Za-z]{4}$' then
    raise exception 'Invalid payout details or amount';
  end if;
  if available<p_amount then raise exception 'Insufficient cleared earnings'; end if;
  insert into public.payoutRequests(id,cleanerId,amount,method,accountName,accountNumber,accountNumberCiphertext,accountNumberLast4,operationKey,requestHash)
    values(payout_id,p_cleaner_id,p_amount,p_method,left(trim(p_account_name),100),'••••'||p_last4,p_ciphertext,p_last4,p_operation_key,p_request_hash);
  perform public.record_wallet_transaction(p_cleaner_id,'DEBIT',p_amount,'EARNINGS','Payout requested — funds reserved','payout_hold_'||payout_id,null,null);
  return payout_id;
end;
$$;
revoke all on function public.request_cleaner_payout_idempotent(uuid,numeric,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.request_cleaner_payout_idempotent(uuid,numeric,text,text,text,text,text,text) to service_role;
