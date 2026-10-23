create or replace function public.expire_stale_cleaner_presence(p_now timestamptz default now(), p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare expired_count integer;
begin
  with stale_cleaners as (
    select id
    from public.users
    where role='CLEANER'
      and status='AVAILABLE'
      and (locationUpdatedAt is null or locationUpdatedAt < p_now-interval '5 minutes')
    order by locationUpdatedAt nulls first,id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,500),1000))
  ), expired as (
    update public.users u
    set status='OFFLINE',location='{}'::jsonb,locationPoint=null,locationUpdatedAt=null,updatedAt=p_now
    from stale_cleaners s
    where u.id=s.id
    returning u.id
  )
  select count(*)::integer into expired_count from expired;
  return expired_count;
end;
$$;

revoke all on function public.expire_stale_cleaner_presence(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.expire_stale_cleaner_presence(timestamptz,integer) to service_role;
