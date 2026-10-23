create or replace function public.create_notification_outbox(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_job_id uuid,
  p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  recipient public.users;
  notification_id uuid;
  normalized_type text := coalesce(nullif(left(p_type, 50), ''), 'SYSTEM');
  safe_title text := left(coalesce(p_title, ''), 160);
  safe_body text := left(coalesce(p_body, ''), 1000);
  urgent boolean;
  delivery_count integer := 0;
begin
  select * into recipient from public.users where id = p_user_id;
  if not found then raise exception 'Notification recipient not found'; end if;
  urgent := normalized_type ~* '(EMERGENCY|DISPUT|PAYMENT|PAYOUT|REFUND)';

  insert into public.notifications(userId,title,body,type,jobId,data)
  values(p_user_id,safe_title,safe_body,normalized_type,p_job_id,coalesce(p_data,'{}'::jsonb))
  returning id into notification_id;

  if nullif(recipient.expoPushToken, '') is not null then
    insert into public.notificationDeliveries(notificationId,userId,provider,destination,payload)
    values(notification_id,p_user_id,'EXPO',recipient.expoPushToken,jsonb_build_object(
      'title',safe_title,'body',left(safe_body,500),'sound',case when urgent then 'urgent.wav' else 'booking.wav' end,
      'channelId',case when urgent then 'urgent' else 'bookings' end,
      'data',jsonb_strip_nulls(jsonb_build_object('type',normalized_type,'jobId',p_job_id,'supportCaseId',p_data->>'supportCaseId'))
    )) on conflict(notificationId,provider) do nothing;
    delivery_count := delivery_count + 1;
  end if;

  if recipient.phone ~ '^\+[1-9][0-9]{7,14}$'
     and normalized_type = any(array['EMERGENCY','PAYMENT_DISPUTED','PAYMENT_DELIVERED','CANCELLATION_REVIEW','CANCELLED','ASSIGNED','EN_ROUTE','CLEANER_ARRIVED','COMPLETED','INSTANT_BOOKING_ACCEPTED']) then
    insert into public.notificationDeliveries(notificationId,userId,provider,destination,payload)
    values(notification_id,p_user_id,'TWILIO',recipient.phone,jsonb_build_object(
      'body','Detail: '||left(safe_title,100)||'. '||left(safe_body,300)||case when p_job_id is null then '' else ' Booking '||left(p_job_id::text,40)||'.' end
    )) on conflict(notificationId,provider) do nothing;
    delivery_count := delivery_count + 1;
  end if;
  return jsonb_build_object('notificationId',notification_id,'hasDeliveries',delivery_count>0);
end;
$$;
revoke all on function public.create_notification_outbox(uuid,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_notification_outbox(uuid,text,text,text,uuid,jsonb) to service_role;
