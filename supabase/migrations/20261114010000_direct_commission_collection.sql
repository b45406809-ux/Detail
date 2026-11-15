-- Direct/offline bookings are paid by the customer to the cleaner outside Detail.
-- Detail still earns the configured platform commission when the service is confirmed.
alter table public.jobs add column if not exists directCommissionPolicyVersion smallint;
create index if not exists jobs_direct_commission_pending_idx
  on public.jobs(cleanerId, status) where paymentMethod='DIRECT_OFFLINE';

insert into public.configuration(key,value,updatedAt)
values('operations','{"commissionDebtLimit":10}'::jsonb,now())
on conflict(key) do update set value=configuration.value || jsonb_build_object(
  'commissionDebtLimit',coalesce(configuration.value->'commissionDebtLimit','10'::jsonb)), updatedAt=now();

-- New terms must be accepted before cleaners can accept jobs under this policy.
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
    values(p_user_id,'CLEANER','cleaner-2026-11-14-direct-commission') on conflict(userId,documentType,documentVersion) do nothing;
  update public.users set role='CLEANER',cleanerAgreementAccepted=true,updatedAt=now() where id=p_user_id;
  return true;
end; $$;
revoke all on function public.accept_cleaner_agreement(uuid) from public,anon,authenticated;
grant execute on function public.accept_cleaner_agreement(uuid) to service_role;

create or replace function public.tag_direct_commission_policy()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and old.directCommissionPolicyVersion=1 then
    new.directCommissionPolicyVersion:=1;
    new.data:=coalesce(new.data,'{}'::jsonb)||jsonb_build_object('directCommissionPolicyVersion',1,'directCommissionRate',0.10);
  end if;
  if new.paymentMethod='DIRECT_OFFLINE' and new.cleanerId is not null
     and (old.cleanerId is null or old.paymentMethod is distinct from new.paymentMethod)
     and new.directCommissionPolicyVersion is null then
    new.directCommissionPolicyVersion:=1;
    new.data:=coalesce(new.data,'{}'::jsonb)||jsonb_build_object('directCommissionPolicyVersion',1,'directCommissionRate',0.10);
  end if;
  return new;
end; $$;
drop trigger if exists jobs_tag_direct_commission_policy on public.jobs;
create trigger jobs_tag_direct_commission_policy before update of cleanerId,paymentMethod,directCommissionPolicyVersion on public.jobs
for each row execute function public.tag_direct_commission_policy();

