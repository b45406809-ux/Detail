-- New cleaner bookings use prepaid commission reserves. The current flow
-- keeps customer booking payments between the customer and cleaner; Paynow is
-- used for commission-credit top-ups rather than BuySafe customer checkout.
alter table public.users add column if not exists cleanerVerificationFeePaidAt timestamptz;

-- The one-time Didit fee is charged from the Detail wallet. A separate $1.00
-- commission balance covers up to $10 of accepted offline work.
create or replace function public.charge_cleaner_verification_fee(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cleaner public.users; prior public.walletTransactions; fee_bucket text;
begin
  select * into cleaner from public.users where id=p_user_id for update;
  if not found or cleaner.isSuspended or cleaner.isBanned or cleaner.accountDeletedAt is not null then
    raise exception 'Cleaner account is not eligible for verification';
  end if;
  if cleaner.cleanerVerificationFeePaidAt is not null then
    select * into prior from public.walletTransactions where idempotencyKey='cleaner_kyc_fee_'||p_user_id::text;
    return jsonb_build_object('paid',true,'alreadyPaid',true,'amount',0.50,'commissionBalance',cleaner.commissionBalance);
  end if;
  fee_bucket:=case when cleaner.role='CLEANER' then 'COMMISSION' else 'GENERAL' end;
  if (fee_bucket='COMMISSION' and coalesce(cleaner.commissionBalance,0)<0.50)
     or (fee_bucket='GENERAL' and coalesce(cleaner.balance,0)<0.50) then
    raise exception 'Add at least $0.50 to your Detail wallet to start the one-time identity check';
  end if;
  perform public.record_wallet_transaction(p_user_id,'DEBIT',0.50,fee_bucket,'One-time Didit cleaner identity verification fee','cleaner_kyc_fee_'||p_user_id::text,null,null);
  update public.users set cleanerVerificationFeePaidAt=now(),updatedAt=now() where id=p_user_id returning * into cleaner;
  return jsonb_build_object('paid',true,'alreadyPaid',false,'amount',0.50,'commissionBalance',cleaner.commissionBalance);
end; $$;
revoke all on function public.charge_cleaner_verification_fee(uuid) from public,anon,authenticated;
grant execute on function public.charge_cleaner_verification_fee(uuid) to service_role;

create or replace function public.refund_failed_cleaner_verification_fee(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare cleaner public.users; fee_transaction public.walletTransactions;
begin
  select * into cleaner from public.users where id=p_user_id for update;
  if not found then return false; end if;
  select * into fee_transaction from public.walletTransactions where idempotencyKey='cleaner_kyc_fee_'||p_user_id::text for update;
  if not found or fee_transaction.status='REVERSED' or cleaner.cleanerVerificationFeePaidAt is null then return false; end if;
  perform public.record_wallet_transaction(p_user_id,'CREDIT',fee_transaction.amount,fee_transaction.balanceType,
    'Refund for identity verification session that could not be started','cleaner_kyc_fee_refund_'||p_user_id::text,null,null);
  update public.walletTransactions set status='REVERSED' where id=fee_transaction.id;
  -- Preserve the one-time fee marker after refund: the failed first launch is
  -- treated as a complimentary retry so the same idempotency key cannot charge twice.
  update public.users set updatedAt=now() where id=p_user_id;
  return true;
end; $$;
revoke all on function public.refund_failed_cleaner_verification_fee(uuid) from public,anon,authenticated;
grant execute on function public.refund_failed_cleaner_verification_fee(uuid) to service_role;

-- Require old cleaner accounts to accept the updated prepaid-commission terms.
update public.users set cleanerAgreementAccepted=false
where role='CLEANER' and cleanerAgreementAccepted=true;

create or replace function public.accept_cleaner_agreement(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare profile public.users;
begin
  select * into profile from public.users where id=p_user_id for update;
  if not found or not profile.hasAgreedToTerms or not profile.cleanerOnboardingComplete or profile.verificationStatus<>'VERIFIED'
     or profile.isSuspended or profile.isBanned or profile.accountDeletedAt is not null then
    raise exception 'Complete registration and identity verification first';
  end if;
  insert into public.legalDocumentAcceptances(userId,documentType,documentVersion)
    values(p_user_id,'CLEANER','cleaner-2026-11-17-prepaid-commission-kyc') on conflict(userId,documentType,documentVersion) do nothing;
  update public.users set role='CLEANER',cleanerAgreementAccepted=true,updatedAt=now() where id=p_user_id;
  return true;
end; $$;
revoke all on function public.accept_cleaner_agreement(uuid) from public,anon,authenticated;
grant execute on function public.accept_cleaner_agreement(uuid) to service_role;

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
  -- Keep old app versions compatible while routing every new booking to the
  -- agreed direct customer-to-cleaner payment model.
  p_payment_method:='DIRECT_OFFLINE';
  select * into customer from public.users where id=p_actor_id for update;
  select * into cleaner from public.users where id=b.cleanerId for update;
  if cleaner.id is null or cleaner.role<>'CLEANER' or cleaner.verificationStatus<>'VERIFIED' or not cleaner.cleanerAgreementAccepted
     or cleaner.isSuspended or cleaner.isBanned then raise exception 'Cleaner is not eligible'; end if;
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

-- New direct/offline bookings are prepaid at acceptance. Old policy-v1 jobs
-- preserve their original settlement treatment.
create or replace function public.accrue_direct_booking_commission(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.jobs; cleaner public.users; fee numeric(12,2); existing public.platformTransactions; reserve public.walletTransactions; credit_used numeric(12,2); debt_added numeric(12,2);
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.paymentMethod<>'DIRECT_OFFLINE' or j.directCommissionPolicyVersion not in (1,2)
     or j.status<>'COMPLETED' or j.cleanerId is null then return jsonb_build_object('status','NOT_APPLICABLE'); end if;
  if coalesce(j.data#>>'{customerCompletionResponse,status}','') not in ('CONFIRMED','AUTO_CONFIRMED')
     and not exists(select 1 from public.supportCases c where c.jobId=j.id and c.status='RESOLVED' and c.data->>'settlementDecision'='RELEASE_EARNINGS') then
    return jsonb_build_object('status','AWAITING_CUSTOMER_CONFIRMATION');
  end if;
  select * into existing from public.platformTransactions where id='direct_commission_'||p_job_id::text;
  if found then return jsonb_build_object('status','ALREADY_ACCRUED','amount',existing.amount); end if;
  select * into cleaner from public.users where id=j.cleanerId for update;
  if not found then raise exception 'Cleaner account not found'; end if;
  fee:=round(greatest(0,coalesce(j.price,0))*0.10,2);
  if j.directCommissionPolicyVersion=2 then
    select * into reserve from public.walletTransactions where idempotencyKey='commission_reserve_'||p_job_id::text and type='DEBIT' and balanceType='COMMISSION';
    if reserve.id is null or reserve.amount<fee then raise exception 'Prepaid commission reserve is missing or insufficient'; end if;
    credit_used:=fee; debt_added:=0;
  else
    credit_used:=least(fee,greatest(0,cleaner.commissionBalance)); debt_added:=fee-credit_used;
    if credit_used>0 then perform public.record_wallet_transaction(cleaner.id,'DEBIT',credit_used,'COMMISSION','Detail commission for completed direct booking','direct_commission_credit_'||p_job_id::text,p_job_id,null); end if;
    update public.users set commissionOwed=commissionOwed+debt_added where id=cleaner.id;
  end if;
  insert into public.platformTransactions(id,jobId,type,amount,status,data)
    values('direct_commission_'||p_job_id::text,p_job_id,'COMMISSION',fee,'COMPLETED',jsonb_build_object('rate',0.10,'source','DIRECT_OFFLINE','creditUsed',credit_used,'debtAdded',debt_added,'prepaid',j.directCommissionPolicyVersion=2))
    on conflict(id) do nothing;
  update public.jobs set earnings=jsonb_build_object('gross',j.price,'commission',fee,'net',greatest(0,j.price-fee),'finalized',true,'source','DIRECT_OFFLINE','prepaid',j.directCommissionPolicyVersion=2),updatedAt=now() where id=j.id;
  return jsonb_build_object('status','ACCRUED','amount',fee,'creditUsed',credit_used,'debtAdded',debt_added,'prepaid',j.directCommissionPolicyVersion=2);
end; $$;
revoke all on function public.accrue_direct_booking_commission(uuid) from public,anon,authenticated;
grant execute on function public.accrue_direct_booking_commission(uuid) to service_role;

create or replace function public.expire_unanswered_completions(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public as $$
declare booking public.jobs; affected integer:=0;
begin
  for booking in
    select * from public.jobs
    where status='COMPLETED' and customerResponseAt is null and completionSubmittedAt is not null
      and ((directCommissionPolicyVersion in (1,2) and completionSubmittedAt<=now()-interval '48 hours')
        or (directCommissionPolicyVersion is distinct from 1 and directCommissionPolicyVersion is distinct from 2 and completionSubmittedAt<=now()-interval '24 hours'))
    order by completionSubmittedAt limit greatest(1,least(coalesce(p_limit,100),500)) for update skip locked
  loop
    update public.jobs set customerResponseAt=now(),data=data||jsonb_build_object('customerCompletionResponse',jsonb_build_object('status','AUTO_CONFIRMED','at',now())) where id=booking.id;
    insert into public.jobEvents(jobId,actorRole,type,newState,idempotencyKey,data)
      values(booking.id,'SYSTEM','COMPLETION_AUTO_CONFIRMED','COMPLETED','completion_timeout_'||booking.id::text,jsonb_build_object('at',now()))
      on conflict(jobId,idempotencyKey) do nothing;
    perform public.release_paynow_earnings(booking.id);
    if booking.directCommissionPolicyVersion in (1,2) then perform public.accrue_direct_booking_commission(booking.id); end if;
    affected:=affected+1;
  end loop;
  return affected;
end; $$;
revoke all on function public.expire_unanswered_completions(integer) from public,anon,authenticated;
grant execute on function public.expire_unanswered_completions(integer) to service_role;

create or replace function public.refund_cancelled_direct_commission_reserve()
returns trigger language plpgsql security definer set search_path=public as $$
declare reserve public.walletTransactions;
begin
  if old.status is distinct from 'CANCELLED'::public.booking_status and new.status='CANCELLED'
     and new.paymentMethod='DIRECT_OFFLINE' and new.directCommissionPolicyVersion=2 and new.cleanerId is not null then
    select * into reserve from public.walletTransactions where idempotencyKey='commission_reserve_'||new.id::text and type='DEBIT' and status<>'REVERSED';
    if reserve.id is not null then
      perform public.record_wallet_transaction(new.cleanerId,'CREDIT',reserve.amount,'COMMISSION','Prepaid commission returned after booking cancellation','commission_reserve_refund_'||new.id::text,new.id,null);
      update public.walletTransactions set status='REVERSED' where id=reserve.id;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists jobs_refund_cancelled_direct_commission_reserve on public.jobs;
create trigger jobs_refund_cancelled_direct_commission_reserve after update of status on public.jobs
for each row execute function public.refund_cancelled_direct_commission_reserve();

-- Commission due from legacy direct jobs must be cleared before new bids.
create or replace function public.enforce_cleaner_commission_debt_limit()
returns trigger language plpgsql security definer set search_path=public as $$
declare owed numeric(12,2); flagged boolean;
begin
  select commissionOwed into owed from public.users where id=new.cleanerId;
  if coalesce(owed,0)>0 then raise exception 'Clear your outstanding commission before bidding on more work'; end if;
  select exists(select 1 from public.supportCases c where c.cleanerId=new.cleanerId and c.status in ('OPEN','URGENT','IN_PROGRESS')
    and c.data->>'type' in ('LATE_DIRECT_CANCELLATION','REPEATED_DIRECT_CANCELLATION') and coalesce((c.data->>'repeatCount')::integer,0)>=3) into flagged;
  if flagged then raise exception 'Your account needs a booking cancellation review before you can accept new work.'; end if;
  return new;
end; $$;
drop trigger if exists bids_enforce_cleaner_commission_debt_limit on public.bids;
create trigger bids_enforce_cleaner_commission_debt_limit before insert on public.bids
for each row execute function public.enforce_cleaner_commission_debt_limit();

create or replace function public.enforce_cleaner_debt_before_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare owed numeric(12,2); flagged boolean;
begin
  if old.cleanerId is not null or new.cleanerId is null then return new; end if;
  select commissionOwed into owed from public.users where id=new.cleanerId;
  if coalesce(owed,0)>0 then raise exception 'Clear your outstanding commission before accepting more work'; end if;
  select exists(select 1 from public.supportCases c where c.cleanerId=new.cleanerId and c.status in ('OPEN','URGENT','IN_PROGRESS')
    and c.data->>'type' in ('LATE_DIRECT_CANCELLATION','REPEATED_DIRECT_CANCELLATION') and coalesce((c.data->>'repeatCount')::integer,0)>=3) into flagged;
  if flagged then raise exception 'Your account needs a booking cancellation review before accepting work.'; end if;
  return new;
end; $$;
drop trigger if exists jobs_enforce_cleaner_debt_before_assignment on public.jobs;
create trigger jobs_enforce_cleaner_debt_before_assignment before update of cleanerId on public.jobs
for each row execute function public.enforce_cleaner_debt_before_assignment();
