-- Consent controlled campaign channels and queued provider delivery.
alter table public.users
  add column if not exists lastActiveAt timestamptz not null default now();

create table if not exists public.userMarketingPreferences (
  userId uuid primary key references public.users(id) on delete cascade,
  emailEnabled boolean not null default false,
  pushEnabled boolean not null default false,
  inAppEnabled boolean not null default false,
  smsEnabled boolean not null default false,
  whatsappEnabled boolean not null default false,
  inactivityRemindersEnabled boolean not null default false,
  consentUpdatedAt timestamptz not null default now(),
  lastInactivityReminderAt timestamptz,
  createdAt timestamptz not null default now()
);
alter table public.userMarketingPreferences enable row level security;
revoke all on public.userMarketingPreferences from anon, authenticated;
grant select, insert, update, delete on public.userMarketingPreferences to service_role;
create index if not exists user_marketing_inactivity_due_idx on public.userMarketingPreferences(lastInactivityReminderAt,userId) where inactivityRemindersEnabled=true;
create index if not exists users_marketing_last_active_idx on public.users(lastActiveAt,id) where isBanned=false and isSuspended=false and accountDeletedAt is null;

create table if not exists public.marketingCampaignDeliveries (
  id uuid primary key default gen_random_uuid(),
  campaignId text not null references public.marketingCampaigns(id) on delete cascade,
  userId uuid references public.users(id) on delete cascade,
  channel text not null check (channel in ('EMAIL','PUSH','IN_APP','SMS','WHATSAPP')),
  destination text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','SENT','FAILED','SKIPPED','UNCERTAIN')),
  attempts integer not null default 0,
  nextAttemptAt timestamptz not null default now(),
  providerReceiptId text,
  unsubscribeToken text not null default gen_random_uuid()::text unique,
  lastError text,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  unique(campaignId,channel,destination)
);
create index if not exists marketing_campaign_delivery_due_idx
  on public.marketingCampaignDeliveries(status,nextAttemptAt,createdAt);
create unique index if not exists notifications_campaign_user_uidx
  on public.notifications(userId,(data->>'campaignId')) where data ? 'campaignId';
alter table public.marketingCampaignDeliveries enable row level security;
revoke all on public.marketingCampaignDeliveries from anon, authenticated;
grant select, insert, update, delete on public.marketingCampaignDeliveries to service_role;

create or replace function public.preview_registered_campaign(p_audience text default 'ALL_USERS')
returns jsonb language plpgsql security definer set search_path=public
as $$
declare audience_name text:=upper(coalesce(p_audience,'ALL_USERS')); result jsonb;
begin
  if audience_name not in ('ALL_USERS','CUSTOMERS','CLEANERS','INACTIVE_7') then
    raise exception 'Unsupported campaign audience';
  end if;
  select jsonb_build_object(
    'EMAIL',count(*) filter (where p.emailEnabled and nullif(trim(u.email),'') is not null),
    'PUSH',(select count(*) from public.userMarketingPreferences mp
      join public.users pu on pu.id=mp.userId join public.userPushDevices d on d.userId=pu.id
      where mp.pushEnabled and not pu.isBanned and not pu.isSuspended and pu.accountDeletedAt is null
        and (audience_name not in ('CUSTOMERS','CLEANERS') or pu.role::text=case audience_name when 'CUSTOMERS' then 'CUSTOMER' else 'CLEANER' end)
        and (audience_name<>'INACTIVE_7' or pu.lastActiveAt<now()-interval '7 days')),
    'IN_APP',count(*) filter (where p.inAppEnabled),
    'SMS',count(*) filter (where p.smsEnabled and u.phone ~ '^\+[1-9][0-9]{7,14}$'),
    'WHATSAPP',count(*) filter (where p.whatsappEnabled and u.phone ~ '^\+[1-9][0-9]{7,14}$')
  ) into result
  from public.users u join public.userMarketingPreferences p on p.userId=u.id
  where not u.isBanned and not u.isSuspended and u.accountDeletedAt is null
    and (audience_name not in ('CUSTOMERS','CLEANERS') or u.role::text=case audience_name when 'CUSTOMERS' then 'CUSTOMER' else 'CLEANER' end)
    and (audience_name<>'INACTIVE_7' or u.lastActiveAt<now()-interval '7 days');
  return coalesce(result,'{}'::jsonb);
end; $$;
revoke all on function public.preview_registered_campaign(text) from public, anon, authenticated;
grant execute on function public.preview_registered_campaign(text) to service_role;

