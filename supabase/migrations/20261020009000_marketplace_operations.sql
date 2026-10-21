create table if not exists public.cleanerPortfolio (
  id uuid primary key default gen_random_uuid(),
  cleanerId uuid not null references public.users(id) on delete cascade,
  imagePath text not null,
  caption text not null default '',
  createdAt timestamptz not null default now(),
  unique(cleanerId,imagePath)
);
create index if not exists cleaner_portfolio_owner_created_idx on public.cleanerPortfolio(cleanerId,createdAt desc);
alter table public.cleanerPortfolio enable row level security;
create policy "Verified cleaner portfolios are readable" on public.cleanerPortfolio for select to authenticated
using (cleanerId=auth.uid() or exists(select 1 from public.users u where u.id=cleanerId and u.role='CLEANER' and u.verificationStatus='VERIFIED' and not u.isSuspended and not u.isBanned));
revoke all on public.cleanerPortfolio from anon,authenticated;
grant select on public.cleanerPortfolio to authenticated;

drop policy if exists "Users upload own media" on storage.objects;
create policy "Users upload own media" on storage.objects for insert to authenticated
with check (bucket_id='detail-media' and (storage.foldername(name))[2]=auth.uid()::text and (storage.foldername(name))[1] in ('job-photos','profile-photos','verification','cleaner-portfolio'));

create or replace function public.admin_cancel_booking(p_job_id uuid,p_actor_id uuid,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare j public.jobs; reserve public.walletTransactions; old_status public.booking_status; refund numeric(12,2):=0; refund_state text:='NOT_REQUIRED';
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key) then return coalesce(j.data->'cancellation','{}'::jsonb); end if;
  if j.status in ('COMPLETED','CANCELLED') then raise exception 'Booking is already closed'; end if;
  old_status:=j.status;
  if j.paymentMethod='WALLET' and coalesce(j.price,0)>0 then
    refund:=round(j.price*case when j.status in ('EN_ROUTE','IN_PROGRESS') then 0.5 else 1 end,2);
    perform public.record_wallet_transaction(j.customerId,'CREDIT',refund,'GENERAL','Admin booking cancellation refund','admin_cancel_'||p_idempotency_key,p_job_id,null);
    refund_state:='REFUNDED';
  elsif j.paymentMethod='PAYNOW' and j.paymentStatus in ('PENDING','ESCROWED','DELIVERED','PAID','DISPUTED') then refund_state:='PAYNOW_MANUAL_REVIEW';
  end if;
  if j.paymentMethod in ('CASH','ECOCASH','INNBUCKS') and j.cleanerId is not null then
    select * into reserve from public.walletTransactions where idempotencyKey='commission_reserve_'||p_job_id for update;
    if found and reserve.status<>'REVERSED' then
      perform public.record_wallet_transaction(j.cleanerId,'CREDIT',reserve.amount,'COMMISSION','Commission reserve returned after admin cancellation','admin_commission_refund_'||p_idempotency_key,p_job_id,null);
      update public.walletTransactions set status='REVERSED' where id=reserve.id;
    end if;
  end if;
  update public.jobs set status='CANCELLED',updatedAt=now(),data=data||jsonb_build_object('cancellation',jsonb_build_object('reason',left(p_reason,500),'actorId',p_actor_id,'refundAmount',refund,'refundStatus',refund_state,'requestedAt',now())) where id=p_job_id returning * into j;
  delete from public.openJobs where jobId=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,reason,data)
  values(p_job_id,p_actor_id,'ADMIN','CANCELLATION',old_status::text,'CANCELLED',p_idempotency_key,left(p_reason,500),jsonb_build_object('refundAmount',refund,'refundStatus',refund_state));
  return jsonb_build_object('status',refund_state,'amount',refund);
end; $$;
revoke all on function public.admin_cancel_booking(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_cancel_booking(uuid,uuid,text,text) to service_role;

create or replace function public.admin_marketplace_metrics(p_start timestamptz)
returns jsonb language sql stable security definer set search_path=public
as $$
with jobs_window as (select * from public.jobs where createdAt>=p_start),
payments_window as (select * from public.payments where createdAt>=p_start),
daily_revenue as (
  select date_trunc('day',createdAt at time zone 'Africa/Harare')::date as day,round(sum(amount),2) as amount
  from payments_window where status='PAID' and coalesce(data->>'type','')<>'wallet_topup'
  group by 1 order by 1
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
  'revenue',(select coalesce(sum(amount),0) from payments_window where status='PAID' and coalesce(data->>'type','')<>'wallet_topup'),
  'activeCleaners',(select count(*) from public.users where role='CLEANER' and status='AVAILABLE' and verificationStatus='VERIFIED' and not isSuspended and not isBanned),
  'pendingPayments',(select count(*) from public.payments where status in ('PENDING','INITIATING')),
  'revenueSeries',coalesce((select jsonb_agg(jsonb_build_object('label',to_char(day,'Mon DD'),'amount',amount) order by day) from daily_revenue),'[]'::jsonb),
  'attention',coalesce((select jsonb_agg(jsonb_build_object('id',id,'bookingId',jobId,'rule',reason,'ageMinutes',round(ageMinutes))) from attention),'[]'::jsonb)
);
$$;
revoke all on function public.admin_marketplace_metrics(timestamptz) from public,anon,authenticated;
grant execute on function public.admin_marketplace_metrics(timestamptz) to service_role;
