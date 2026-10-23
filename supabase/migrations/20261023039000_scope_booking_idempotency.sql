-- Serialize booking creation by actor and operation key before checking for a
-- prior result. This makes retries safe even when the first response is lost.
create or replace function public.create_booking(p_actor_id uuid,p_idempotency_key text,p_booking jsonb)
returns uuid language plpgsql security definer set search_path=public,extensions
as $$
declare existing_id uuid; result_id uuid:=gen_random_uuid(); now_at timestamptz:=now(); mode text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text||':'||p_idempotency_key,0));
  select e.jobId into existing_id from public.jobEvents e
    where e.idempotencyKey='created_'||p_idempotency_key and e.actorId=p_actor_id and e.type='CREATION' limit 1;
  if existing_id is not null then return existing_id; end if;
  if p_booking->>'category' not in ('HOUSE','CAR') or coalesce(trim(p_booking->>'serviceType'),'')='' or coalesce(trim(p_booking#>>'{location,address}'),'')='' then raise exception 'Service and location are required'; end if;
  mode:=upper(coalesce(p_booking->>'bookingMode','SCHEDULED'));
  if mode not in ('SCHEDULED','INSTANT') then raise exception 'Invalid booking mode'; end if;
  if mode='INSTANT' and coalesce(p_booking->>'scheduledDateTime','')<>'' then raise exception 'Instant bookings cannot carry a scheduled time'; end if;
  insert into public.jobs(id,customerId,customerName,customerPhoto,category,serviceType,checklist,description,location,
    scheduledTime,scheduledDateTime,timePreference,status,pricingStrategy,budget,biddingExpiresAt,reminderSent,photos,createdAt,data,
    bookingMode,suppliesRequired,suppliesFee,estimatedDuration,matchExpiresAt,price)
  values(result_id,p_actor_id,p_booking->>'customerName',p_booking->>'customerPhoto',p_booking->>'category',p_booking->>'serviceType',p_booking->'checklist',
    coalesce(p_booking->>'description',''),coalesce(p_booking->'location','{}'::jsonb),p_booking->>'scheduledTime',
    nullif(p_booking->>'scheduledDateTime','')::timestamptz,p_booking->>'timePreference','PENDING',coalesce(p_booking->>'pricingStrategy','RECEIVE_BIDS'),
    nullif(p_booking->>'budget','')::numeric,nullif(p_booking->>'biddingExpiresAt','')::timestamptz,coalesce((p_booking->>'reminderSent')::boolean,false),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_booking->'photos','[]'::jsonb))),'{}'),now_at,p_booking,
    mode,coalesce((p_booking->>'suppliesRequired')::boolean,false),greatest(0,coalesce(nullif(p_booking->>'suppliesFee','')::numeric,0)),
    greatest(30,least(720,coalesce(nullif(p_booking->>'estimatedDuration','')::integer,120))),
    case when mode='INSTANT' then now_at+interval '3 minutes' else null end,nullif(p_booking->>'price','')::numeric);
  insert into public.openJobs(jobId,status,category,serviceType,budget,biddingExpiresAt,customerId,createdAt,data)
  values(result_id,'PENDING',p_booking->>'category',p_booking->>'serviceType',nullif(p_booking->>'budget','')::numeric,
    nullif(p_booking->>'biddingExpiresAt','')::timestamptz,p_actor_id,now_at,
    jsonb_build_object('bookingMode',mode,'scheduledDateTime',p_booking->>'scheduledDateTime','timePreference',p_booking->>'timePreference',
      'serviceType',p_booking->>'serviceType','category',p_booking->>'category','estimatedDuration',coalesce(p_booking->>'estimatedDuration','120'),
      'suppliesRequired',coalesce((p_booking->>'suppliesRequired')::boolean,false),'suppliesFee',greatest(0,coalesce(nullif(p_booking->>'suppliesFee','')::numeric,0))));
  insert into public.jobEvents(jobId,actorId,actorRole,type,newState,idempotencyKey,createdAt)
    values(result_id,p_actor_id,'CUSTOMER','CREATION','PENDING','created_'||p_idempotency_key,now_at);
  return result_id;
end; $$;