create or replace function public.enqueue_registered_marketing_campaign(
  p_campaign_id text,p_channels text[],p_audience text default 'ALL_USERS'
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare audience_name text:=upper(coalesce(p_audience,'ALL_USERS')); counts jsonb;
begin
  if audience_name not in ('ALL_USERS','CUSTOMERS','CLEANERS','INACTIVE_7') then raise exception 'Unsupported campaign audience'; end if;
  insert into public.marketingCampaignDeliveries(campaignId,userId,channel,destination,payload)
  select p_campaign_id,u.id,ch.channel,ch.destination,ch.payload
  from public.users u
  join public.userMarketingPreferences p on p.userId=u.id
  join public.marketingCampaigns c on c.id=p_campaign_id
  cross join lateral (
    select 'EMAIL'::text channel,u.email destination,jsonb_build_object('subject',c.subject,'message',c.message) payload where 'EMAIL'=any(p_channels) and p.emailEnabled and nullif(trim(u.email),'') is not null
    union all
    select 'PUSH',d.expoPushToken,jsonb_build_object('title',c.subject,'body',c.message,'data',jsonb_build_object('type','ANNOUNCEMENT','campaignId',p_campaign_id,'title',c.subject,'body',c.message)) from public.userPushDevices d where 'PUSH'=any(p_channels) and p.pushEnabled and d.userId=u.id
    union all
    select 'IN_APP',u.id::text,jsonb_build_object('title',c.subject,'body',c.message,'campaignId',p_campaign_id) where 'IN_APP'=any(p_channels) and p.inAppEnabled
    union all
    select 'SMS',u.phone,jsonb_build_object('message',c.subject||E'\n'||c.message) where 'SMS'=any(p_channels) and p.smsEnabled and u.phone ~ '^\+[1-9][0-9]{7,14}$'
    union all
    select 'WHATSAPP',u.phone,jsonb_build_object('message',c.subject||E'\n'||c.message) where 'WHATSAPP'=any(p_channels) and p.whatsappEnabled and u.phone ~ '^\+[1-9][0-9]{7,14}$'
  ) ch
  where not u.isBanned and not u.isSuspended and u.accountDeletedAt is null
    and (audience_name not in ('CUSTOMERS','CLEANERS') or u.role::text=case audience_name when 'CUSTOMERS' then 'CUSTOMER' else 'CLEANER' end)
    and (audience_name<>'INACTIVE_7' or u.lastActiveAt<now()-interval '7 days')
  on conflict(campaignId,channel,destination) do nothing;
  select jsonb_object_agg(channel,recipient_count) into counts from (
    select channel,count(*) recipient_count from public.marketingCampaignDeliveries where campaignId=p_campaign_id group by channel
  ) by_channel;
  return coalesce(counts,'{}'::jsonb);
end; $$;
revoke all on function public.enqueue_registered_marketing_campaign(text,text[],text) from public, anon, authenticated;
grant execute on function public.enqueue_registered_marketing_campaign(text,text[],text) to service_role;

create or replace function public.claim_marketing_campaign_deliveries(p_limit integer default 50)
returns setof public.marketingCampaignDeliveries
language plpgsql security definer set search_path=public
as $$ begin
  return query
  with due as (
    select d.id from public.marketingCampaignDeliveries d
    where d.status='PENDING' and d.nextAttemptAt<=now()
      and not coalesce((select (c.value->>(case d.channel when 'IN_APP' then 'inAppPaused' else lower(d.channel)||'Paused' end))::boolean from public.configuration c where c.key='campaignControls'),false)
    order by d.nextAttemptAt,d.createdAt
    for update skip locked
    limit greatest(1,least(p_limit,100))
  )
  update public.marketingCampaignDeliveries d
    set status='PROCESSING',attempts=d.attempts+1,updatedAt=now()
    from due where d.id=due.id returning d.*;
end; $$;
revoke all on function public.claim_marketing_campaign_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_marketing_campaign_deliveries(integer) to service_role;

create or replace function public.finish_marketing_campaign_delivery(
  p_id uuid,p_success boolean,p_error text default null,p_receipt_id text default null,p_skipped boolean default false
) returns void language plpgsql security definer set search_path=public
as $$
declare current_delivery public.marketingCampaignDeliveries;
begin
  select * into current_delivery from public.marketingCampaignDeliveries where id=p_id for update;
  if not found then return; end if;
  update public.marketingCampaignDeliveries
    set status=case when p_skipped then 'SKIPPED' when p_success then 'SENT' else 'FAILED' end,
        nextAttemptAt=now()+make_interval(secs=>least(3600,power(2,least(attempts,10))::integer*30)),
        lastError=case when p_success or p_skipped then null else left(coalesce(p_error,'Provider delivery failed'),500) end,
        providerReceiptId=case when p_success then left(p_receipt_id,200) else providerReceiptId end,
        updatedAt=now()
    where id=p_id;
  if not exists(select 1 from public.marketingCampaignDeliveries where campaignId=current_delivery.campaignId and status in ('PENDING','PROCESSING')) then
    update public.marketingCampaigns c set status=case
      when exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='SENT') and exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status in ('FAILED','UNCERTAIN')) then 'PARTIAL'
      when exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='SENT') then 'SENT'
      when exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='UNCERTAIN') then 'UNCERTAIN'
      when exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='FAILED') then 'FAILED'
      else 'NO_RECIPIENTS' end,
      recipientCount=(select count(*) from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='SENT'),
      data=coalesce(c.data,'{}'::jsonb)||jsonb_build_object('completedAt',now())
      where c.id=current_delivery.campaignId and c.status in ('QUEUED','SENDING');
  end if;
