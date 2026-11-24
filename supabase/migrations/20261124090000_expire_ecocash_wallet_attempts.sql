-- App cancellation and expiry leave the provider status available for settlement.
create or replace function public.wallet_attempt_status(payment public.payments)
returns text language sql stable set search_path=public as $$
  select case
    when payment.provider='PAYNOW' and payment.jobId is null
      and payment.data->>'type'='wallet_topup' and payment.data->>'channel'='ECOCASH'
      and payment.status in ('INITIATING','PENDING') then
      case when payment.data ? 'appCancelledAt' then 'APP_CANCELLED'
           when payment.createdAt <= now()-interval '30 minutes' then 'EXPIRED'
           else payment.status end
    else payment.status
  end;
$$;
revoke all on function public.wallet_attempt_status(public.payments) from public,anon,authenticated;
grant execute on function public.wallet_attempt_status(public.payments) to service_role;

create or replace function public.cancel_ecocash_wallet_attempt(p_actor uuid,p_reference text)
returns text language plpgsql security definer set search_path=public as $$
declare payment public.payments;
begin
  select * into payment from public.payments where customerId=p_actor and reference=p_reference
    and provider='PAYNOW' and jobId is null and data->>'type'='wallet_topup'
    and data->>'channel'='ECOCASH' for update;
  if not found then return null; end if;
  if public.wallet_attempt_status(payment) in ('INITIATING','PENDING') then
    update public.payments set data=data||jsonb_build_object('appCancelledAt',now())
      where id=payment.id returning * into payment;
  end if;
  return public.wallet_attempt_status(payment);
end;
$$;
revoke all on function public.cancel_ecocash_wallet_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_ecocash_wallet_attempt(uuid,text) to service_role;

-- Prevent a new request from being inserted after the profile closes.
create or replace function public.guard_ecocash_attempt_on_closed_account()
returns trigger language plpgsql security definer set search_path=public as $$
declare closed_at timestamptz;
begin
  select accountDeletedAt into closed_at from public.users where id=new.customerId for update;
  if closed_at is not null then raise exception 'This account is closed'; end if;
  return new;
end;
$$;
create trigger guard_ecocash_attempt_on_closed_account before insert on public.payments
for each row when (new.provider='PAYNOW' and new.jobId is null
  and new.data->>'type'='wallet_topup' and new.data->>'channel'='ECOCASH')
execute function public.guard_ecocash_attempt_on_closed_account();

