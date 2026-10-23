create or replace function public.release_paynow_earnings(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  booking public.jobs;
  payment public.payments;
  gross numeric(12,2);
  commission numeric(12,2);
  net numeric(12,2);
  completion_response text;
begin
  select * into booking from public.jobs where id=p_job_id for update;
  if not found then return false; end if;
  select * into payment from public.payments where jobId=p_job_id and provider='PAYNOW' for update;
  if not found or payment.status<>'PAID' or booking.status<>'COMPLETED'
     or booking.customerResponseAt is null or payment.data ? 'releasedAt' then
    return false;
  end if;
  completion_response:=booking.data #>> '{customerCompletionResponse,status}';
  if completion_response='DISPUTED' and not exists(
    select 1 from public.supportCases c where c.jobId=p_job_id
      and c.data->>'type'='COMPLETION_DISPUTE'
      and c.data->>'settlementDecision'='RELEASE_EARNINGS'
  ) then return false; end if;
  if exists(select 1 from public.supportCases c where c.jobId=p_job_id
      and c.data->>'type'='COMPLETION_DISPUTE'
      and c.data->>'settlementDecision' is distinct from 'RELEASE_EARNINGS') then
    return false;
  end if;
  gross:=round(payment.amount,2);
  commission:=round(gross*0.1,2);
  net:=round(gross-commission,2);
  perform public.record_wallet_transaction(booking.cleanerId,'CREDIT',net,'EARNINGS',
    'Paynow earnings from booking '||p_job_id,'paynow_earning_'||p_job_id,p_job_id,payment.id);
  update public.users set jobsCompleted=jobsCompleted+1 where id=booking.cleanerId;
  insert into public.platformTransactions(id,jobId,paymentId,type,amount,status,data)
    values('paynow_commission_'||p_job_id,p_job_id,payment.id,'COMMISSION',commission,'COMPLETED',jsonb_build_object('rate',0.1,'source','PAYNOW'))
    on conflict(id) do nothing;
  update public.payments set data=data||jsonb_build_object('releasedAt',now(),'commission',commission,'cleanerNet',net) where id=payment.id;
  update public.jobs set earnings=jsonb_build_object('gross',gross,'commission',commission,'net',net,'finalized',true),updatedAt=now() where id=p_job_id;
  return true;
end;
$$;
revoke all on function public.release_paynow_earnings(uuid) from public,anon,authenticated;
grant execute on function public.release_paynow_earnings(uuid) to service_role;

create or replace function public.complete_booking_customer_response(p_job_id uuid,p_actor_id uuid,p_response text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare booking public.jobs; response text:=upper(p_response);
begin
  select * into booking from public.jobs where id=p_job_id and customerId=p_actor_id for update;
  if not found or booking.status<>'COMPLETED' or booking.completionSubmittedAt is null then raise exception 'Completion response is not available'; end if;
  if not exists(select 1 from public.users where id=p_actor_id and role='CUSTOMER') then raise exception 'Only the customer can respond to completion'; end if;
  if booking.customerResponseAt is not null then return jsonb_build_object('status','ALREADY_RESPONDED'); end if;
  if response not in ('CONFIRMED','DISPUTED') then raise exception 'Invalid completion response'; end if;
  update public.jobs set customerResponseAt=now(),data=data||jsonb_build_object('customerCompletionResponse',jsonb_build_object('status',response,'reason',left(p_reason,1000),'at',now())) where id=p_job_id;
  if response='DISPUTED' then
    insert into public.supportCases(id,jobId,customerId,cleanerId,reason,status,data)
      values('completion_'||p_job_id,p_job_id,booking.customerId,booking.cleanerId,left(coalesce(p_reason,'Customer disputed completion'),500),'URGENT',jsonb_build_object('type','COMPLETION_DISPUTE','reporterId',p_actor_id))
      on conflict(id) do nothing;
    return jsonb_build_object('status','DISPUTED');
  end if;
  insert into public.jobEvents(jobId,actorId,actorRole,type,newState,idempotencyKey,data)
    values(p_job_id,p_actor_id,'CUSTOMER','COMPLETION_CONFIRMED','COMPLETED','customer_confirmed_'||p_job_id::text,jsonb_build_object('at',now()))
    on conflict(jobId,idempotencyKey) do nothing;
  perform public.release_paynow_earnings(p_job_id);
  return jsonb_build_object('status','CONFIRMED');
end;
$$;
revoke all on function public.complete_booking_customer_response(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_booking_customer_response(uuid,uuid,text,text) to service_role;

create or replace function public.expire_unanswered_completions(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public
as $$
declare booking public.jobs; affected integer:=0;
begin
  for booking in
    select * from public.jobs
    where status='COMPLETED' and completionSubmittedAt<=now()-interval '24 hours' and customerResponseAt is null
    order by completionSubmittedAt
    limit greatest(1,least(coalesce(p_limit,100),500))
    for update skip locked
  loop
    update public.jobs set customerResponseAt=now(),
      data=data||jsonb_build_object('customerCompletionResponse',jsonb_build_object('status','AUTO_CONFIRMED','at',now()))
      where id=booking.id;
    insert into public.jobEvents(jobId,actorRole,type,newState,idempotencyKey,data)
      values(booking.id,'SYSTEM','COMPLETION_AUTO_CONFIRMED','COMPLETED','completion_timeout_'||booking.id::text,jsonb_build_object('at',now()))
      on conflict(jobId,idempotencyKey) do nothing;
    perform public.release_paynow_earnings(booking.id);
    affected:=affected+1;
  end loop;
  return affected;
end;
$$;
revoke all on function public.expire_unanswered_completions(integer) from public,anon,authenticated;
grant execute on function public.expire_unanswered_completions(integer) to service_role;
