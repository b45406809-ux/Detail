alter table public.messages add column idempotencyKey text;
create unique index messages_sender_idempotency_key_idx
  on public.messages(senderId,idempotencyKey)
  where idempotencyKey is not null;

drop function public.send_job_message(uuid,text,text);
create function public.send_job_message(
  p_job_id uuid,p_text text,p_image_path text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  actor_id uuid:=auth.uid();
  booking public.jobs;
  sender public.users;
  recipient_id uuid;
  prior public.messages;
  message_id uuid;
  current_count integer;
  clean_text text:=left(trim(coalesce(p_text,'')),2000);
  clean_image text:=nullif(trim(coalesce(p_image_path,'')),'');
begin
  if actor_id is null then raise exception 'Sign in required'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,160}$' then raise exception 'A valid message idempotency key is required'; end if;
  if length(clean_text)=0 and clean_image is null then raise exception 'Message cannot be empty'; end if;
  if clean_image is not null and clean_image !~ ('^detail-media/chat-photos/'||p_job_id::text||'/'||actor_id::text||'/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid chat image path';
  end if;

  select * into booking from public.jobs where id=p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if booking.customerId=actor_id then recipient_id:=booking.cleanerId;
  elsif booking.cleanerId=actor_id then recipient_id:=booking.customerId;
  else raise exception 'Only booking participants can send messages'; end if;
  if recipient_id is null then raise exception 'This booking has no other participant yet'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text||':'||p_idempotency_key,0));
  select * into prior from public.messages where senderId=actor_id and idempotencyKey=p_idempotency_key;
  if found then
    if prior.jobId<>p_job_id or prior.text<>clean_text or prior.imageUrl is distinct from clean_image then
      raise exception 'Idempotency key reused for a different message';
    end if;
    return prior.id;
  end if;

  insert into public.authRateLimits(key,count,windowStartedAt,expiresAt)
    values('chat:'||actor_id::text||':'||p_job_id::text,1,now(),now()+interval '5 minutes')
    on conflict(key) do update set
      count=case when public.authRateLimits.expiresAt<=now() then 1 else public.authRateLimits.count+1 end,
      windowStartedAt=case when public.authRateLimits.expiresAt<=now() then now() else public.authRateLimits.windowStartedAt end,
      expiresAt=case when public.authRateLimits.expiresAt<=now() then now()+interval '5 minutes' else public.authRateLimits.expiresAt end
    returning count into current_count;
  if current_count>30 then raise exception 'Too many messages. Wait a few minutes and try again'; end if;

  select * into sender from public.users where id=actor_id;
  if not found then raise exception 'Sender profile not found'; end if;
  insert into public.messages(jobId,senderId,senderName,text,imageUrl,idempotencyKey)
    values(p_job_id,actor_id,sender.displayName,clean_text,clean_image,p_idempotency_key)
    returning id into message_id;

  if booking.customerId=actor_id then
    update public.jobs set lastMessage=coalesce(nullif(clean_text,''),'📷 Photo'),lastMessageAt=now(),cleanerUnread=cleanerUnread+1,customerUnread=0 where id=p_job_id;
  else
    update public.jobs set lastMessage=coalesce(nullif(clean_text,''),'📷 Photo'),lastMessageAt=now(),customerUnread=customerUnread+1,cleanerUnread=0 where id=p_job_id;
  end if;
  perform public.create_notification_outbox(
    recipient_id,
    'New message from '||coalesce(nullif(sender.displayName,''),'your booking partner'),
    coalesce(nullif(clean_text,''),'Sent a photo'),
    'MESSAGE',p_job_id,'{}'::jsonb
  );
  return message_id;
end;
$$;
revoke all on function public.send_job_message(uuid,text,text,text) from public,anon;
grant execute on function public.send_job_message(uuid,text,text,text) to authenticated;
