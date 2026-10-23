create index if not exists jobs_id_text_prefix_idx
  on public.jobs (lower(id::text) text_pattern_ops);

create or replace function public.admin_search_booking_ids(p_search text,p_limit integer default 1000)
returns table(id uuid) language sql stable security definer set search_path=public as $$
  select j.id
  from public.jobs j
  where p_search ~* '^[0-9a-f-]{4,36}$'
    and lower(j.id::text) like lower(p_search)||'%'
  order by j.createdAt desc,j.id desc
  limit greatest(1,least(p_limit,5000));
$$;
revoke all on function public.admin_search_booking_ids(text,integer) from public,anon,authenticated;
grant execute on function public.admin_search_booking_ids(text,integer) to service_role;
