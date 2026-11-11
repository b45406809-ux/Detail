-- Conversation safety controls. Blocks are private to the blocking account;
-- message writes and Twilio call setup enforce them on the server.
create table public.userBlocks (
  blockerId uuid not null references public.users(id) on delete cascade,
  blockedUserId uuid not null references public.users(id) on delete cascade,
  createdAt timestamptz not null default now(),
  primary key (blockerId, blockedUserId),
  constraint user_blocks_not_self check (blockerId <> blockedUserId)
);

create index user_blocks_target_idx on public.userBlocks(blockedUserId, blockerId);
alter table public.userBlocks enable row level security;
revoke all on public.userBlocks from public, anon, authenticated;
grant select, delete on public.userBlocks to service_role;

create or replace function public.get_message_safety_state(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor_id uuid := auth.uid(); other_id uuid;
begin
  if actor_id is null then raise exception 'Sign in required'; end if;
  select case when customerId=actor_id then cleanerId else customerId end into other_id
    from public.jobs where id=p_job_id and (customerId=actor_id or cleanerId=actor_id);
  if not found or other_id is null then raise exception 'This conversation is unavailable'; end if;
  return jsonb_build_object(
    'blockedByMe', exists(select 1 from public.userBlocks where blockerId=actor_id and blockedUserId=other_id),
    'blockedMe', exists(select 1 from public.userBlocks where blockerId=other_id and blockedUserId=actor_id)
  );
end;
$$;
revoke all on function public.get_message_safety_state(uuid) from public, anon, authenticated;
grant execute on function public.get_message_safety_state(uuid) to authenticated;

create or replace function public.block_user(p_job_id uuid, p_target_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Sign in required'; end if;
  if actor_id=p_target_user_id then raise exception 'You cannot block your own account'; end if;
  if not exists(select 1 from public.jobs where id=p_job_id and
    ((customerId=actor_id and cleanerId=p_target_user_id) or (cleanerId=actor_id and customerId=p_target_user_id))) then
    raise exception 'Only a participant in this booking can block the other participant';
  end if;
  insert into public.userBlocks(blockerId,blockedUserId) values(actor_id,p_target_user_id)
    on conflict(blockerId,blockedUserId) do nothing;
  return true;
end;
$$;
revoke all on function public.block_user(uuid,uuid) from public, anon;
grant execute on function public.block_user(uuid,uuid) to authenticated;

create or replace function public.unblock_user(p_target_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Sign in required'; end if;
  delete from public.userBlocks where blockerId=actor_id and blockedUserId=p_target_user_id;
  return true;
end;
$$;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- Screen common abusive language before a message is stored. Reports and blocks
-- remain available for images, context-dependent abuse, and missed variants.
create or replace function public.chat_message_is_allowed(p_text text)
returns boolean language sql immutable parallel safe set search_path=public as $$
  select coalesce(p_text,'') !~* '(^|[^[:alnum:]_])(fuck|fucking|fucker|motherfucker|shit|bullshit|bitch|bitches|asshole|cunt|bastard|whore|slut|nigger|nigga|faggot|retard)([^[:alnum:]_]|$)';
$$;
revoke all on function public.chat_message_is_allowed(text) from public, anon, authenticated;

-- Keep server-side chat authorization authoritative even if a modified client
-- bypasses the disabled composer. Existing conversation history stays visible.
create or replace function public.send_job_message(
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

  if length(clean_text)>0 and not public.chat_message_is_allowed(clean_text) then
    raise exception 'CHAT_CONTENT_FILTERED';
  end if;

  if exists(select 1 from public.userBlocks where
    (blockerId=actor_id and blockedUserId=recipient_id) or (blockerId=recipient_id and blockedUserId=actor_id)) then
    raise exception 'MESSAGING_BLOCKED';
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
