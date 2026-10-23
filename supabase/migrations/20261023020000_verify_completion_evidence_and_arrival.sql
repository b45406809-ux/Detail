create or replace function public.add_completion_photo(
  p_job_id uuid,
  p_cleaner_id uuid,
  p_path text
) returns integer
language plpgsql
security definer
set search_path=public,storage
as $$
declare
  job_record public.jobs;
  photo_paths text[];
  photo_object storage.objects;
  object_name text;
  object_size bigint;
  object_type text;
begin
  select * into job_record from public.jobs where id=p_job_id for update;
  if not found or job_record.cleanerId is distinct from p_cleaner_id
     or job_record.status not in ('ASSIGNED','EN_ROUTE','IN_PROGRESS') then
    raise exception 'Only the assigned cleaner can add completion photos';
  end if;
  if p_path is null or p_path not like 'detail-media/job-completion/'||p_job_id::text||'/'||p_cleaner_id::text||'/%'
     or p_path like '%..%' or p_path like '%?%' or p_path like '%#%' then
    raise exception 'Invalid photo path';
  end if;

  object_name:=substring(p_path from length('detail-media/')+1);
  select * into photo_object from storage.objects
    where bucket_id='detail-media' and name=object_name and owner_id=p_cleaner_id::text;
  if not found then raise exception 'Uploaded completion photo was not found'; end if;
  object_size:=nullif(photo_object.metadata->>'size','')::bigint;
  object_type:=lower(coalesce(photo_object.metadata->>'mimetype',''));
  if object_size is null or object_size<=0 or object_size>15728640
     or object_type not in ('image/jpeg','image/png','image/webp','image/heic') then
    raise exception 'Completion photo must be a supported image smaller than 15 MB';
  end if;

  photo_paths:=coalesce(job_record.completionPhotos,array[]::text[]);
  if p_path=any(photo_paths) then return cardinality(photo_paths); end if;
  if cardinality(photo_paths)>=6 then raise exception 'Photo limit reached'; end if;
  update public.jobs set completionPhotos=array_append(photo_paths,p_path),updatedAt=now() where id=p_job_id;
  return cardinality(photo_paths)+1;
end;
$$;
revoke all on function public.add_completion_photo(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.add_completion_photo(uuid,uuid,text) to service_role;

drop function if exists public.mark_booking_arrived(uuid,uuid,text);
create function public.mark_booking_arrived(
  p_job_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_latitude double precision,
  p_longitude double precision
) returns timestamptz
language plpgsql
security definer
set search_path=public
as $$
declare
  job_record public.jobs;
  arrival timestamptz;
  target_lat double precision;
  target_lng double precision;
  distance_m double precision;
begin
  select * into job_record from public.jobs where id=p_job_id for update;
  if not found or job_record.cleanerId<>p_actor_id or job_record.status<>'EN_ROUTE' then
    raise exception 'Only the assigned cleaner can record arrival while en route';
  end if;
  if job_record.arrivalAt is not null then return job_record.arrivalAt; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8
     or p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'A current location is required to record arrival';
  end if;
  if coalesce(job_record.location->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
     or coalesce(job_record.location->>'lng','') !~ '^-?[0-9]+([.][0-9]+)?$' then
    raise exception 'This booking has no verifiable map location';
  end if;
  target_lat:=(job_record.location->>'lat')::double precision;
  target_lng:=(job_record.location->>'lng')::double precision;
  if target_lat not between -90 and 90 or target_lng not between -180 and 180 then
    raise exception 'This booking has no verifiable map location';
  end if;
  distance_m:=6371000*2*asin(sqrt(
    power(sin(radians(target_lat-p_latitude)/2),2)+
    cos(radians(p_latitude))*cos(radians(target_lat))*power(sin(radians(target_lng-p_longitude)/2),2)
  ));
  if distance_m>300 then raise exception 'Move closer to the booking address before recording arrival'; end if;
  arrival:=now();
  update public.jobs set arrivalAt=arrival,updatedAt=arrival where id=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,data)
    values(p_job_id,p_actor_id,'CLEANER','ARRIVED','EN_ROUTE','EN_ROUTE',p_idempotency_key,jsonb_build_object('arrivalAt',arrival,'distanceMeters',round(distance_m::numeric)))
    on conflict(jobId,idempotencyKey) do nothing;
  return arrival;
end;
$$;
revoke all on function public.mark_booking_arrived(uuid,uuid,text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.mark_booking_arrived(uuid,uuid,text,double precision,double precision) to service_role;
