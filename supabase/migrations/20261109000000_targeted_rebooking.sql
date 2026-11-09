-- Rebook requests are visible in the normal scheduled feed, but only the
-- previous cleaner may quote or receive the rebooking notification.
create or replace function public.submit_bid_secure(
  p_job_id uuid, p_cleaner_id uuid, p_bid_price numeric,
  p_estimated_arrival integer, p_message text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare job_record public.jobs; cleaner public.users; existing_bid public.bids; bid_id uuid;
begin
  select * into job_record from public.jobs where id=p_job_id for update;
  if not found or job_record.status<>'PENDING' or job_record.bookingMode='INSTANT'
     or (job_record.biddingExpiresAt is not null and job_record.biddingExpiresAt<=now()) then
    raise exception 'This booking is not accepting cleaner bids';
  end if;
  if coalesce((job_record.data->>'isFavoriteRebook')::boolean,false)
     and nullif(job_record.data->>'preferredCleanerId','')::uuid is distinct from p_cleaner_id then
    raise exception 'This rebooking request is reserved for the cleaner selected by the customer';
  end if;
  select * into cleaner from public.users where id=p_cleaner_id for update;
  if not found or cleaner.role<>'CLEANER' or cleaner.verificationStatus<>'VERIFIED' or not cleaner.cleanerAgreementAccepted
     or not cleaner.cleanerOnboardingComplete or cleaner.isSuspended or cleaner.isBanned or cleaner.accountDeletedAt is not null then
    raise exception 'Complete cleaner verification and resolve account restrictions before bidding';
  end if;
  if p_bid_price is null or p_bid_price<1 or p_bid_price>10000 or p_estimated_arrival is null or p_estimated_arrival not between 1 and 120
     or length(coalesce(p_message,''))>500 then raise exception 'Enter a valid quote and arrival estimate'; end if;
  select * into existing_bid from public.bids where jobId=p_job_id and cleanerId=p_cleaner_id and status in ('PENDING','COUNTERED','ACCEPTED') for update;
  if found then
    if existing_bid.bidPrice=p_bid_price and existing_bid.estimatedArrival=p_estimated_arrival
       and coalesce(existing_bid.message,'')=coalesce(nullif(trim(p_message),''),'') then return existing_bid.id; end if;
    raise exception 'You already have an active quote for this booking';
  end if;
  insert into public.bids(jobId,cleanerId,cleanerName,cleanerPhoto,cleanerRating,cleanerReviewCount,cleanerJobsCompleted,bidPrice,estimatedArrival,message,status,history)
    values(p_job_id,p_cleaner_id,cleaner.displayName,cleaner.photoURL,cleaner.ratingAverage,cleaner.ratingCount,cleaner.jobsCompleted,p_bid_price,p_estimated_arrival,
      nullif(trim(p_message),''),'PENDING',jsonb_build_array(jsonb_build_object('by','CLEANER','price',p_bid_price,'message',nullif(trim(p_message),''),'createdAt',now())))
    returning id into bid_id;
  return bid_id;
end;
$$;
revoke all on function public.submit_bid_secure(uuid,uuid,numeric,integer,text) from public,anon,authenticated;
grant execute on function public.submit_bid_secure(uuid,uuid,numeric,integer,text) to service_role;

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
      and u.locationPoint is not null and u.locationUpdatedAt>now()-interval '5 minutes'
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
revoke all on function public.notify_scheduled_job_cleaners(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.notify_scheduled_job_cleaners(uuid,uuid,integer) to service_role;
