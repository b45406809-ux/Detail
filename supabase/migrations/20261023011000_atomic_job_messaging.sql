create or replace function public.send_job_message(
  p_job_id uuid,
  p_text text,
  p_image_path text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  booking public.jobs;
  sender public.users;
  recipient_id uuid;
  message_id uuid;
  clean_text text := left(trim(coalesce(p_text, '')), 2000);
  clean_image text := nullif(trim(coalesce(p_image_path, '')), '');
begin
  if actor_id is null then raise exception 'Sign in required'; end if;
  if length(clean_text) = 0 and clean_image is null then raise exception 'Message cannot be empty'; end if;
  if clean_image is not null and clean_image !~ ('^detail-media/chat-photos/' || p_job_id::text || '/' || actor_id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid chat image path';
  end if;

  select * into booking from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if booking.customerId = actor_id then recipient_id := booking.cleanerId;
  elsif booking.cleanerId = actor_id then recipient_id := booking.customerId;
  else raise exception 'Only booking participants can send messages'; end if;
  if recipient_id is null then raise exception 'This booking has no other participant yet'; end if;
  select * into sender from public.users where id = actor_id;
  if not found then raise exception 'Sender profile not found'; end if;

  insert into public.messages(jobId,senderId,senderName,text,imageUrl)
  values(p_job_id,actor_id,sender.displayName,clean_text,clean_image)
  returning id into message_id;

  if booking.customerId = actor_id then
    update public.jobs set lastMessage=coalesce(nullif(clean_text,''),'📷 Photo'),lastMessageAt=now(),cleanerUnread=cleanerUnread+1,customerUnread=0 where id=p_job_id;
  else
    update public.jobs set lastMessage=coalesce(nullif(clean_text,''),'📷 Photo'),lastMessageAt=now(),customerUnread=customerUnread+1,cleanerUnread=0 where id=p_job_id;
  end if;

  perform public.create_notification_outbox(
    recipient_id,
    'New message from ' || coalesce(nullif(sender.displayName,''),'your booking partner'),
    coalesce(nullif(clean_text,''),'Sent a photo'),
    'MESSAGE',p_job_id,'{}'::jsonb
  );
  return message_id;
end;
$$;
revoke all on function public.send_job_message(uuid,text,text) from public,anon;
grant execute on function public.send_job_message(uuid,text,text) to authenticated;

create or replace function public.mark_job_messages_read(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  booking public.jobs;
begin
  if actor_id is null then raise exception 'Sign in required'; end if;
  select * into booking from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if booking.customerId=actor_id then
    update public.jobs set customerUnread=0 where id=p_job_id;
  elsif booking.cleanerId=actor_id then
    update public.jobs set cleanerUnread=0 where id=p_job_id;
  else raise exception 'Only booking participants can mark messages read'; end if;
end;
$$;
revoke all on function public.mark_job_messages_read(uuid) from public,anon;
grant execute on function public.mark_job_messages_read(uuid) to authenticated;
