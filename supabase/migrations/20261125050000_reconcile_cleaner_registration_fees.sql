-- Earlier builds could finish cleaner registration without posting the fee.
-- Use the cleared commission deposit before the first cleaner agreement as
-- evidence of registration. A later $2 commission top-up is not a fee payment.
do $$
declare
  cleaner record;
begin
  for cleaner in
    select u.id, registration.payment_id
    from public.users u
    join lateral (
      select min(a.acceptedAt) as accepted_at
      from public.legalDocumentAcceptances a
      where a.userId = u.id and a.documentType = 'CLEANER'
    ) agreement on agreement.accepted_at is not null
    join lateral (
      select p.id as payment_id
      from public.walletTransactions w
      join public.payments p on p.id = w.paymentId and p.customerId = u.id
      where w.userId = u.id and w.type = 'CREDIT' and w.balanceType = 'COMMISSION'
        and w.status = 'COMPLETED' and w.amount = 2.00
        and w.createdAt <= agreement.accepted_at
        and p.jobId is null and p.provider = 'PAYNOW' and p.status = 'PAID'
        and p.amount = 2.00 and p.currency = 'USD'
        and p.data->>'type' = 'wallet_topup' and p.data->>'channel' = 'ECOCASH'
        and coalesce(p.data->>'purpose', 'VERIFICATION') = 'VERIFICATION'
      order by w.createdAt, w.id
      limit 1
    ) registration on true
    where u.role = 'CLEANER' and u.verificationStatus = 'VERIFIED'
      and u.cleanerOnboardingComplete and u.accountDeletedAt is null
      and not u.isSuspended and not u.isBanned and not u.walletRestricted
      and u.cleanerVerificationFeePaidAt is null
      and u.commissionBalance >= 1.00 and u.balance >= 1.00
    order by u.id
    for update of u
  loop
    if exists (
      select 1 from public.walletTransactions
      where idempotencyKey = 'cleaner_kyc_fee_' || cleaner.id::text
    ) then
      continue;
    end if;

    perform public.record_wallet_transaction(
      cleaner.id, 'DEBIT', 1.00, 'COMMISSION',
      'One-time cleaner registration fee', 'cleaner_kyc_fee_' || cleaner.id::text,
      null, cleaner.payment_id
    );
    update public.users
    set cleanerVerificationFeePaidAt = now()
    where id = cleaner.id;
  end loop;
end;
$$;
