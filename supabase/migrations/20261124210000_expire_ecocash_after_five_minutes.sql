-- Expiry is a Detail-side state. Provider status remains available for late settlement.
create or replace function public.wallet_attempt_status(payment public.payments)
returns text language sql stable set search_path=public as $$
  select case
    when payment.provider='PAYNOW' and payment.jobId is null
      and payment.data->>'type'='wallet_topup' and payment.data->>'channel'='ECOCASH'
      and payment.status in ('INITIATING','PENDING') then
      case when payment.data ? 'appCancelledAt' then 'APP_CANCELLED'
           when payment.createdAt <= now()-interval '5 minutes' then 'EXPIRED'
           else payment.status end
    else payment.status
  end;
$$;
revoke all on function public.wallet_attempt_status(public.payments) from public,anon,authenticated;
grant execute on function public.wallet_attempt_status(public.payments) to service_role;
