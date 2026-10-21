create or replace function public.create_booking(p_actor_id uuid, p_idempotency_key text, p_booking jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare existing_id uuid; result_id uuid := gen_random_uuid(); now_at timestamptz := now();
begin
  select jobId into existing_id from public.jobEvents where idempotencyKey = 'created_' || p_idempotency_key limit 1;
  if existing_id is not null then return existing_id; end if;
  if p_booking->>'category' not in ('HOUSE','CAR') or coalesce(trim(p_booking->>'serviceType'),'') = '' or coalesce(trim(p_booking#>>'{location,address}'),'') = '' then
    raise exception 'Service and location are required';
  end if;
  insert into public.jobs(id, customerId, customerName, customerPhoto, category, serviceType, checklist, description, location,
    scheduledTime, scheduledDateTime, timePreference, status, pricingStrategy, budget, biddingExpiresAt, reminderSent, photos, createdAt, data)
  values(result_id,p_actor_id,p_booking->>'customerName',p_booking->>'customerPhoto',p_booking->>'category',p_booking->>'serviceType',p_booking->'checklist',
    coalesce(p_booking->>'description',''),coalesce(p_booking->'location','{}'::jsonb),p_booking->>'scheduledTime',
    nullif(p_booking->>'scheduledDateTime','')::timestamptz,p_booking->>'timePreference','PENDING',coalesce(p_booking->>'pricingStrategy','RECEIVE_BIDS'),
    nullif(p_booking->>'budget','')::numeric,nullif(p_booking->>'biddingExpiresAt','')::timestamptz,coalesce((p_booking->>'reminderSent')::boolean,false),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_booking->'photos','[]'::jsonb))),'{}'),now_at,p_booking);
  insert into public.openJobs(jobId,status,category,serviceType,budget,biddingExpiresAt,customerId,createdAt,data)
  values(result_id,'PENDING',p_booking->>'category',p_booking->>'serviceType',nullif(p_booking->>'budget','')::numeric,
    nullif(p_booking->>'biddingExpiresAt','')::timestamptz,p_actor_id,now_at,p_booking);
  insert into public.jobEvents(jobId,actorId,actorRole,type,newState,idempotencyKey,createdAt)
  values(result_id,p_actor_id,'CUSTOMER','CREATION','PENDING','created_'||p_idempotency_key,now_at);
  return result_id;
