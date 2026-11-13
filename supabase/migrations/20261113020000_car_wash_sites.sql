-- Car wash locations are public business destinations, separate from a
-- cleaner's private home address and live GPS location.
create table if not exists public.car_wash_sites (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  address text not null check (length(trim(address)) between 4 and 240),
  location extensions.geography(Point,4326) not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cleaner_id)
);
create index if not exists car_wash_sites_location_gix on public.car_wash_sites using gist(location);
alter table public.car_wash_sites enable row level security;
revoke all on public.car_wash_sites from public, anon, authenticated;

create or replace function public.list_car_wash_sites(p_lat double precision,p_lng double precision)
returns table(id uuid,cleaner_id uuid,name text,address text,lat double precision,lng double precision)
language sql stable security definer set search_path=public,extensions
as $$
  select s.id,s.cleaner_id,s.name,s.address,
    extensions.st_y(s.location::extensions.geometry),extensions.st_x(s.location::extensions.geometry)
  from public.car_wash_sites s join public.users u on u.id=s.cleaner_id
  where s.enabled and u.role='CLEANER' and u.verificationStatus='VERIFIED'
    and u.cleanerAgreementAccepted and u.cleanerOnboardingComplete
    and not u.isSuspended and not u.isBanned and u.accountDeletedAt is null
    and p_lat between -90 and 90 and p_lng between -180 and 180
    and extensions.st_dwithin(s.location,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,50000)
  order by s.location <-> extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography
  limit 50;
$$;
revoke all on function public.list_car_wash_sites(double precision,double precision) from public,anon,authenticated;
grant execute on function public.list_car_wash_sites(double precision,double precision) to service_role;

create or replace function public.get_car_wash_site(p_id uuid)
returns table(id uuid,cleaner_id uuid,name text,address text,lat double precision,lng double precision,enabled boolean)
language sql stable security definer set search_path=public,extensions
as $$
  select s.id,s.cleaner_id,s.name,s.address,
    extensions.st_y(s.location::extensions.geometry),extensions.st_x(s.location::extensions.geometry),s.enabled
  from public.car_wash_sites s where s.id=p_id;
$$;
revoke all on function public.get_car_wash_site(uuid) from public,anon,authenticated;
grant execute on function public.get_car_wash_site(uuid) to service_role;

-- Only the Edge Function may change a business location after verifying the
-- authenticated cleaner and their CAR service eligibility.
create or replace function public.save_car_wash_site(
  p_cleaner_id uuid,p_name text,p_address text,p_lat double precision,p_lng double precision,p_enabled boolean
) returns uuid language plpgsql security definer set search_path=public,extensions
as $$
declare result_id uuid;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or (p_lat=0 and p_lng=0) or length(trim(coalesce(p_name,''))) not between 2 and 80
     or length(trim(coalesce(p_address,''))) not between 4 and 240 then raise exception 'Enter a valid wash name, address and map location'; end if;
  if not exists(select 1 from public.users u where u.id=p_cleaner_id and u.role='CLEANER'
    and u.verificationStatus='VERIFIED' and u.cleanerAgreementAccepted and u.cleanerOnboardingComplete
    and not u.isSuspended and not u.isBanned and u.accountDeletedAt is null and 'CAR'=any(u.serviceCategories)) then
    raise exception 'Only verified car cleaners can publish a wash location';
  end if;
  insert into public.car_wash_sites(cleaner_id,name,address,location,enabled,updated_at)
    values(p_cleaner_id,trim(p_name),trim(p_address),extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,coalesce(p_enabled,true),now())
    on conflict(cleaner_id) do update set name=excluded.name,address=excluded.address,location=excluded.location,enabled=excluded.enabled,updated_at=now()
    returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.save_car_wash_site(uuid,text,text,double precision,double precision,boolean) from public,anon,authenticated;
grant execute on function public.save_car_wash_site(uuid,text,text,double precision,double precision,boolean) to service_role;

create or replace function public.submit_bid_secure(
  p_job_id uuid,p_cleaner_id uuid,p_bid_price numeric,p_estimated_arrival integer,p_message text
) returns uuid language plpgsql security definer set search_path=public
as $$
declare job_record public.jobs; cleaner public.users; existing_bid public.bids; bid_id uuid; wash_owner uuid;
begin
  select * into job_record from public.jobs where id=p_job_id for update;
  if not found or job_record.status<>'PENDING' or job_record.bookingMode='INSTANT'
     or (job_record.biddingExpiresAt is not null and job_record.biddingExpiresAt<=now()) then raise exception 'This booking is not accepting cleaner bids'; end if;
  if job_record.category='CAR' and job_record.data->>'serviceMode'='VISIT_WASH' then
    begin wash_owner:=nullif(job_record.data->>'washSiteCleanerId','')::uuid; exception when invalid_text_representation then raise exception 'Invalid selected wash site'; end;
    -- A cleaner may hide a site from future search after this job was posted;
    -- the booking retains its accepted destination snapshot.
    if wash_owner is null or wash_owner<>p_cleaner_id or not exists(select 1 from public.car_wash_sites s where s.id=nullif(job_record.data->>'washSiteId','')::uuid and s.cleaner_id=p_cleaner_id) then
      raise exception 'This booking is reserved for the selected car wash';
    end if;
  end if;
  if coalesce((job_record.data->>'isFavoriteRebook')::boolean,false)
     and nullif(job_record.data->>'preferredCleanerId','')::uuid is distinct from p_cleaner_id then raise exception 'This rebooking request is reserved for the cleaner selected by the customer'; end if;
  select * into cleaner from public.users where id=p_cleaner_id for update;
  if not found or cleaner.role<>'CLEANER' or cleaner.verificationStatus<>'VERIFIED' or not cleaner.cleanerAgreementAccepted
     or not cleaner.cleanerOnboardingComplete or cleaner.isSuspended or cleaner.isBanned or cleaner.accountDeletedAt is not null then raise exception 'Complete cleaner verification and resolve account restrictions before bidding'; end if;
  if p_bid_price is null or p_bid_price<1 or p_bid_price>10000 or p_estimated_arrival is null or p_estimated_arrival not between 1 and 120 or length(coalesce(p_message,''))>500 then raise exception 'Enter a valid quote and arrival estimate'; end if;
  select * into existing_bid from public.bids where jobId=p_job_id and cleanerId=p_cleaner_id and status in ('PENDING','COUNTERED','ACCEPTED') for update;
  if found then
    if existing_bid.bidPrice=p_bid_price and existing_bid.estimatedArrival=p_estimated_arrival and coalesce(existing_bid.message,'')=coalesce(nullif(trim(p_message),''),'') then return existing_bid.id; end if;
    raise exception 'You already have an active quote for this booking';
  end if;
  insert into public.bids(jobId,cleanerId,cleanerName,cleanerPhoto,cleanerRating,cleanerReviewCount,cleanerJobsCompleted,bidPrice,estimatedArrival,message,status,history)
    values(p_job_id,p_cleaner_id,cleaner.displayName,cleaner.photoURL,cleaner.ratingAverage,cleaner.ratingCount,cleaner.jobsCompleted,p_bid_price,p_estimated_arrival,nullif(trim(p_message),''),'PENDING',jsonb_build_array(jsonb_build_object('by','CLEANER','price',p_bid_price,'message',nullif(trim(p_message),''),'createdAt',now()))) returning id into bid_id;
  return bid_id;
end;
$$;
revoke all on function public.submit_bid_secure(uuid,uuid,numeric,integer,text) from public,anon,authenticated;
grant execute on function public.submit_bid_secure(uuid,uuid,numeric,integer,text) to service_role;