end; $$;
revoke all on function public.finish_marketing_campaign_delivery(uuid,boolean,text,text,boolean) from public, anon, authenticated;
grant execute on function public.finish_marketing_campaign_delivery(uuid,boolean,text,text,boolean) to service_role;

create or replace function public.expire_uncertain_marketing_campaign_deliveries(p_limit integer default 500)
returns integer language plpgsql security definer set search_path=public
as $$
declare changed integer:=0;
begin
  with stale as (
    select id from public.marketingCampaignDeliveries where status='PROCESSING' and updatedAt<now()-interval '15 minutes'
    order by updatedAt for update skip locked limit greatest(1,least(p_limit,1000))
  ) update public.marketingCampaignDeliveries d set status='UNCERTAIN',lastError='Worker stopped before the provider result was recorded; check provider status before retrying.',updatedAt=now()
    from stale where d.id=stale.id;
  get diagnostics changed=row_count;
  update public.marketingCampaigns c set status=case
    when exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='SENT') and exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status in ('FAILED','UNCERTAIN')) then 'PARTIAL'
    when exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='SENT') then 'SENT'
    when exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='UNCERTAIN') then 'UNCERTAIN'
    when exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='FAILED') then 'FAILED'
    else 'NO_RECIPIENTS' end,
    recipientCount=(select count(*) from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status='SENT'),
    data=coalesce(c.data,'{}'::jsonb)||jsonb_build_object('completedAt',now())
    where c.status in ('QUEUED','SENDING') and not exists(select 1 from public.marketingCampaignDeliveries d where d.campaignId=c.id and d.status in ('PENDING','PROCESSING'));
  return changed;
end; $$;
revoke all on function public.expire_uncertain_marketing_campaign_deliveries(integer) from public, anon, authenticated;
grant execute on function public.expire_uncertain_marketing_campaign_deliveries(integer) to service_role;

create or replace function public.marketing_campaign_delivery_summary(p_campaign_ids text[])
returns jsonb language sql security definer set search_path=public
as $$
  select coalesce(jsonb_object_agg(campaign_id,channels),'{}'::jsonb) from (
    select campaignId as campaign_id,jsonb_object_agg(channel,counts) as channels from (
      select campaignId,channel,jsonb_build_object(
        'pending',count(*) filter(where status='PENDING'),
        'processing',count(*) filter(where status='PROCESSING'),
        'sent',count(*) filter(where status='SENT'),
        'failed',count(*) filter(where status='FAILED'),
        'skipped',count(*) filter(where status='SKIPPED'),
        'uncertain',count(*) filter(where status='UNCERTAIN'),
        'total',count(*)
      ) as counts
      from public.marketingCampaignDeliveries where campaignId=any(p_campaign_ids)
      group by campaignId,channel
    ) channel_counts group by campaignId
  ) campaign_counts;
$$;
revoke all on function public.marketing_campaign_delivery_summary(text[]) from public, anon, authenticated;
grant execute on function public.marketing_campaign_delivery_summary(text[]) to service_role;

create or replace function public.enqueue_inactivity_reminders(p_limit integer default 50)
returns integer language plpgsql security definer set search_path=public
as $$
declare recipient record; queued integer:=0; controls jsonb; notification_id uuid;
begin
  select value into controls from public.configuration where key='campaignControls';
  if coalesce((controls->>'inactivityPaused')::boolean,false) then return 0; end if;
  for recipient in
    select u.id,p.pushEnabled from public.users u
    join public.userMarketingPreferences p on p.userId=u.id
    where p.inactivityRemindersEnabled=true
      and u.lastActiveAt < now()-interval '7 days'
      and (p.lastInactivityReminderAt is null or p.lastInactivityReminderAt < u.lastActiveAt)
      and u.isBanned=false and u.isSuspended=false
    order by u.lastActiveAt asc
    for update of p skip locked
    limit greatest(1,least(p_limit,100))
  loop
    update public.userMarketingPreferences set lastInactivityReminderAt=now() where userId=recipient.id;
    insert into public.notifications(userId,title,body,type,data)
      values(recipient.id,'We miss you on Detail','Your Detail account is ready whenever you need it. Come back to see what’s new.','INACTIVITY_REMINDER',jsonb_build_object('type','INACTIVITY_REMINDER')) returning id into notification_id;
    if recipient.pushEnabled then
      insert into public.notificationDeliveries(notificationId,userId,provider,destination,payload)
      select notification_id,recipient.id,'EXPO',d.expoPushToken,jsonb_build_object('title','We miss you on Detail','body','Your Detail account is ready whenever you need it. Come back to see what’s new.','sound','default','data',jsonb_build_object('type','INACTIVITY_REMINDER'))
      from public.userPushDevices d where d.userId=recipient.id
      on conflict(notificationId,provider,destination) do nothing;
    end if;
    queued:=queued+1;
  end loop;
  return queued;
end; $$;
revoke all on function public.enqueue_inactivity_reminders(integer) from public, anon, authenticated;
grant execute on function public.enqueue_inactivity_reminders(integer) to service_role;