end;
$$;
revoke all on function public.create_booking(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_booking(uuid,text,jsonb) to service_role;

create or replace function public.accept_bid(p_actor_id uuid, p_job_id uuid, p_bid_id uuid, p_payment_method text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare j public.jobs; b public.bids; cleaner public.users; customer public.users; event_exists boolean; amount numeric(12,2); commission numeric(12,2); payment_status text; payment_reference text;
begin
  select exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key) into event_exists;
  select * into j from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  select * into b from public.bids where id=p_bid_id and jobId=p_job_id for update;
  if not found then raise exception 'Bid not found'; end if;
  if event_exists then return jsonb_build_object('success',true,'state','ASSIGNED','payment',jsonb_build_object('status',j.paymentStatus,'amount',j.price)); end if;
  if j.customerId <> p_actor_id then raise exception 'Only the customer can accept a bid'; end if;
  if j.status not in ('PENDING','CONFIRMED') or j.cleanerId is not null then raise exception 'JOB_UNAVAILABLE'; end if;
  if b.status not in ('PENDING','COUNTERED') then raise exception 'BID_UNAVAILABLE'; end if;
  if p_payment_method not in ('WALLET','CASH','ECOCASH','INNBUCKS','PAYNOW') then raise exception 'Invalid payment method'; end if;
  select * into customer from public.users where id=p_actor_id for update;
  select * into cleaner from public.users where id=b.cleanerId for update;
  if cleaner.id is null or cleaner.role <> 'CLEANER' or cleaner.verificationStatus <> 'VERIFIED' or not cleaner.cleanerAgreementAccepted or cleaner.isSuspended or cleaner.isBanned then raise exception 'Cleaner is not eligible'; end if;
  amount := round(b.bidPrice,2); commission := round(amount*0.1,2);
  if p_payment_method='WALLET' then
    if customer.balance < amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
    perform public.record_wallet_transaction(p_actor_id,'DEBIT',amount,'GENERAL','Held for booking '||p_job_id,'booking_capture_'||p_job_id,p_job_id,null);
  elsif p_payment_method in ('CASH','ECOCASH','INNBUCKS') then
    if cleaner.commissionBalance < commission then raise exception 'Cleaner commission balance is insufficient'; end if;
    perform public.record_wallet_transaction(cleaner.id,'DEBIT',commission,'COMMISSION','Commission reserve for booking '||p_job_id,'commission_reserve_'||p_job_id,p_job_id,null);
  end if;
  payment_status := case when p_payment_method='WALLET' then 'CAPTURED' when p_payment_method='PAYNOW' then 'INITIATING' else 'AUTHORIZED' end;
  payment_reference := case when p_payment_method='PAYNOW' then p_job_id::text||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,12) else null end;
  insert into public.payments(id,jobId,customerId,cleanerId,provider,reference,amount,status,idempotencyKey,createdAt,data)
  values(p_job_id::text||'_booking',p_job_id,p_actor_id,b.cleanerId,case when p_payment_method='PAYNOW' then 'PAYNOW' else p_payment_method end,payment_reference,amount,payment_status,p_idempotency_key,now(),jsonb_build_object('method',p_payment_method,'originalSource',p_payment_method))
  on conflict(id) do update set cleanerId=excluded.cleanerId,amount=excluded.amount,status=excluded.status,idempotencyKey=excluded.idempotencyKey,reference=excluded.reference;
  update public.bids set status=case when id=p_bid_id then 'ACCEPTED' else 'REJECTED' end,updatedAt=now() where jobId=p_job_id and status in ('PENDING','COUNTERED');
  update public.jobs set status='ASSIGNED',cleanerId=b.cleanerId,cleanerName=b.cleanerName,cleanerPhoto=b.cleanerPhoto,cleanerRating=b.cleanerRating,
    cleanerPhone=cleaner.phone,customerPhone=customer.phone,price=amount,paymentMethod=p_payment_method,paymentStatus=payment_status,
    updatedAt=now(),data=data||jsonb_build_object('acceptedAt',now()) where id=p_job_id returning * into j;
  delete from public.openJobs where jobId=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,data)
    values(p_job_id,p_actor_id,'CUSTOMER','BID_ACCEPTED','CONFIRMED','ASSIGNED',p_idempotency_key,jsonb_build_object('bidId',p_bid_id,'paymentMethod',p_payment_method,'amount',amount));
  return jsonb_build_object('success',true,'state','ASSIGNED','payment',jsonb_build_object('status',payment_status,'amount',amount,'reference',payment_reference),'cleanerId',b.cleanerId,'cleanerName',b.cleanerName);
