create table public.scheduledJobNotices(
  jobId uuid not null references public.jobs(id) on delete cascade,
  cleanerId uuid not null references public.users(id) on delete cascade,
  notifiedAt timestamptz not null default now(),
  primary key(jobId,cleanerId)
);
alter table public.scheduledJobNotices enable row level security;
revoke all privileges on table public.scheduledJobNotices from public,anon,authenticated;

create or replace function public.notify_scheduled_job_cleaners(p_job_id uuid,p_customer_id uuid,p_limit integer default 20)
returns integer language plpgsql security definer set search_path=public,extensions
as $$
declare
  job_record public.jobs;
  point extensions.geography(Point,4326);
  starts_at timestamptz;
  duration integer;
  cleaner_id uuid;
  notice_id uuid;
  notified integer:=0;
begin
  select * into job_record from public.jobs where id=p_job_id and customerId=p_customer_id for update;
  if not found or job_record.status<>'PENDING' or job_record.bookingMode<>'SCHEDULED' then raise exception 'Scheduled booking is unavailable'; end if;
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
    where u.role='CLEANER' and u.verificationStatus='VERIFIED' and u.cleanerAgreementAccepted
      and not u.isSuspended and not u.isBanned and u.accountDeletedAt is null and u.status='AVAILABLE'
      and u.locationPoint is not null and u.locationUpdatedAt>now()-interval '5 minutes'
      and extensions.st_dwithin(u.locationPoint,point,least(100000,coalesce(u.serviceRadiusKm,25)*1000))
      and (cardinality(u.serviceCategories)=0 or job_record.category=any(u.serviceCategories))
      and not exists(select 1 from public.jobs a where a.cleanerId=u.id and a.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS'))
      and not exists(select 1 from public.cleanerAvailabilityBlocks b where b.cleanerId=u.id
        and b.startsAt<starts_at+make_interval(mins=>duration+60) and b.endsAt>starts_at)
    order by u.locationPoint<->point limit greatest(1,least(coalesce(p_limit,20),50))
  loop
    notice_id:=null;
    insert into public.scheduledJobNotices(jobId,cleanerId) values(p_job_id,cleaner_id)
      on conflict(jobId,cleanerId) do nothing returning cleanerId into cleaner_id;
    if found then
      perform public.create_notification_outbox(cleaner_id,'Scheduled cleaning nearby',
        'A customer is collecting quotes for a scheduled cleaning near you. Review the job scope and send a quote if it fits.',
        'NEW_SCHEDULED_JOB',p_job_id,jsonb_build_object('bookingMode','SCHEDULED'));
      notified:=notified+1;
    end if;
  end loop;
  return notified;
end;
$$;
revoke all on function public.notify_scheduled_job_cleaners(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.notify_scheduled_job_cleaners(uuid,uuid,integer) to service_role;
