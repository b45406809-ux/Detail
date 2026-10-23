create or replace function public.expire_unmatched_instant_bookings(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  booking public.jobs;
  customer_action_expired boolean;
  expired_count integer := 0;
begin
  for booking in
    select j.*
    from public.jobs j
    where j.bookingMode='INSTANT'
      and j.status='PENDING'
      and j.matchExpiresAt is not null
      and j.matchExpiresAt<=now()
      and not exists(select 1 from public.bids b where b.jobId=j.id and b.status='PENDING' and b.createdAt>now()-interval '15 minutes')
    order by j.matchExpiresAt
    limit greatest(1,least(coalesce(p_limit,200),1000))
    for update skip locked
  loop
    customer_action_expired:=exists(select 1 from public.bids b where b.jobId=booking.id and b.status='PENDING');
    if customer_action_expired then
      update public.bids set status='EXPIRED',updatedAt=now() where jobId=booking.id and status='PENDING';
    end if;
    update public.jobs
      set status='CANCELLED',updatedAt=now(),
          data=data||jsonb_build_object('instantMatchingExpired',true,'instantMatchingExpiredAt',now())
      where id=booking.id;
    update public.instantOffers set status='EXPIRED',respondedAt=now()
      where jobId=booking.id and status='OFFERED';
    delete from public.openJobs where jobId=booking.id;
    insert into public.jobEvents(jobId,actorRole,type,previousState,newState,idempotencyKey,reason,data)
      values(booking.id,'SYSTEM','INSTANT_MATCH_EXPIRED','PENDING','CANCELLED','instant_match_expired_'||booking.id,
        'No cleaner accepted before the matching window closed.',jsonb_build_object('expiredAt',now()))
      on conflict(jobId,idempotencyKey) do nothing;
    perform public.create_notification_outbox(
      booking.customerId,
      case when customer_action_expired then 'The instant offer expired' else 'No cleaner accepted this request' end,
      case when customer_action_expired
        then 'A cleaner accepted, but the offer was not confirmed in time. You can create another booking.'
        else 'Your instant request expired without a cleaner. You can create a scheduled booking and choose a time that works for you.' end,
      'INSTANT_MATCH_EXPIRED',booking.id,'{}'::jsonb
    );
    expired_count:=expired_count+1;
  end loop;
  return expired_count;
end;
$$;
revoke all on function public.expire_unmatched_instant_bookings(integer) from public,anon,authenticated;
grant execute on function public.expire_unmatched_instant_bookings(integer) to service_role;