end;
$$;
revoke all on function public.accept_bid(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.accept_bid(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.request_cleaner_payout(p_cleaner_id uuid,p_amount numeric,p_method text,p_account_name text,p_account_number text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare u public.users; payout_id uuid := gen_random_uuid(); available numeric(12,2);
begin
  select * into u from public.users where id=p_cleaner_id for update;
  if not found or u.role <> 'CLEANER' then raise exception 'Only cleaners can request payouts'; end if;
  if p_amount < 5 or p_method not in ('ECOCASH','INNBUCKS','BANK') or trim(p_account_name)='' or trim(p_account_number)='' then raise exception 'Invalid payout details'; end if;
  available := greatest(0,u.balance-u.commissionBalance);
  if available < p_amount then raise exception 'Insufficient cleared earnings'; end if;
  insert into public.payoutRequests(id,cleanerId,amount,method,accountName,accountNumber) values(payout_id,p_cleaner_id,p_amount,p_method,p_account_name,p_account_number);
  perform public.record_wallet_transaction(p_cleaner_id,'DEBIT',p_amount,'EARNINGS','Payout requested — funds reserved','payout_hold_'||payout_id,null,null);
  return payout_id;
end;
$$;
revoke all on function public.request_cleaner_payout(uuid,numeric,text,text,text) from public, anon, authenticated;
grant execute on function public.request_cleaner_payout(uuid,numeric,text,text,text) to service_role;

create or replace function public.settle_cleaner_payout(p_payout_id uuid,p_actor_id uuid,p_decision text,p_transfer_reference text)
returns public.payoutRequests language plpgsql security definer set search_path = public
as $$
declare p public.payoutRequests;
begin
  select * into p from public.payoutRequests where id=p_payout_id for update;
  if not found or p.status <> 'PENDING' then raise exception 'Payout request is not pending'; end if;
  if p_decision not in ('PAID','REJECTED') or (p_decision='PAID' and coalesce(trim(p_transfer_reference),'')='') then raise exception 'Invalid payout decision'; end if;
  if p_decision='REJECTED' then
    perform public.record_wallet_transaction(p.cleanerId,'CREDIT',p.amount,'EARNINGS','Payout declined — reserved funds returned','payout_reversal_'||p_payout_id,null,null);
    update public.walletTransactions set status='REVERSED' where idempotencyKey='payout_hold_'||p_payout_id;
  else
    update public.walletTransactions set status='COMPLETED',description='Payout sent ('||p_transfer_reference||')' where idempotencyKey='payout_hold_'||p_payout_id;
    insert into public.walletTransactions(userId,type,amount,balanceType,status,description,idempotencyKey,payoutRequestId)
      values(p.cleanerId,'DEBIT',p.amount,'EARNINGS','COMPLETED','Payout sent ('||p_transfer_reference||')','payout_paid_'||p_payout_id,p_payout_id) on conflict(idempotencyKey) do nothing;
  end if;
  update public.payoutRequests set status=p_decision,transferReference=case when p_decision='PAID' then p_transfer_reference else null end,settledBy=p_actor_id,settledAt=now() where id=p_payout_id returning * into p;
  insert into public.adminAuditEvents(id,action,actorId,targetId,amount,createdAt) values('payout_'||p_payout_id,'cleaner_payout_'||lower(p_decision),p_actor_id,p_payout_id::text,p.amount,now()) on conflict(id) do nothing;
  return p;
end;
$$;
revoke all on function public.settle_cleaner_payout(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.settle_cleaner_payout(uuid,uuid,text,text) to service_role;

create or replace function public.release_paynow_earnings(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare j public.jobs; p public.payments; gross numeric(12,2); commission numeric(12,2); net numeric(12,2);
begin
  select * into j from public.jobs where id=p_job_id for update;
  select * into p from public.payments where jobId=p_job_id and provider='PAYNOW' for update;
  if not found or p.status <> 'PAID' or j.status <> 'COMPLETED' or (p.data ? 'releasedAt') then return false; end if;
  gross := round(p.amount,2); commission := round(gross*0.1,2); net := round(gross-commission,2);
  perform public.record_wallet_transaction(j.cleanerId,'CREDIT',net,'EARNINGS','Paynow earnings from booking '||p_job_id,'paynow_earning_'||p_job_id,p_job_id,p.id);
  insert into public.platformTransactions(id,jobId,paymentId,type,amount,status,data)
    values('paynow_commission_'||p_job_id,p_job_id,p.id,'COMMISSION',commission,'COMPLETED',jsonb_build_object('rate',0.1,'source','PAYNOW')) on conflict(id) do nothing;
  update public.payments set data=data||jsonb_build_object('releasedAt',now(),'commission',commission,'cleanerNet',net) where id=p.id;
  update public.jobs set earnings=jsonb_build_object('gross',gross,'commission',commission,'net',net,'finalized',true),updatedAt=now() where id=p_job_id;
  return true;
end;
$$;
revoke all on function public.release_paynow_earnings(uuid) from public, anon, authenticated;
grant execute on function public.release_paynow_earnings(uuid) to service_role;

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
  if j.paymentMethod in ('CASH','ECOCASH','INNBUCKS') and reserve.id is not null and reserve.status <> 'REVERSED' then
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

create or replace function public.add_completion_photo(p_job_id uuid,p_cleaner_id uuid,p_path text)
returns integer language plpgsql security definer set search_path = public
as $$
declare j public.jobs; photos text[];
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.cleanerId <> p_cleaner_id or j.status not in ('ASSIGNED','EN_ROUTE','IN_PROGRESS') then raise exception 'Only the assigned cleaner can add completion photos'; end if;
  photos := j.completionPhotos;
  if cardinality(photos) >= 6 then raise exception 'Photo limit reached'; end if;
  if not (p_path like 'detail-media/job-completion/'||p_job_id::text||'/'||p_cleaner_id::text||'/%') then raise exception 'Invalid photo path'; end if;
  if not (p_path = any(photos)) then photos := array_append(photos,p_path); end if;
  update public.jobs set completionPhotos=photos,updatedAt=now() where id=p_job_id;
  return cardinality(photos);
end;
$$;
revoke all on function public.add_completion_photo(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.add_completion_photo(uuid,uuid,text) to service_role;

create or replace function public.settle_job_payment(p_job_id uuid,p_actor_id uuid,p_payment_method text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare j public.jobs; gross numeric(12,2); commission numeric(12,2); net numeric(12,2); p public.payments;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.customerId <> p_actor_id then raise exception 'Only the customer can settle this booking'; end if;
  if j.paidAt is not null or j.paymentMethod='PAYNOW' then raise exception 'Booking is already paid or uses Paynow'; end if;
  if j.status <> 'COMPLETED' or j.cleanerId is null then raise exception 'Cleaner must complete the booking first'; end if;
  if j.paymentMethod is not null and j.paymentMethod <> p_payment_method then raise exception 'Payment method cannot be changed'; end if;
  if p_payment_method not in ('WALLET','CASH','ECOCASH','INNBUCKS') then raise exception 'Invalid payment method'; end if;
  gross := round(coalesce(j.price,0),2);
  if gross <= 0 then raise exception 'Invalid booking price'; end if;
  commission := round(gross*0.1,2); net := gross-commission;
  if p_payment_method='WALLET' then
    perform public.record_wallet_transaction(j.cleanerId,'CREDIT',net,'EARNINGS','Earnings from '||j.serviceType,'wallet_earning_'||p_job_id,p_job_id,null);
  end if;
  update public.users set jobsCompleted=jobsCompleted+1 where id=j.cleanerId;
  insert into public.platformTransactions(id,jobId,type,amount,status,data) values('commission_'||p_job_id,p_job_id,'COMMISSION',commission,'COMPLETED',jsonb_build_object('rate',0.1,'source',p_payment_method)) on conflict(id) do nothing;
  update public.jobs set paidAt=now(),paymentMethod=p_payment_method,paymentStatus='PAID',earnings=jsonb_build_object('gross',gross,'commission',commission,'net',net,'finalized',true),updatedAt=now() where id=p_job_id;
  update public.payments set status='PAID',data=data||jsonb_build_object('settledAt',now(),'commission',commission,'cleanerNet',net) where jobId=p_job_id;
  return true;
end;
$$;
revoke all on function public.settle_job_payment(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.settle_job_payment(uuid,uuid,text) to service_role;

create or replace function public.apply_paynow_status(p_reference text,p_status text,p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare p public.payments; j public.jobs; normalized text; current_status text; status_rank jsonb := '{"INITIATING":0,"PENDING":1,"ESCROWED":2,"DELIVERED":3,"PAID":4}'::jsonb;
begin
  normalized := case lower(regexp_replace(trim(p_status),'[_-]+',' ','g')) when 'awaiting delivery' then 'ESCROWED' when 'delivered' then 'DELIVERED' when 'paid' then 'PAID' when 'disputed' then 'DISPUTED' when 'refunded' then 'REFUNDED' else null end;
  if normalized is null then return jsonb_build_object('status','IGNORED'); end if;
  select * into p from public.payments where reference=p_reference for update;
  if not found then raise exception 'Paynow reference not found'; end if;
  if abs(p.amount-p_amount)>0.009 then raise exception 'Paynow amount does not match'; end if;
  select * into j from public.jobs where id=p.jobId for update;
  current_status := coalesce(p.status,'PENDING');
  if current_status in ('DISPUTED','REFUNDED') or (current_status='PAID' and normalized<>'REFUNDED') then return jsonb_build_object('status',current_status); end if;
  if status_rank ? current_status and status_rank ? normalized and (status_rank->>normalized)::int < (status_rank->>current_status)::int then return jsonb_build_object('status',current_status); end if;
  update public.payments set status=normalized,providerStatus=p_status,updatedAt=now(),data=data||jsonb_build_object('statusUpdatedAt',now()) where id=p.id;
  update public.jobs set paymentStatus=normalized,updatedAt=now(),data=data||case when normalized='DISPUTED' then jsonb_build_object('reviewState','PAYNOW_DISPUTE') else '{}'::jsonb end where id=j.id;
  if normalized='DISPUTED' then
    insert into public.reviewCases(id,jobId,customerId,cleanerId,reporterId,status,reason,data)
      values('paynow_'||j.id,j.id,j.customerId,j.cleanerId,j.customerId,'PAYNOW_DISPUTE','Customer opened a Paynow BuySafe dispute.','{}'::jsonb) on conflict(id) do nothing;
  elsif normalized='REFUNDED' and current_status='PAID' then
    insert into public.reviewCases(id,jobId,customerId,cleanerId,reporterId,status,reason,data)
      values('paynow_refund_'||j.id,j.id,j.customerId,j.cleanerId,j.customerId,'PAYNOW_REFUND_AFTER_RELEASE','Paynow reported a refund after cleaner earnings were released.','{}'::jsonb) on conflict(id) do nothing;
  elsif normalized='PAID' then
    perform public.release_paynow_earnings(j.id);
  end if;
  return jsonb_build_object('status',normalized,'jobId',j.id,'cleanerId',j.cleanerId);
end;
$$;
revoke all on function public.apply_paynow_status(text,text,numeric) from public, anon, authenticated;
grant execute on function public.apply_paynow_status(text,text,numeric) to service_role;
