-- Booking participants may read chat messages for 24 hours. Authorized staff
-- use the service-role-only paging function below to review retained history.
drop policy if exists "Job participants read messages" on public.messages;
create policy "Participants read recent messages" on public.messages for select to authenticated
using (public.is_job_participant(jobId) and createdAt >= now() - interval '24 hours');

-- Do not leave a second copy of message text in the booking summary or the
-- user's notification inbox after chat access is restricted to admins.
update public.jobs
set lastMessage=case when lastMessageAt >= now()-interval '24 hours' then 'New message' else 'No recent messages' end
where coalesce(lastMessage,'')<>'';
update public.notifications
set title='New booking message',body='A new message was sent in your booking conversation.'
where type='MESSAGE';
update public.notificationDeliveries d
set payload=jsonb_set(coalesce(d.payload,'{}'::jsonb),'{body}',to_jsonb('A new message was sent in your booking conversation.'::text),true)
from public.notifications n
where d.notificationId=n.id and n.type='MESSAGE' and d.payload ? 'body';

create or replace function public.admin_user_message_page(
  p_user_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 100
) returns table(
  id uuid,
  jobid uuid,
  senderid uuid,
  sendername text,
  text text,
  imageurl text,
  createdat timestamptz
) language sql stable security definer set search_path=public as $$
  select m.id,m.jobId,m.senderId,m.senderName,m.text,m.imageUrl,m.createdAt
  from public.messages m
  join public.jobs j on j.id=m.jobId
  where (j.customerId=p_user_id or j.cleanerId=p_user_id)
    and (p_before_created_at is null or (m.createdAt,m.id)<(p_before_created_at,p_before_id))
  order by m.createdAt desc,m.id desc
  limit greatest(1,least(coalesce(p_limit,100),100));
$$;
revoke all on function public.admin_user_message_page(uuid,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.admin_user_message_page(uuid,timestamptz,uuid,integer) to service_role;
