create or replace function public.apply_paynow_status(p_reference text,p_status text,p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  p public.payments;
  j public.jobs;
  normalized text;
  current_status text;
  recipient_role public.user_role;
  wallet_balance_type text;
  status_rank jsonb := '{"INITIATING":0,"PENDING":1,"ESCROWED":2,"DELIVERED":3,"PAID":4}'::jsonb;
begin
  normalized := case lower(regexp_replace(trim(p_status),'[_-]+',' ','g'))
    when 'awaiting delivery' then 'ESCROWED' when 'delivered' then 'DELIVERED'
    when 'paid' then 'PAID' when 'disputed' then 'DISPUTED' when 'refunded' then 'REFUNDED' else null end;
  if normalized is null then return jsonb_build_object('status','IGNORED'); end if;
  select * into p from public.payments where reference=p_reference for update;
  if not found then raise exception 'Paynow reference not found'; end if;
  if abs(p.amount-p_amount)>0.009 then raise exception 'Paynow amount does not match'; end if;
  current_status := coalesce(p.status,'PENDING');

  -- Wallet loads do not have a booking. Credit them once, from the verified
  -- Paynow callback/poll path, using the ledger's idempotency constraint.
  if p.jobId is null and p.data->>'type'='wallet_topup' then
    if current_status in ('DISPUTED','REFUNDED') or (current_status='PAID' and normalized<>'REFUNDED') then
      return jsonb_build_object('status',current_status,'paymentId',p.id);
    end if;
    if current_status='PAID' and normalized='REFUNDED' then
      update public.payments set status='REFUNDED',providerStatus=p_status,updatedAt=now() where id=p.id;
      return jsonb_build_object('status','REFUNDED','paymentId',p.id,'requiresReconciliation',true);
    end if;
    if status_rank ? current_status and status_rank ? normalized and (status_rank->>normalized)::int < (status_rank->>current_status)::int then
      return jsonb_build_object('status',current_status,'paymentId',p.id);
    end if;
    update public.payments set status=normalized,providerStatus=p_status,updatedAt=now(),data=data||jsonb_build_object('statusUpdatedAt',now()) where id=p.id;
    if normalized='PAID' then
      select role into recipient_role from public.users where id=p.customerId;
      wallet_balance_type := case when recipient_role='CLEANER' then 'COMMISSION' else 'GENERAL' end;
      perform public.record_wallet_transaction(p.customerId,'CREDIT',p.amount,wallet_balance_type,'Paynow wallet top-up '||p.reference,'wallet_topup_'||p.id,null,p.id);
    end if;
    return jsonb_build_object('status',normalized,'paymentId',p.id);
  end if;

  select * into j from public.jobs where id=p.jobId for update;
  if not found then raise exception 'Paynow booking not found'; end if;
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