create or replace function public.accrue_direct_booking_commission(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.jobs; cleaner public.users; fee numeric(12,2); credit_used numeric(12,2); debt_added numeric(12,2); existing public.platformTransactions;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.paymentMethod<>'DIRECT_OFFLINE' or j.directCommissionPolicyVersion is distinct from 1
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
  credit_used:=least(fee,greatest(0,cleaner.commissionBalance));
  debt_added:=fee-credit_used;
  if credit_used>0 then
    perform public.record_wallet_transaction(cleaner.id,'DEBIT',credit_used,'COMMISSION','Detail commission for completed direct booking','direct_commission_credit_'||p_job_id::text,p_job_id,null);
  end if;
  update public.users set commissionOwed=commissionOwed+debt_added where id=cleaner.id;
  insert into public.platformTransactions(id,jobId,type,amount,status,data)
  values('direct_commission_'||p_job_id::text,p_job_id,'COMMISSION',fee,'COMPLETED',jsonb_build_object('rate',0.10,'source','DIRECT_OFFLINE','creditUsed',credit_used,'debtAdded',debt_added))
  on conflict(id) do nothing;
  update public.jobs set earnings=jsonb_build_object('gross',j.price,'commission',fee,'net',greatest(0,j.price-fee),'finalized',true,'source','DIRECT_OFFLINE'),updatedAt=now() where id=j.id;
  return jsonb_build_object('status','ACCRUED','amount',fee,'creditUsed',credit_used,'debtAdded',debt_added);
end; $$;
revoke all on function public.accrue_direct_booking_commission(uuid) from public,anon,authenticated;
grant execute on function public.accrue_direct_booking_commission(uuid) to service_role;

create or replace function public.accrue_direct_commission_after_customer_response()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='COMPLETED' and new.customerResponseAt is not null
     and old.customerResponseAt is distinct from new.customerResponseAt then
    perform public.accrue_direct_booking_commission(new.id);
  end if;
  return new;
end; $$;
drop trigger if exists jobs_accrue_direct_commission_after_response on public.jobs;
create trigger jobs_accrue_direct_commission_after_response after update of customerResponseAt on public.jobs
for each row execute function public.accrue_direct_commission_after_customer_response();

-- Commission top-ups automatically pay down any accrued commission before leaving credit.
create or replace function public.apply_direct_commission_topup_to_debt()
returns trigger language plpgsql security definer set search_path=public as $$
declare owed numeric(12,2); offset_amount numeric(12,2);
begin
  if new.type<>'CREDIT' or new.balanceType<>'COMMISSION' or new.description not like 'Paynow wallet top-up %' then return new; end if;
  select commissionOwed into owed from public.users where id=new.userId for update;
  offset_amount:=least(new.amount,greatest(0,coalesce(owed,0)));
  if offset_amount>0 then
    perform public.record_wallet_transaction(new.userId,'DEBIT',offset_amount,'COMMISSION','Paynow top-up applied to commission due','commission_topup_debt_'||new.id,null,new.paymentId);
    update public.users set commissionOwed=greatest(0,commissionOwed-offset_amount) where id=new.userId;
  end if;
  return new;
end; $$;
drop trigger if exists wallet_apply_commission_topup_to_debt on public.walletTransactions;
create trigger wallet_apply_commission_topup_to_debt after insert on public.walletTransactions
for each row execute function public.apply_direct_commission_topup_to_debt();

-- Stop additional bids once commission due reaches the configured threshold.
create or replace function public.enforce_cleaner_commission_debt_limit()
returns trigger language plpgsql security definer set search_path=public as $$
declare owed numeric(12,2); max_debt numeric(12,2); flagged boolean;
begin
  select commissionOwed into owed from public.users where id=new.cleanerId;
  select coalesce((value->>'commissionDebtLimit')::numeric,10) into max_debt from public.configuration where key='operations';
  if coalesce(owed,0)>=coalesce(max_debt,10) then raise exception 'Commission due has reached the current acceptance limit. Clear some balance before bidding.'; end if;
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
declare owed numeric(12,2); max_debt numeric(12,2); flagged boolean;
begin
  if old.cleanerId is not null or new.cleanerId is null then return new; end if;
  select commissionOwed into owed from public.users where id=new.cleanerId;
  select coalesce((value->>'commissionDebtLimit')::numeric,10) into max_debt from public.configuration where key='operations';
  if coalesce(owed,0)>=coalesce(max_debt,10) then raise exception 'Commission due has reached the current acceptance limit. Clear some balance before accepting work.'; end if;
  select exists(select 1 from public.supportCases c where c.cleanerId=new.cleanerId and c.status in ('OPEN','URGENT','IN_PROGRESS')
    and c.data->>'type' in ('LATE_DIRECT_CANCELLATION','REPEATED_DIRECT_CANCELLATION') and coalesce((c.data->>'repeatCount')::integer,0)>=3) into flagged;
  if flagged then raise exception 'Your account needs a booking cancellation review before accepting work.'; end if;
  return new;
end; $$;
drop trigger if exists jobs_enforce_cleaner_debt_before_assignment on public.jobs;
create trigger jobs_enforce_cleaner_debt_before_assignment before update of cleanerId on public.jobs
for each row execute function public.enforce_cleaner_debt_before_assignment();

-- Customer report is an acknowledgement only; it does not claim Detail received money.
create or replace function public.report_direct_booking_payment(p_job_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id=p_job_id and customerId=p_actor_id for update;
  if not found or j.paymentMethod<>'DIRECT_OFFLINE' or j.status<>'COMPLETED' then raise exception 'Direct payment report is not available'; end if;
  update public.jobs set paymentStatus='DIRECT_CONFIRMED',data=data||jsonb_build_object('directPaymentReportedAt',now(),'directPaymentReportedBy',p_actor_id),updatedAt=now() where id=j.id;
  return jsonb_build_object('status','DIRECT_CONFIRMED','detailReceivedFunds',false);
end; $$;
revoke all on function public.report_direct_booking_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.report_direct_booking_payment(uuid,uuid) to service_role;

create or replace function public.expire_unanswered_completions(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public as $$
declare booking public.jobs; affected integer:=0;
begin
  for booking in
    select * from public.jobs
    where status='COMPLETED' and customerResponseAt is null and completionSubmittedAt is not null
      and ((directCommissionPolicyVersion=1 and completionSubmittedAt<=now()-interval '48 hours')
        or (directCommissionPolicyVersion is distinct from 1 and completionSubmittedAt<=now()-interval '24 hours'))
    order by completionSubmittedAt limit greatest(1,least(coalesce(p_limit,100),500)) for update skip locked
  loop
    update public.jobs set customerResponseAt=now(),data=data||jsonb_build_object('customerCompletionResponse',jsonb_build_object('status','AUTO_CONFIRMED','at',now())) where id=booking.id;
    insert into public.jobEvents(jobId,actorRole,type,newState,idempotencyKey,data)
      values(booking.id,'SYSTEM','COMPLETION_AUTO_CONFIRMED','COMPLETED','completion_timeout_'||booking.id::text,jsonb_build_object('at',now()))
      on conflict(jobId,idempotencyKey) do nothing;
    perform public.release_paynow_earnings(booking.id);
    if booking.directCommissionPolicyVersion=1 then perform public.accrue_direct_booking_commission(booking.id); end if;
    affected:=affected+1;
  end loop;
  return affected;
end; $$;
revoke all on function public.expire_unanswered_completions(integer) from public,anon,authenticated;
grant execute on function public.expire_unanswered_completions(integer) to service_role;

-- A post-arrival/work-start offline cancellation is a review request, not a way
-- to erase the booking. Repeated cases are escalated for human review.
create or replace function public.cancel_booking(p_job_id uuid,p_actor_id uuid,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.jobs; prior_event public.jobEvents; old_status public.booking_status; refund_amount numeric(12,2):=0; reserve public.walletTransactions; recent_flags integer:=0; case_id text;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if p_actor_id<>j.customerId and p_actor_id is distinct from j.cleanerId then raise exception 'Not a booking participant'; end if;
  select * into prior_event from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key;
  if found then
    if prior_event.type='CANCELLATION_REVIEW' then return jsonb_build_object('status','REVIEW_REQUIRED','caseId',prior_event.data->>'caseId','repeatCount',prior_event.data->>'repeatCount'); end if;
    return coalesce(j.data->'cancellation','{}'::jsonb);
  end if;
  if j.status not in ('PENDING','CONFIRMED','ASSIGNED','EN_ROUTE','IN_PROGRESS') then raise exception 'Booking cannot be cancelled in its current state'; end if;
  if j.paymentMethod='DIRECT_OFFLINE' and (j.arrivalAt is not null or j.status='IN_PROGRESS') then
    case_id:='late_cancel_'||p_job_id::text;
    select count(*) into recent_flags from public.supportCases c where c.cleanerId=j.cleanerId and c.createdAt>now()-interval '30 days'
      and c.data->>'type'='LATE_DIRECT_CANCELLATION';
    insert into public.supportCases as existing_case(id,jobId,customerId,cleanerId,reason,status,data)
      values(case_id,p_job_id,j.customerId,j.cleanerId,left(coalesce(p_reason,'Cancellation requested after cleaner arrival'),500),
        case when recent_flags>=2 then 'URGENT' else 'OPEN' end,
        jsonb_build_object('type','LATE_DIRECT_CANCELLATION','reporterId',p_actor_id,'repeatCount',recent_flags+1,'reviewReason','Cancellation after arrival or service start'))
      on conflict(id) do update set reason=excluded.reason,status=case when excluded.status='URGENT' then 'URGENT' when existing_case.status='RESOLVED' then 'OPEN' else existing_case.status end,
        data=existing_case.data||excluded.data;
    insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,reason,data)
      values(p_job_id,p_actor_id,case when p_actor_id=j.customerId then 'CUSTOMER' else 'CLEANER' end,'CANCELLATION_REVIEW',j.status::text,j.status::text,p_idempotency_key,left(p_reason,500),jsonb_build_object('caseId',case_id,'repeatCount',recent_flags+1))
      on conflict(jobId,idempotencyKey) do nothing;
    return jsonb_build_object('status','REVIEW_REQUIRED','caseId',case_id,'repeatCount',recent_flags+1);
  end if;
  if j.paymentMethod='DIRECT_OFFLINE' and j.cleanerId is not null then
    select count(*) into recent_flags from public.jobEvents e join public.jobs prior on prior.id=e.jobId
      where prior.cleanerId=j.cleanerId and prior.paymentMethod='DIRECT_OFFLINE' and e.type='CANCELLATION'
        and e.createdAt>now()-interval '30 days';
    if recent_flags>=2 then
      insert into public.supportCases as existing_case(id,jobId,customerId,cleanerId,reason,status,data)
        values('repeated_cancel_'||j.cleanerId::text||'_'||to_char(now() at time zone 'UTC','YYYYMMDD'),p_job_id,j.customerId,j.cleanerId,
          'Repeated cancellations on direct-payment bookings need review','URGENT',jsonb_build_object('type','REPEATED_DIRECT_CANCELLATION','reporterId',p_actor_id,'repeatCount',recent_flags+1,'reviewReason','Three or more direct bookings cancelled in a rolling 30-day period'))
        on conflict(id) do update set data=existing_case.data||jsonb_build_object('repeatCount',recent_flags+1);
    end if;
  end if;
  old_status:=j.status;
  if j.paymentMethod='PAYNOW' and j.paymentStatus in ('INITIATING','PENDING','ESCROWED','DELIVERED','PAID','DISPUTED') then raise exception 'Paynow BuySafe payment requires support review'; end if;
  if j.paymentMethod='WALLET' then
    refund_amount:=round(coalesce(j.price,0)*case when j.status in ('EN_ROUTE','IN_PROGRESS') then 0.5 else 1 end,2);
    if refund_amount>0 then perform public.record_wallet_transaction(j.customerId,'CREDIT',refund_amount,'GENERAL','Booking cancellation refund','refund_'||p_idempotency_key,p_job_id,null); end if;
  end if;
  select * into reserve from public.walletTransactions where idempotencyKey='commission_reserve_'||p_job_id;
  if j.paymentMethod in ('CASH','ECOCASH','INNBUCKS') and reserve.id is not null and reserve.status<>'REVERSED' then
    perform public.record_wallet_transaction(j.cleanerId,'CREDIT',reserve.amount,'COMMISSION','Commission reserve returned after cancellation','commission_reserve_refund_'||p_job_id,p_job_id,null);
    update public.walletTransactions set status='REVERSED' where id=reserve.id;
  end if;
  if j.paymentMethod='DIRECT_OFFLINE' then update public.payments set status='CANCELLED',updatedAt=now(),data=data||jsonb_build_object('cancelledAt',now(),'cancelledBy',p_actor_id) where jobId=p_job_id and provider='OFFLINE' and status='PENDING'; end if;
  update public.jobs set status='CANCELLED',paymentStatus=case when j.paymentMethod='DIRECT_OFFLINE' then 'CANCELLED' else paymentStatus end,updatedAt=now(),data=data||jsonb_build_object('cancellation',jsonb_build_object('reason',left(p_reason,500),'actorId',p_actor_id,'refundAmount',refund_amount,'refundStatus',case when refund_amount>0 then 'REFUNDED' else 'NOT_REQUIRED' end),'cancelledAt',now()) where id=p_job_id returning * into j;
  delete from public.openJobs where jobId=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,data)
    values(p_job_id,p_actor_id,case when p_actor_id=j.customerId then 'CUSTOMER' else 'CLEANER' end,'CANCELLATION',old_status::text,'CANCELLED',p_idempotency_key,jsonb_build_object('refundAmount',refund_amount,'reason',p_reason));
  return jsonb_build_object('status',case when refund_amount>0 then 'REFUNDED' else 'NOT_REQUIRED' end,'amount',refund_amount);
end; $$;
revoke all on function public.cancel_booking(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.cancel_booking(uuid,uuid,text,text) to service_role;