-- Retain historical marketplace/ledger rows without retaining a login-capable
-- account. Hard-deleting auth.users is unsafe while financial rows reference
-- the profile, so the API uses Supabase's privacy-preserving soft delete.
create or replace function public.close_account(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare active_count integer; profile public.users;
begin
  select * into profile from public.users where id=p_user_id for update;
  if not found then raise exception 'Account profile not found'; end if;
  if profile.balance>0 or profile.earningsBalance>0 or profile.commissionBalance>0 or profile.commissionOwed>0 or profile.walletRestricted then
    raise exception 'Outstanding wallet funds or restrictions must be settled before account deletion';
  end if;
  if exists(select 1 from public.payoutRequests where cleanerId=p_user_id and status in ('PENDING','APPROVED')) then
    raise exception 'Pending or approved payouts must be settled before account deletion';
  end if;
  select count(*) into active_count from public.jobs where (customerId=p_user_id or cleanerId=p_user_id) and
    (status not in ('COMPLETED','CANCELLED') or paymentStatus in ('PENDING','FAILED','INITIATING','AUTHORIZED','CAPTURED','ESCROWED','DELIVERED','DISPUTED'));
  if active_count>0 then raise exception 'Active bookings or payments must be resolved before account deletion'; end if;
  if exists(select 1 from public.payments where (customerId=p_user_id or cleanerId=p_user_id) and public.wallet_attempt_status(payments) in
      ('PENDING','INITIATING','AUTHORIZED','CAPTURED','ESCROWED','DELIVERED','DISPUTED')) then
    raise exception 'Outstanding payment records must be resolved before account deletion';
  end if;

  delete from public.favorites where customerId=p_user_id or cleanerId=p_user_id;
  delete from public.notifications where userId=p_user_id;
  delete from public.privateKyc where userId=p_user_id;
  delete from public.cleanerPortfolio where cleanerId=p_user_id;
  delete from public.organizationMembers where userId=p_user_id;
  delete from public.organizationInvites where createdBy=p_user_id or acceptedBy=p_user_id;
  delete from public.openJobs where customerId=p_user_id;
  update public.organizations set name='Deleted organization',registrationNumber=null,phone=null where ownerId=p_user_id;

  update public.messages set senderName='Deleted user',text='',imageUrl=null where senderId=p_user_id;
  update public.reviews set comment=null where customerId=p_user_id;
  update public.bids set cleanerName='Deleted user',cleanerPhoto=null,message=null,history='[]'::jsonb where cleanerId=p_user_id;
  update public.jobs set
    customerName=case when customerId=p_user_id then 'Deleted user' else customerName end,
    customerPhoto=case when customerId=p_user_id then null else customerPhoto end,
    customerPhone=case when customerId=p_user_id then null else customerPhone end,
    cleanerName=case when cleanerId=p_user_id then 'Deleted user' else cleanerName end,
    cleanerPhoto=case when cleanerId=p_user_id then null else cleanerPhoto end,
    cleanerPhone=case when cleanerId=p_user_id then null else cleanerPhone end,
    location=case when customerId=p_user_id then '{}'::jsonb else location end,
    checklist=case when customerId=p_user_id then null else checklist end,
    description=case when customerId=p_user_id then '' else description end,
    photos=case when customerId=p_user_id then '{}'::text[] else photos end,
    cleanerLocation=case when cleanerId=p_user_id then null else cleanerLocation end,
    cleanerLocationUpdatedAt=case when cleanerId=p_user_id then null else cleanerLocationUpdatedAt end,
    data=case when customerId=p_user_id then data-'location'-'checklist'-'description'-'photos'-'customerName'-'customerPhoto'-'customerPhone'
      when cleanerId=p_user_id then data-'cleanerName'-'cleanerPhoto'-'cleanerPhone' else data end,
    updatedAt=now() where customerId=p_user_id or cleanerId=p_user_id;
  update public.users set email='',displayName='Deleted user',photoURL='',phone=null,address=null,serviceArea=null,location=null,
    locationPoint=null,locationUpdatedAt=null,expoPushToken=null,verificationStatus='NOT_STARTED',verificationLevel=1,
    serviceCategories='{}',serviceRadiusKm=null,experienceYears=null,hasAgreedToTerms=false,cleanerAgreementAccepted=false,
    cleanerOnboardingComplete=false,accountDeletedAt=now(),updatedAt=now(),metadata='{}'::jsonb where id=p_user_id;
  return true;
end;
$$;
revoke all on function public.close_account(uuid) from public,anon,authenticated;
grant execute on function public.close_account(uuid) to service_role;

create or replace function public.apply_paynow_status(p_reference text,p_status text,p_amount numeric)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare p public.payments; j public.jobs; normalized text; current_status text; balance_type text; available numeric; reversed numeric; debt numeric; account_closed_at timestamptz;
begin
  normalized:=case lower(regexp_replace(trim(p_status),'[_-]+',' ','g'))
    when 'awaiting delivery' then 'ESCROWED' when 'delivered' then 'DELIVERED' when 'paid' then 'PAID'
    when 'disputed' then 'DISPUTED' when 'refunded' then 'REFUNDED' else null end;
  if normalized is null and lower(trim(p_status)) not in ('cancelled','canceled','failed') then
    return jsonb_build_object('status','IGNORED');
  end if;
  select * into p from public.payments where reference=p_reference for update;
  if not found then raise exception 'Paynow reference not found'; end if;
  if abs(p.amount-p_amount)>0.009 then raise exception 'Paynow amount does not match'; end if;
  current_status:=coalesce(p.status,'PENDING');

  if p.jobId is null and p.data->>'type'='wallet_topup' and p.data->>'channel'='ECOCASH'
      and lower(trim(p_status)) in ('cancelled','canceled','failed') then
    if current_status in ('INITIATING','PENDING') then
      update public.payments set status='CANCELLED',providerStatus=p_status,updatedAt=now() where id=p.id;
      current_status:='CANCELLED';
    end if;
    return jsonb_build_object('status',current_status,'paymentId',p.id);
  end if;
  if normalized is null then return jsonb_build_object('status','IGNORED'); end if;

  if p.jobId is null and p.data->>'type'='wallet_topup' then
    if current_status='REFUNDED' then return jsonb_build_object('status','REFUNDED','paymentId',p.id); end if;
    if normalized='REFUNDED' then
      update public.payments set status='REFUNDED',providerStatus=p_status,updatedAt=now() where id=p.id;
      select coalesce(p.data->>'balanceType',case when u.role='CLEANER' then 'COMMISSION' else 'GENERAL' end),
        case when coalesce(p.data->>'balanceType',case when u.role='CLEANER' then 'COMMISSION' else 'GENERAL' end)='COMMISSION' then u.commissionBalance else u.balance end
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
    if current_status='PAID' then return jsonb_build_object('status','PAID','paymentId',p.id,
      'lateAccountPayment',p.data ? 'lateAccountPayment'); end if;
    if current_status='DISPUTED' then return jsonb_build_object('status','DISPUTED','paymentId',p.id); end if;
    if current_status='DELIVERED' and normalized='ESCROWED' then return jsonb_build_object('status','DELIVERED','paymentId',p.id); end if;
    update public.payments set status=normalized,providerStatus=p_status,updatedAt=now() where id=p.id;
    if normalized='PAID' then
      -- Serialize wallet credit with account closure. Retain the charge and
      -- route it to support when the customer can no longer access the wallet.
      select role, accountDeletedAt into current_status, account_closed_at
        from public.users where id=p.customerId for update;
      if account_closed_at is not null then
        update public.payments set data=data||jsonb_build_object('lateAccountPayment',true) where id=p.id;
        insert into public.supportCases(id,customerId,reason,status,data)
          values('late_wallet_payment_'||p.id,p.customerId,
            'Paynow confirmed a wallet payment after account closure. Verify and arrange a refund.',
            'URGENT',jsonb_build_object('type','PAYNOW_LATE_WALLET_PAYMENT',
              'paymentId',p.id,'reference',p.reference,'amount',p.amount))
          on conflict(id) do nothing;
        return jsonb_build_object('status','PAID','paymentId',p.id,'lateAccountPayment',true);
      end if;
      balance_type:=coalesce(p.data->>'balanceType',case when current_status='CLEANER' then 'COMMISSION' else 'GENERAL' end);
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
