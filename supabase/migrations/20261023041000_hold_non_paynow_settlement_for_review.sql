-- Wallet/cash settlement follows the same completion-review hold as Paynow
-- earnings release. A disputed completion is payable only after an operator
-- explicitly resolves the case in favor of releasing earnings.
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
  if p_payment_method not in ('WALLET','CASH','ECOCASH','INNBUCKS') then raise exception 'Invalid payment method'; end if;

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
