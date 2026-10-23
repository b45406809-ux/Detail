create index if not exists auth_rate_limits_expires_at_idx on public.authRateLimits(expiresAt);

create or replace function public.cleanup_expired_rate_limits(p_limit integer default 1000)
returns integer language plpgsql security definer set search_path=public
as $$
declare removed_count integer;
begin
  with expired as (
    select key from public.authRateLimits
    where expiresAt <= now()
    order by expiresAt
    limit greatest(1,least(coalesce(p_limit,1000),10000))
    for update skip locked
  )
  delete from public.authRateLimits r using expired e where r.key=e.key;
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;
revoke all on function public.cleanup_expired_rate_limits(integer) from public,anon,authenticated;
grant execute on function public.cleanup_expired_rate_limits(integer) to service_role;
