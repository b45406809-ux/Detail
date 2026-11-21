create table if not exists public.mapbox_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_month date not null,
  map_loaded boolean not null default false,
  geocoding_requests bigint not null default 0 check (geocoding_requests >= 0),
  directions_requests bigint not null default 0 check (directions_requests >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_month),
  check (extract(day from usage_month) = 1)
);

alter table public.mapbox_usage_monthly enable row level security;
revoke all on public.mapbox_usage_monthly from anon, authenticated;
grant select on public.mapbox_usage_monthly to service_role;

create or replace function public.record_mapbox_usage(p_kind text, p_count integer default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_month date := date_trunc('month', now())::date;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_kind not in ('map_view', 'geocoding', 'directions') then
    raise exception 'Unsupported Mapbox usage type';
  end if;
  if p_count is null or p_count < 1 or p_count > 10000 then
    raise exception 'Usage count must be between 1 and 10000';
  end if;

  insert into public.mapbox_usage_monthly as current_usage (
    user_id, usage_month, map_loaded, geocoding_requests, directions_requests, updated_at
  ) values (
    v_user_id, v_month, p_kind = 'map_view',
    case when p_kind = 'geocoding' then p_count else 0 end,
    case when p_kind = 'directions' then p_count else 0 end,
    now()
  )
  on conflict (user_id, usage_month) do update set
    map_loaded = current_usage.map_loaded or excluded.map_loaded,
    geocoding_requests = current_usage.geocoding_requests + excluded.geocoding_requests,
    directions_requests = current_usage.directions_requests + excluded.directions_requests,
    updated_at = now();
end;
$$;

revoke all on function public.record_mapbox_usage(text, integer) from public, anon;
grant execute on function public.record_mapbox_usage(text, integer) to authenticated;
