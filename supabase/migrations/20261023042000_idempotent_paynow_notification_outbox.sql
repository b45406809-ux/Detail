-- Payment callbacks may be replayed after the payment row was already updated.
-- Let them safely ensure the same durable notification and delivery rows exist.
create or replace function public.create_notification_outbox_with_id(
  p_notification_id uuid,p_user_id uuid,p_title text,p_body text,p_type text,p_job_id uuid,p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  recipient public.users;
  notification_id uuid;
  normalized_type text:=coalesce(nullif(left(p_type,50),''),'SYSTEM');
  safe_title text:=left(coalesce(p_title,''),160);
  safe_body text:=left(coalesce(p_body,''),1000);
  urgent boolean;
  delivery_count integer:=0;
begin
  select * into recipient from public.users where id=p_user_id;
  if not found then raise exception 'Notification recipient not found'; end if;
  insert into public.notifications(id,userId,title,body,type,jobId,data)
    values(p_notification_id,p_user_id,safe_title,safe_body,normalized_type,p_job_id,coalesce(p_data,'{}'::jsonb))
    on conflict(id) do nothing returning id into notification_id;
  if notification_id is null then
    return jsonb_build_object('notificationId',p_notification_id,'duplicate',true);
  end if;
  urgent:=normalized_type ~* '(EMERGENCY|DISPUT|PAYMENT|PAYOUT|REFUND)';
  insert into public.notificationDeliveries(notificationId,userId,provider,destination,payload)
  select notification_id,p_user_id,'EXPO',device.expoPushToken,jsonb_build_object(
    'title',safe_title,'body',left(safe_body,500),'sound',case when urgent then 'urgent.wav' else 'booking.wav' end,
    'channelId',case when urgent then 'urgent' else 'bookings' end,
    'data',jsonb_strip_nulls(jsonb_build_object('type',normalized_type,'jobId',p_job_id,'supportCaseId',p_data->>'supportCaseId','paymentStatus',p_data->>'paymentStatus'))
  ) from public.userPushDevices device where device.userId=p_user_id
  on conflict(notificationId,provider,destination) do nothing;
  get diagnostics delivery_count=row_count;
  if recipient.phone ~ '^\+[1-9][0-9]{7,14}$'
     and normalized_type=any(array['PAYMENT_DISPUTED','PAYMENT_DELIVERED','PAYMENT_PAID','PAYMENT_REFUNDED']) then
    insert into public.notificationDeliveries(notificationId,userId,provider,destination,payload)
      values(notification_id,p_user_id,'TWILIO',recipient.phone,jsonb_build_object('body','Detail: '||left(safe_title,100)||'. '||left(safe_body,300)))
      on conflict(notificationId,provider,destination) do nothing;
    delivery_count:=delivery_count+1;
  end if;
  return jsonb_build_object('notificationId',notification_id,'duplicate',false,'hasDeliveries',delivery_count>0);
end;
$$;
revoke all on function public.create_notification_outbox_with_id(uuid,uuid,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_notification_outbox_with_id(uuid,uuid,text,text,text,uuid,jsonb) to service_role;
