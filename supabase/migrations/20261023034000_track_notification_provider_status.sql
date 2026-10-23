alter table public.notificationDeliveries drop constraint if exists notificationdeliveries_status_check;
alter table public.notificationDeliveries add constraint notificationdeliveries_status_check
  check(status in ('PENDING','PROCESSING','ACCEPTED','DELIVERED','FAILED'));
alter table public.notificationDeliveries add column if not exists providerStatus text;
update public.notificationDeliveries
set status=case when receiptCheckedAt is not null and lastError is not null then 'FAILED' else 'ACCEPTED' end,
    providerStatus=case when receiptCheckedAt is not null and lastError is not null then 'RECEIPT_ERROR' else 'ACCEPTED' end
where status='DELIVERED';

create table public.notificationDeliveryCallbacks (
  id uuid primary key default gen_random_uuid(),providerReceiptId text not null,providerStatus text not null,
  errorCode text,errorMessage text,receivedAt timestamptz not null default now(),
  unique(providerReceiptId,providerStatus)
);
create index notification_delivery_callback_receipt_idx on public.notificationDeliveryCallbacks(providerReceiptId,receivedAt desc);
alter table public.notificationDeliveryCallbacks enable row level security;
revoke all on public.notificationDeliveryCallbacks from anon,authenticated;
grant all on public.notificationDeliveryCallbacks to service_role;

create or replace function public.apply_twilio_delivery_status(p_receipt_id text,p_provider_status text,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare normalized text:=lower(trim(p_provider_status)); delivery_status text;
begin
  if normalized not in ('accepted','queued','sending','sent','delivered','read','failed','undelivered') then
    raise exception 'Unsupported Twilio delivery status';
  end if;
  delivery_status:=case when normalized in ('delivered','read') then 'DELIVERED'
    when normalized in ('failed','undelivered') then 'FAILED' else 'ACCEPTED' end;
  update public.notificationDeliveries set status=delivery_status,providerStatus=normalized,
    lastError=case when delivery_status='FAILED' then left(coalesce(p_error,'Twilio reported delivery failure'),500) else null end,
    receiptCheckedAt=now(),updatedAt=now()
    where provider='TWILIO' and providerReceiptId=p_receipt_id
      and (status not in ('DELIVERED','FAILED') or status=delivery_status);
  return found;
end $$;
revoke all on function public.apply_twilio_delivery_status(text,text,text) from public,anon,authenticated;
grant execute on function public.apply_twilio_delivery_status(text,text,text) to service_role;

create or replace function public.finish_notification_delivery(p_id uuid,p_success boolean,p_error text default null,p_receipt_id text default null)
returns void language plpgsql security definer set search_path=public as $$
declare current_delivery public.notificationDeliveries; callback public.notificationDeliveryCallbacks;
begin
  select * into current_delivery from public.notificationDeliveries where id=p_id for update;
  if not found then return; end if;
  update public.notificationDeliveries set
    status=case when p_success then 'ACCEPTED' when attempts>=6 then 'FAILED' else 'PENDING' end,
    nextAttemptAt=now()+make_interval(secs=>least(3600,power(2,least(attempts,10))::integer*15)),
    lastError=case when p_success then null else left(coalesce(p_error,'Provider delivery failed'),500) end,
    providerStatus=case when p_success then 'ACCEPTED' else null end,
    providerReceiptId=case when p_success then left(p_receipt_id,200) else providerReceiptId end,updatedAt=now()
    where id=p_id;
  if p_success and current_delivery.provider='TWILIO' and p_receipt_id is not null then
    select * into callback from public.notificationDeliveryCallbacks where providerReceiptId=p_receipt_id order by receivedAt desc limit 1;
    if found then perform public.apply_twilio_delivery_status(p_receipt_id,callback.providerStatus,callback.errorMessage); end if;
  end if;
end $$;
revoke all on function public.finish_notification_delivery(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.finish_notification_delivery(uuid,boolean,text,text) to service_role;
