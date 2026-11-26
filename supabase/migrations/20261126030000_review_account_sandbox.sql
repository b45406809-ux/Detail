-- App Review sandbox. The two App Store / Google Play review accounts form a closed
-- pair: their bookings go only to each other, they never see or alert real users,
-- they work from any country (no distance limit between them), and their prepaid
-- commission credit and fees are excluded from dashboard revenue.

alter table public.users add column if not exists isReviewAccount boolean not null default false;

create or replace function public.guard_review_account_flag()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then
    if tg_op='INSERT' then new.isReviewAccount:=false; else new.isReviewAccount:=old.isReviewAccount; end if;
  end if;
  return new;
end; $$;
drop trigger if exists users_guard_review_account_flag on public.users;
create trigger users_guard_review_account_flag before insert or update of isReviewAccount on public.users
  for each row execute function public.guard_review_account_flag();
revoke all on function public.guard_review_account_flag() from public,anon,authenticated;

create or replace function public.is_review_account(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select isReviewAccount from public.users where id=p_user_id),false);
$$;
revoke all on function public.is_review_account(uuid) from public,anon,authenticated;
grant execute on function public.is_review_account(uuid) to service_role;

create or replace function public.notify_scheduled_job_cleaners(p_job_id uuid,p_customer_id uuid,p_limit integer default 20)
returns integer language plpgsql security definer set search_path=public,extensions
as $$
declare job_record public.jobs; point extensions.geography(Point,4326); starts_at timestamptz;
  duration integer; candidate record; target_cleaner_id uuid; notified integer:=0;
  service_label text; budget_label text; when_label text; distance_label text; review_pair boolean;
