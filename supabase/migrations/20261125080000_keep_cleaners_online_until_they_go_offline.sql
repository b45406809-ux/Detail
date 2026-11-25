-- Cleaners stay online until they turn it off.
-- Previously a scheduler flipped any cleaner to OFFLINE once their location was
-- 5 minutes old. iOS only reports location when the phone moves, so a cleaner
-- waiting in one place (or with the app closed) went offline within minutes.
-- Now: the scheduler only clears presence after 24 hours with no location at all
-- (abandoned devices), and matching/notifications accept a location up to 60
-- minutes old.

-- from 20261020010000_marketplace_hardening.sql
create or replace function public.search_instant_cleaners(p_job_id uuid,p_actor_id uuid,p_limit integer default 20)
returns table(cleaner_id uuid,distance_meters integer,display_name text,rating numeric,category_match boolean)
language plpgsql security definer set search_path=public,extensions
as $$
declare job public.jobs; point extensions.geography(Point,4326); max_count integer;
begin
  select * into job from public.jobs where id=p_job_id and customerId=p_actor_id and status='PENDING' for update;
  if not found or job.bookingMode<>'INSTANT' then raise exception 'Instant booking not available'; end if;
  if job.matchExpiresAt<now() then raise exception 'Instant booking matching expired'; end if;
  point:=extensions.st_setsrid(extensions.st_makepoint((job.location->>'lng')::float8,(job.location->>'lat')::float8),4326)::extensions.geography;
  max_count:=greatest(1,least(coalesce(p_limit,20),50));
  return query select u.id,extensions.st_distance(u.locationPoint,point)::integer,u.displayName,u.ratingAverage,
    coalesce(job.category=any(u.serviceCategories),false)
    from public.users u
    where u.role='CLEANER' and u.verificationStatus='VERIFIED' and u.cleanerAgreementAccepted
      and not u.isSuspended and not u.isBanned and u.status='AVAILABLE'
      and u.locationPoint is not null and u.locationUpdatedAt>now()-interval '60 minutes'
      and (u.serviceRadiusKm is null or extensions.st_dwithin(u.locationPoint,point,u.serviceRadiusKm*1000))
      and (cardinality(u.serviceCategories)=0 or job.category=any(u.serviceCategories))
      and not exists(select 1 from public.jobs active where active.cleanerId=u.id and active.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS'))
      and not exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=u.id and b.startsAt<now()+make_interval(mins=>job.estimatedDuration+60) and b.endsAt>now())
    order by u.locationPoint<->point limit max_count;
end; $$;

-- from 20261109000000_targeted_rebooking.sql
create or replace function public.notify_scheduled_job_cleaners(p_job_id uuid,p_customer_id uuid,p_limit integer default 20)
returns integer language plpgsql security definer set search_path=public,extensions
as $$
declare job_record public.jobs; point extensions.geography(Point,4326); starts_at timestamptz;
  duration integer; cleaner_id uuid; target_cleaner_id uuid; notified integer:=0;
begin
  select * into job_record from public.jobs where id=p_job_id and customerId=p_customer_id for update;
  if not found or job_record.status<>'PENDING' or job_record.bookingMode<>'SCHEDULED' then raise exception 'Scheduled booking is unavailable'; end if;
  if coalesce((job_record.data->>'isFavoriteRebook')::boolean,false) then
    begin target_cleaner_id:=nullif(job_record.data->>'preferredCleanerId','')::uuid;
    exception when invalid_text_representation then raise exception 'Invalid preferred cleaner on rebooking'; end;
    if target_cleaner_id is null then raise exception 'Rebooking has no selected cleaner'; end if;
  end if;
  if coalesce(job_record.location->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
     or coalesce(job_record.location->>'lng','') !~ '^-?[0-9]+([.][0-9]+)?$' then return 0; end if;
  if (job_record.location->>'lat')::double precision not between -90 and 90
     or (job_record.location->>'lng')::double precision not between -180 and 180
     or ((job_record.location->>'lat')::double precision=0 and (job_record.location->>'lng')::double precision=0) then return 0; end if;
  point:=extensions.st_setsrid(extensions.st_makepoint((job_record.location->>'lng')::float8,(job_record.location->>'lat')::float8),4326)::extensions.geography;
  starts_at:=coalesce(job_record.scheduledDateTime,now()+interval '30 minutes');
  duration:=greatest(30,least(720,coalesce(job_record.estimatedDuration,120)));
  for cleaner_id in
    select u.id from public.users u
    where (target_cleaner_id is null or u.id=target_cleaner_id)
      and u.role='CLEANER' and u.verificationStatus='VERIFIED' and u.cleanerAgreementAccepted
      and not u.isSuspended and not u.isBanned and u.accountDeletedAt is null and u.status='AVAILABLE'
      and u.locationPoint is not null and u.locationUpdatedAt>now()-interval '60 minutes'
      and extensions.st_dwithin(u.locationPoint,point,least(100000,coalesce(u.serviceRadiusKm,25)*1000))
      and (cardinality(u.serviceCategories)=0 or job_record.category=any(u.serviceCategories))
      and not exists(select 1 from public.jobs a where a.cleanerId=u.id and a.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS'))
      and not exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=u.id
        and b.startsAt<starts_at+make_interval(mins=>duration+60) and b.endsAt>starts_at)
    order by u.locationPoint<->point limit case when target_cleaner_id is null then greatest(1,least(coalesce(p_limit,20),50)) else 1 end
  loop
    insert into public.scheduledJobNotices(jobId,cleanerId) values(p_job_id,cleaner_id) on conflict(jobId,cleanerId) do nothing;
    if found then
      perform public.create_notification_outbox(cleaner_id,
        case when target_cleaner_id is null then 'Scheduled cleaning nearby' else 'A customer wants to book you again' end,
        case when target_cleaner_id is null then 'A customer is collecting quotes for a scheduled cleaning near you. Review the job scope and send a quote if it fits.' else 'A previous customer has requested you for another cleaning. Review the job details and send your quote in Detail.' end,
        'NEW_SCHEDULED_JOB',p_job_id,jsonb_build_object('bookingMode','SCHEDULED','isFavoriteRebook',target_cleaner_id is not null));
      notified:=notified+1;
    end if;
  end loop;
  return notified;
end;
$$;

-- from 20261113010000_nearby_cleaner_map.sql
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
    and u.locationpoint is not null and u.locationupdatedat > now() - interval '60 minutes'
    and extensions.st_dwithin(u.locationpoint, extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography, 28000)
    and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(approximate.lng,approximate.lat),4326)::extensions.geography, extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography, 25000)
  order by extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(approximate.lng,approximate.lat),4326)::extensions.geography, extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography), u.id
  limit 30;
$$;

-- from 20261023048000_expire_stale_cleaner_presence.sql
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
      and (locationUpdatedAt is null or locationUpdatedAt < p_now-interval '24 hours')
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
