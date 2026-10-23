create table if not exists public.userPushDevices(
  expoPushToken text primary key check(expoPushToken ~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$'),
  userId uuid not null references public.users(id) on delete cascade,
  createdAt timestamptz not null default now(),
  lastSeenAt timestamptz not null default now()
);
create index if not exists user_push_devices_user_idx on public.userPushDevices(userId,lastSeenAt desc);
alter table public.userPushDevices enable row level security;
revoke all on public.userPushDevices from anon,authenticated;
grant select,insert,update,delete on public.userPushDevices to service_role;

-- Preserve existing registrations before removing the unsafe single-token field.
insert into public.userPushDevices(expoPushToken,userId)
select expoPushToken,id from public.users
where expoPushToken ~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$'
on conflict(expoPushToken) do update set userId=excluded.userId,lastSeenAt=now();
update public.users set expoPushToken=null where expoPushToken is not null;
revoke update(expoPushToken) on public.users from authenticated;

create or replace function public.register_push_device(p_user_id uuid,p_expo_push_token text)
returns boolean language plpgsql security definer set search_path=public
as $$
begin
  if p_expo_push_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Invalid Expo push token';
  end if;
  insert into public.userPushDevices(expoPushToken,userId,lastSeenAt)
    values(p_expo_push_token,p_user_id,now())
    on conflict(expoPushToken) do update set userId=excluded.userId,lastSeenAt=now();
  return true;
end;
$$;
revoke all on function public.register_push_device(uuid,text) from public,anon,authenticated;
grant execute on function public.register_push_device(uuid,text) to service_role;

create or replace function public.unregister_push_device(p_user_id uuid,p_expo_push_token text)
returns boolean language sql security definer set search_path=public
as $$
  with removed as (
    delete from public.userPushDevices where userId=p_user_id and expoPushToken=p_expo_push_token returning 1
  ) select exists(select 1 from removed);
$$;
revoke all on function public.unregister_push_device(uuid,text) from public,anon,authenticated;
grant execute on function public.unregister_push_device(uuid,text) to service_role;

create or replace function public.create_notification_outbox(
  p_user_id uuid,p_title text,p_body text,p_type text,p_job_id uuid,p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  recipient public.users;
  notification_id uuid;
  normalized_type text := coalesce(nullif(left(p_type,50),''),'SYSTEM');
  safe_title text := left(coalesce(p_title,''),160);
  safe_body text := left(coalesce(p_body,''),1000);
  urgent boolean;
  delivery_count integer := 0;
begin
  select * into recipient from public.users where id=p_user_id;
  if not found then raise exception 'Notification recipient not found'; end if;
  urgent := normalized_type ~* '(EMERGENCY|DISPUT|PAYMENT|PAYOUT|REFUND)';
  insert into public.notifications(userId,title,body,type,jobId,data)
    values(p_user_id,safe_title,safe_body,normalized_type,p_job_id,coalesce(p_data,'{}'::jsonb)) returning id into notification_id;

  insert into public.notificationDeliveries(notificationId,userId,provider,destination,payload)
  select notification_id,p_user_id,'EXPO',device.expoPushToken,jsonb_build_object(
    'title',safe_title,'body',left(safe_body,500),'sound',case when urgent then 'urgent.wav' else 'booking.wav' end,
    'channelId',case when urgent then 'urgent' else 'bookings' end,
    'data',jsonb_strip_nulls(jsonb_build_object('type',normalized_type,'jobId',p_job_id,'supportCaseId',p_data->>'supportCaseId'))
  ) from public.userPushDevices device where device.userId=p_user_id
  on conflict(notificationId,provider,destination) do nothing;
  get diagnostics delivery_count = row_count;

  if recipient.phone ~ '^\+[1-9][0-9]{7,14}$'
     and normalized_type = any(array['EMERGENCY','PAYMENT_DISPUTED','PAYMENT_DELIVERED','CANCELLATION_REVIEW','CANCELLED','ASSIGNED','EN_ROUTE','CLEANER_ARRIVED','COMPLETED','INSTANT_BOOKING_ACCEPTED']) then
    insert into public.notificationDeliveries(notificationId,userId,provider,destination,payload)
      values(notification_id,p_user_id,'TWILIO',recipient.phone,jsonb_build_object(
        'body','Detail: '||left(safe_title,100)||'. '||left(safe_body,300)||case when p_job_id is null then '' else ' Booking '||left(p_job_id::text,40)||'.' end
      )) on conflict(notificationId,provider,destination) do nothing;
    delivery_count:=delivery_count+1;
  end if;
  return jsonb_build_object('notificationId',notification_id,'hasDeliveries',delivery_count>0);
end;
$$;
revoke all on function public.create_notification_outbox(uuid,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_notification_outbox(uuid,text,text,text,uuid,jsonb) to service_role;

alter table public.notificationDeliveries drop constraint if exists notificationdeliveries_notificationid_provider_key;
create unique index if not exists notification_deliveries_notification_provider_destination_uidx
  on public.notificationDeliveries(notificationId,provider,destination);

create or replace function public.revoke_push_devices_on_account_close()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if old.accountDeletedAt is null and new.accountDeletedAt is not null then
    delete from public.userPushDevices where userId=new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists users_revoke_push_devices_on_close on public.users;
create trigger users_revoke_push_devices_on_close before update of accountDeletedAt on public.users
for each row execute function public.revoke_push_devices_on_account_close();
