-- Existing paid verifications remain paid; future charges use the new fee.
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
    return jsonb_build_object('paid',true,'alreadyPaid',true,'amount',coalesce(prior.amount,0.50),'commissionBalance',cleaner.commissionBalance);
  end if;
  fee_bucket:=case when cleaner.role='CLEANER' then 'COMMISSION' else 'GENERAL' end;
  if (fee_bucket='COMMISSION' and coalesce(cleaner.commissionBalance,0)<1.00)
     or (fee_bucket='GENERAL' and coalesce(cleaner.balance,0)<1.00) then
    raise exception 'Add at least $1.00 to your Detail wallet to start the one-time identity check';
  end if;
  perform public.record_wallet_transaction(p_user_id,'DEBIT',1.00,fee_bucket,'One-time Didit cleaner identity verification fee','cleaner_kyc_fee_'||p_user_id::text,null,null);
  update public.users set cleanerVerificationFeePaidAt=now(),updatedAt=now() where id=p_user_id returning * into cleaner;
  return jsonb_build_object('paid',true,'alreadyPaid',false,'amount',1.00,'commissionBalance',cleaner.commissionBalance);
end; $$;
revoke all on function public.charge_cleaner_verification_fee(uuid) from public,anon,authenticated;
grant execute on function public.charge_cleaner_verification_fee(uuid) to service_role;

