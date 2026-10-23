create or replace function public.apply_paynow_status(p_reference text,p_status text,p_amount numeric)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare p public.payments; j public.jobs; normalized text; current_status text; balance_type text; available numeric; reversed numeric; debt numeric;
begin
  normalized:=case lower(regexp_replace(trim(p_status),'[_-]+',' ','g'))
    when 'awaiting delivery' then 'ESCROWED' when 'delivered' then 'DELIVERED' when 'paid' then 'PAID'
    when 'disputed' then 'DISPUTED' when 'refunded' then 'REFUNDED' else null end;
  if normalized is null then return jsonb_build_object('status','IGNORED'); end if;
  select * into p from public.payments where reference=p_reference for update;
  if not found then raise exception 'Paynow reference not found'; end if;
  if abs(p.amount-p_amount)>0.009 then raise exception 'Paynow amount does not match'; end if;
  current_status:=coalesce(p.status,'PENDING');

  if p.jobId is null and p.data->>'type'='wallet_topup' then
    if current_status='REFUNDED' then return jsonb_build_object('status','REFUNDED','paymentId',p.id); end if;
    if normalized='REFUNDED' then
      update public.payments set status='REFUNDED',providerStatus=p_status,updatedAt=now() where id=p.id;
      select case when coalesce(u.role,'CUSTOMER')='CLEANER' then 'COMMISSION' else 'GENERAL' end,
        case when coalesce(u.role,'CUSTOMER')='CLEANER' then u.commissionBalance else u.balance end
        into balance_type,available from public.users u where u.id=p.customerId for update;
      if current_status='PAID' then
        reversed:=least(p.amount,greatest(0,coalesce(available,0))); debt:=p.amount-reversed;
        if reversed>0 then perform public.record_wallet_transaction(p.customerId,'DEBIT',reversed,balance_type,'Reversal of refunded Paynow wallet top-up','topup_refund_'||p.id,null,p.id); end if;
        if debt>0 then
          insert into public.walletReconciliations(paymentId,userId,amount,status,data)
            values(p.id,p.customerId,debt,'OPEN',jsonb_build_object('providerStatus',p_status,'creditedAmount',p.amount,'reversedAmount',reversed)) on conflict(paymentId) do nothing;
          update public.users set walletRestricted=true where id=p.customerId;
        end if;
      end if;
      return jsonb_build_object('status','REFUNDED','paymentId',p.id,'reversedAmount',coalesce(reversed,0),'requiresReconciliation',coalesce(debt,0)>0);
    end if;
    if current_status='PAID' then return jsonb_build_object('status','PAID','paymentId',p.id); end if;
    if current_status='DISPUTED' then return jsonb_build_object('status','DISPUTED','paymentId',p.id); end if;
    if current_status='DELIVERED' and normalized='ESCROWED' then return jsonb_build_object('status','DELIVERED','paymentId',p.id); end if;
    update public.payments set status=normalized,providerStatus=p_status,updatedAt=now() where id=p.id;
    if normalized='PAID' then
      select role into current_status from public.users where id=p.customerId;
      balance_type:=case when current_status='CLEANER' then 'COMMISSION' else 'GENERAL' end;
      perform public.record_wallet_transaction(p.customerId,'CREDIT',p.amount,balance_type,'Paynow wallet top-up '||p.reference,'wallet_topup_'||p.id,null,p.id);
      reversed:=public.offset_wallet_reconciliation(p.customerId,p.amount);
      if reversed>0 then perform public.record_wallet_transaction(p.customerId,'DEBIT',reversed,balance_type,'Offset of refunded Paynow top-up balance','topup_debt_offset_'||p.id,null,p.id); end if;
    end if;
    return jsonb_build_object('status',normalized,'paymentId',p.id);
  end if;

  select * into j from public.jobs where id=p.jobId for update;
  if not found then raise exception 'Paynow booking not found'; end if;
  if current_status='REFUNDED' then return jsonb_build_object('status','REFUNDED','jobId',j.id); end if;
  if current_status='DISPUTED' and normalized not in ('REFUNDED') then return jsonb_build_object('status','DISPUTED','jobId',j.id); end if;
  if current_status='PAID' and normalized not in ('REFUNDED','DISPUTED') then return jsonb_build_object('status','PAID','jobId',j.id); end if;
  if current_status='DELIVERED' and normalized='ESCROWED' then return jsonb_build_object('status','DELIVERED','jobId',j.id); end if;

  update public.payments set status=normalized,providerStatus=p_status,updatedAt=now(),data=data||jsonb_build_object('statusUpdatedAt',now()) where id=p.id;
  update public.jobs set paymentStatus=normalized,updatedAt=now(),data=data||case when normalized='DISPUTED' then jsonb_build_object('reviewState','PAYNOW_DISPUTE') else '{}'::jsonb end where id=j.id;
  if normalized='DISPUTED' then
    insert into public.reviewCases(id,jobId,customerId,cleanerId,reporterId,status,reason,data)
      values('paynow_'||j.id,j.id,j.customerId,j.cleanerId,j.customerId,'PAYNOW_DISPUTE','Customer opened a Paynow BuySafe dispute.','{}'::jsonb) on conflict(id) do nothing;
  elsif normalized='REFUNDED' and current_status in ('PAID','DISPUTED','DELIVERED','ESCROWED','PENDING','INITIATING') then
    insert into public.reviewCases(id,jobId,customerId,cleanerId,reporterId,status,reason,data)
      values('paynow_refund_'||j.id,j.id,j.customerId,j.cleanerId,j.customerId,'PAYNOW_REFUND','Paynow reported a refund requiring reconciliation.','{}'::jsonb) on conflict(id) do nothing;
  elsif normalized='PAID' then
    perform public.release_paynow_earnings(j.id);
  end if;
  return jsonb_build_object('status',normalized,'jobId',j.id,'cleanerId',j.cleanerId);
end;
$$;
revoke all on function public.apply_paynow_status(text,text,numeric) from public,anon,authenticated;
grant execute on function public.apply_paynow_status(text,text,numeric) to service_role;