begin
  select * into job_record from public.jobs where id=p_job_id and customerId=p_customer_id for update;
  if not found or job_record.status<>'PENDING' or job_record.bookingMode<>'SCHEDULED' then raise exception 'Scheduled booking is unavailable'; end if;
  if coalesce((job_record.data->>'isFavoriteRebook')::boolean,false) then
    begin target_cleaner_id:=nullif(job_record.data->>'preferredCleanerId','')::uuid;
    exception when invalid_text_representation then raise exception 'Invalid preferred cleaner on rebooking'; end;
    if target_cleaner_id is null then raise exception 'Rebooking has no selected cleaner'; end if;
  end if;
  review_pair:=public.is_review_account(p_customer_id);
  if coalesce(job_record.location->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
     or coalesce(job_record.location->>'lng','') !~ '^-?[0-9]+([.][0-9]+)?$' then return 0; end if;
  if (job_record.location->>'lat')::double precision not between -90 and 90
     or (job_record.location->>'lng')::double precision not between -180 and 180
     or ((job_record.location->>'lat')::double precision=0 and (job_record.location->>'lng')::double precision=0) then return 0; end if;
  point:=extensions.st_setsrid(extensions.st_makepoint((job_record.location->>'lng')::float8,(job_record.location->>'lat')::float8),4326)::extensions.geography;
  starts_at:=coalesce(job_record.scheduledDateTime,now()+interval '30 minutes');
  duration:=greatest(30,least(720,coalesce(job_record.estimatedDuration,120)));
  service_label:=coalesce(nullif(trim(job_record.serviceType),''),case when job_record.category='CAR' then 'Car cleaning' else 'Home cleaning' end);
  budget_label:=case when coalesce(job_record.budget,0)>0 then 'Budget $'||trim(to_char(job_record.budget,'FM999990.00')) else 'Open budget' end;
  when_label:=to_char(starts_at at time zone 'Africa/Harare','Dy DD Mon, HH24:MI');
  for candidate in
    select u.id, extensions.st_distance(u.locationPoint,point) as meters from public.users u
    where (target_cleaner_id is null or u.id=target_cleaner_id)
      and u.id<>p_customer_id
      and u.isReviewAccount=review_pair
      and u.role in ('CLEANER','CUSTOMER') and u.verificationStatus='VERIFIED' and u.cleanerAgreementAccepted
      and not u.isSuspended and not u.isBanned and u.accountDeletedAt is null
      -- Review accounts reach each other from any location, online or not; real cleaners must be online nearby.
      and (review_pair or (u.role='CLEANER' and u.status='AVAILABLE'
        and u.locationPoint is not null and u.locationUpdatedAt>now()-interval '60 minutes'
        and extensions.st_dwithin(u.locationPoint,point,least(100000,coalesce(u.serviceRadiusKm,25)*1000))))
      and (cardinality(u.serviceCategories)=0 or job_record.category=any(u.serviceCategories))
      and not exists(select 1 from public.jobs a where a.cleanerId=u.id and a.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS'))
      and not exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=u.id
        and b.startsAt<starts_at+make_interval(mins=>duration+60) and b.endsAt>starts_at)
    order by u.locationPoint<->point nulls last limit case when target_cleaner_id is null then greatest(1,least(coalesce(p_limit,20),50)) else 1 end
  loop
    insert into public.scheduledJobNotices(jobId,cleanerId) values(p_job_id,candidate.id) on conflict(jobId,cleanerId) do nothing;
    if found then
      distance_label:=case when candidate.meters is null then 'nearby' when candidate.meters<1000 then 'under 1 km away' else trim(to_char(candidate.meters/1000.0,'FM990.0'))||' km away' end;
      perform public.create_notification_outbox(candidate.id,
        case when target_cleaner_id is null then service_label||' request '||distance_label else 'A customer wants to book you again' end,
        case when target_cleaner_id is null then budget_label||' · '||when_label||'. Review the job and send a quote if it fits.'
          else service_label||' · '||when_label||'. Review the job details and send your quote in Detail.' end,
        'NEW_SCHEDULED_JOB',p_job_id,jsonb_build_object('bookingMode','SCHEDULED','isFavoriteRebook',target_cleaner_id is not null,'distanceMeters',case when candidate.meters is null then null else round(candidate.meters) end));
      notified:=notified+1;
    end if;
  end loop;
  return notified;
end;
$$;

create or replace function public.admin_marketplace_metrics(p_start timestamptz)
returns jsonb language sql stable security definer set search_path=public
as $$
with review_users as (select id from public.users where isReviewAccount),
jobs_window as (select * from public.jobs where createdAt>=p_start and customerId not in (select id from review_users)),
payments_window as (select * from public.payments where createdAt>=p_start and customerId not in (select id from review_users)),
fees as (
  select createdAt,amount,'verification' as kind from public.walletTransactions
   where type='DEBIT' and balanceType='COMMISSION' and createdAt>=p_start and idempotencyKey like 'cleaner_kyc_fee_%' and userId not in (select id from review_users)
  union all
  select createdAt,amount,'commission' from public.walletTransactions
   where type='DEBIT' and balanceType='COMMISSION' and createdAt>=p_start and idempotencyKey like 'commission_reserve_%' and userId not in (select id from review_users)
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
  'bookingsToday',(select count(*) from public.jobs where customerId not in (select id from review_users) and (createdAt at time zone 'Africa/Harare')::date=(now() at time zone 'Africa/Harare')::date),
  'upcomingBookings',(select count(*) from public.jobs where customerId not in (select id from review_users) and status not in ('COMPLETED','CANCELLED') and scheduledDateTime>now()),
  'completedJobs',(select count(*) from jobs_window where status='COMPLETED'),
  'cancelledJobs',(select count(*) from jobs_window where status='CANCELLED'),
  'revenue',(select coalesce(sum(amount),0) from fees),
  'verificationRevenue',(select coalesce(sum(amount),0) from fees where kind='verification'),
  'commissionRevenue',(select coalesce(sum(amount),0) from fees where kind='commission'),
  'completedJobValue',(select coalesce(sum(price),0) from jobs_window where status='COMPLETED'),
  'activeCleaners',(select count(*) from public.users where role='CLEANER' and status='AVAILABLE' and verificationStatus='VERIFIED' and not isSuspended and not isBanned and not isReviewAccount),
  'pendingPayments',(select count(*) from public.payments p
     where p.status in ('PENDING','INITIATING')
       and p.provider<>'OFFLINE'
       and coalesce(p.data->>'paymentUnavailable','false')<>'true'
       and p.createdAt>now()-interval '24 hours'
       and not exists(select 1 from public.jobs j where j.id=p.jobId and j.status='CANCELLED')),
  'revenueSeries',coalesce((select jsonb_agg(jsonb_build_object('label',to_char(day,'Mon DD'),'amount',amount) order by day) from daily_revenue),'[]'::jsonb),
  'attention',coalesce((select jsonb_agg(jsonb_build_object('id',id,'bookingId',jobId,'rule',reason,'ageMinutes',round(ageMinutes))) from attention),'[]'::jsonb)
);
$$;
revoke all on function public.admin_marketplace_metrics(timestamptz) from public,anon,authenticated;
grant execute on function public.admin_marketplace_metrics(timestamptz) to service_role;
