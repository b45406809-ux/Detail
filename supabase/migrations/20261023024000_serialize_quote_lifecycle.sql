with ranked as (
  select id,row_number() over(partition by jobId,cleanerId order by (status='ACCEPTED') desc,createdAt desc,id desc) as position
  from public.bids where status in ('PENDING','COUNTERED','ACCEPTED')
)
update public.bids set status='REJECTED',updatedAt=now()
where id in (select id from ranked where position>1);

create unique index if not exists bids_one_active_cleaner_quote_per_job
  on public.bids(jobId,cleanerId) where status in ('PENDING','COUNTERED','ACCEPTED');

create or replace function public.submit_bid_secure(
  p_job_id uuid,
  p_cleaner_id uuid,
  p_bid_price numeric,
  p_estimated_arrival integer,
  p_message text
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

create or replace function public.reject_bid_secure(p_job_id uuid,p_bid_id uuid,p_customer_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare job_record public.jobs; bid_record public.bids;
begin
  select * into job_record from public.jobs where id=p_job_id for update;
  if not found or job_record.customerId<>p_customer_id then raise exception 'Only the customer can reject this quote'; end if;
  select * into bid_record from public.bids where id=p_bid_id and jobId=p_job_id for update;
  if not found then raise exception 'Quote not found'; end if;
  if bid_record.status='REJECTED' then return true; end if;
  if bid_record.status not in ('PENDING','COUNTERED') or job_record.status not in ('PENDING','CONFIRMED') or job_record.cleanerId is not null then
    raise exception 'This quote can no longer be rejected';
  end if;
  update public.bids set status='REJECTED',updatedAt=now() where id=p_bid_id;
  return true;
end;
$$;
revoke all on function public.reject_bid_secure(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reject_bid_secure(uuid,uuid,uuid) to service_role;
