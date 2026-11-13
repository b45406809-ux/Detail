-- Only show an approximate area for cleaners who explicitly opted in.
create or replace function public.nearby_cleaners_for_map(p_lat double precision, p_lng double precision)
returns table (id uuid, display_name text, lat double precision, lng double precision)
language sql stable security definer set search_path = public, extensions as $$
  select u.id, u.displayname, approximate.lat, approximate.lng
  from public.users u
  cross join lateral (select
    round(extensions.st_y(u.locationpoint::extensions.geometry)::numeric, 2)::double precision as lat,
    round(extensions.st_x(u.locationpoint::extensions.geometry)::numeric, 2)::double precision as lng
  ) approximate
  where u.role='CLEANER' and u.status='AVAILABLE' and u.verificationstatus='VERIFIED'
    and u.cleaneragreementaccepted and u.cleaneronboardingcomplete
    and not u.issuspended and not u.isbanned and u.accountdeletedat is null
    and u.metadata->>'showOnCustomerMap'='true'
    and u.locationpoint is not null and u.locationupdatedat > now() - interval '5 minutes'
    and extensions.st_dwithin(u.locationpoint, extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography, 28000)
    and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(approximate.lng,approximate.lat),4326)::extensions.geography, extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography, 25000)
  order by extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(approximate.lng,approximate.lat),4326)::extensions.geography, extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography), u.id
  limit 30;
$$;
revoke all on function public.nearby_cleaners_for_map(double precision,double precision) from public,anon,authenticated;
grant execute on function public.nearby_cleaners_for_map(double precision,double precision) to service_role;

create or replace function public.set_cleaner_map_visibility(p_user_id uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.users set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{showOnCustomerMap}',to_jsonb(p_enabled),true), updatedat=now()
  where id=p_user_id and role='CLEANER' and verificationstatus='VERIFIED' and cleaneragreementaccepted
    and cleaneronboardingcomplete and not issuspended and not isbanned and accountdeletedat is null;
  if not found then raise exception 'Only an approved cleaner can change map visibility'; end if;
  return p_enabled;
end;
$$;
revoke all on function public.set_cleaner_map_visibility(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_cleaner_map_visibility(uuid,boolean) to service_role;

create or replace function public.open_job_map_point(p_data jsonb)
returns extensions.geography language plpgsql immutable set search_path=public,extensions as $$
declare lat double precision; lng double precision;
begin
  lat := (p_data#>>'{location,lat}')::double precision;
  lng := (p_data#>>'{location,lng}')::double precision;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 or (lat=0 and lng=0) then return null; end if;
  return extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography;
exception when others then return null;
end;
$$;
create index if not exists openjobs_approx_location_gix on public.openjobs using gist(public.open_job_map_point(data)) where status='PENDING';
create or replace function public.nearby_open_job_ids(p_cleaner_id uuid,p_lat double precision,p_lng double precision)
returns table (jobid uuid) language sql stable security definer set search_path=public,extensions as $$
  select o.jobid from public.openjobs o join public.jobs j on j.id=o.jobid
  where o.status='PENDING' and j.status='PENDING' and j.bookingmode='SCHEDULED'
    and (j.biddingexpiresat is null or j.biddingexpiresat>now())
    and (coalesce(j.data->>'isFavoriteRebook','false') <> 'true' or j.data->>'preferredCleanerId'=p_cleaner_id::text)
    and extensions.st_dwithin(public.open_job_map_point(o.data),extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,25000)
  order by public.open_job_map_point(o.data) <-> extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography
  limit 30;
$$;
revoke all on function public.nearby_open_job_ids(uuid,double precision,double precision) from public,anon,authenticated;
grant execute on function public.nearby_open_job_ids(uuid,double precision,double precision) to service_role;
