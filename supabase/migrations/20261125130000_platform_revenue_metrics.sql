-- Dashboard revenue previously counted only PAID customer payments. Customers pay
-- cleaners directly, so that was always $0. Platform revenue is now:
--   * cleaner verification fees ($1.00, recognised when charged to the cleaner)
--   * 10% commission (recognised when charged: at job completion)
--   * any PAID non-wallet-top-up customer payments (unchanged)
-- Completed job value (gross booking value of completed jobs) is reported
-- separately and is NOT counted as revenue.
create or replace function public.admin_marketplace_metrics(p_start timestamptz)
returns jsonb language sql stable security definer set search_path=public
as $$
with jobs_window as (select * from public.jobs where createdAt>=p_start),
payments_window as (select * from public.payments where createdAt>=p_start),
fees as (
  select createdAt,amount,'verification' as kind from public.walletTransactions
   where type='DEBIT' and balanceType='COMMISSION' and createdAt>=p_start and idempotencyKey like 'cleaner_kyc_fee_%'
  union all
  select createdAt,amount,'commission' from public.walletTransactions
   where type='DEBIT' and balanceType='COMMISSION' and createdAt>=p_start and idempotencyKey like 'commission_reserve_%'
  union all
  select createdAt,amount,'payment' from payments_window
   where status='PAID' and coalesce(data->>'type','')<>'wallet_topup'
),
daily_revenue as (
  select date_trunc('day',createdAt at time zone 'Africa/Harare')::date as day,round(sum(amount),2) as amount
  from fees group by 1 order by 1
),
attention as (
  select id,jobId,reason,status,extract(epoch from (now()-createdAt))/60 as ageMinutes
  from public.supportCases where status in ('OPEN','URGENT','IN_PROGRESS') order by case when status='URGENT' then 0 else 1 end,createdAt asc limit 10
)
select jsonb_build_object(
  'bookingsToday',(select count(*) from public.jobs where (createdAt at time zone 'Africa/Harare')::date=(now() at time zone 'Africa/Harare')::date),
  'upcomingBookings',(select count(*) from public.jobs where status not in ('COMPLETED','CANCELLED') and scheduledDateTime>now()),
  'completedJobs',(select count(*) from jobs_window where status='COMPLETED'),
  'cancelledJobs',(select count(*) from jobs_window where status='CANCELLED'),
  'revenue',(select coalesce(sum(amount),0) from fees),
  'verificationRevenue',(select coalesce(sum(amount),0) from fees where kind='verification'),
  'commissionRevenue',(select coalesce(sum(amount),0) from fees where kind='commission'),
  'completedJobValue',(select coalesce(sum(price),0) from jobs_window where status='COMPLETED'),
  'activeCleaners',(select count(*) from public.users where role='CLEANER' and status='AVAILABLE' and verificationStatus='VERIFIED' and not isSuspended and not isBanned),
  'pendingPayments',(select count(*) from public.payments where status in ('PENDING','INITIATING')),
  'revenueSeries',coalesce((select jsonb_agg(jsonb_build_object('label',to_char(day,'Mon DD'),'amount',amount) order by day) from daily_revenue),'[]'::jsonb),
  'attention',coalesce((select jsonb_agg(jsonb_build_object('id',id,'bookingId',jobId,'rule',reason,'ageMinutes',round(ageMinutes))) from attention),'[]'::jsonb)
);
$$;
revoke all on function public.admin_marketplace_metrics(timestamptz) from public,anon,authenticated;
grant execute on function public.admin_marketplace_metrics(timestamptz) to service_role;
