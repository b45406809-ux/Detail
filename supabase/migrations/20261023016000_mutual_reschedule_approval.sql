create or replace function public.propose_booking_reschedule(
  p_job_id uuid,
  p_actor_id uuid,
  p_scheduled_at timestamptz,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  booking public.jobs;
  recipient_id uuid;
  proposal jsonb;
  proposal_id uuid:=gen_random_uuid();
begin
  select * into booking from public.jobs where id=p_job_id for update;
  if not found or (p_actor_id<>booking.customerId and p_actor_id is distinct from booking.cleanerId) then
    raise exception 'Only a booking participant can propose a new time';
  end if;
  if booking.status not in ('PENDING','CONFIRMED','ASSIGNED')
     or p_scheduled_at<now()+interval '2 hours'
     or p_scheduled_at>now()+interval '180 days'
     or (booking.scheduledDateTime is not null and booking.scheduledDateTime<now()+interval '2 hours') then
    raise exception 'Booking cannot be rescheduled at this time';
  end if;
  if exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey=p_idempotency_key) then
    return coalesce(booking.data->'rescheduleProposal','{}'::jsonb);
  end if;
  if coalesce(booking.data->'rescheduleProposal'->>'status','')='PENDING'
     and coalesce((booking.data->'rescheduleProposal'->>'expiresAt')::timestamptz,'-infinity')>now() then
    raise exception 'A reschedule proposal is already awaiting a response';
  end if;
  recipient_id:=case when booking.customerId=p_actor_id then booking.cleanerId else booking.customerId end;
  if recipient_id is null then raise exception 'This booking has no other participant'; end if;
  proposal:=jsonb_build_object(
    'id',proposal_id,'proposedBy',p_actor_id,'recipientId',recipient_id,
    'proposedAt',now(),'expiresAt',now()+interval '24 hours',
    'previousDateTime',booking.scheduledDateTime,'proposedDateTime',p_scheduled_at,
    'status','PENDING','idempotencyKey',p_idempotency_key
  );
  update public.jobs set data=data||jsonb_build_object('rescheduleProposal',proposal),updatedAt=now() where id=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,reason,data)
    values(p_job_id,p_actor_id,case when p_actor_id=booking.customerId then 'CUSTOMER' else 'CLEANER' end,
      'RESCHEDULE_REQUESTED',booking.status::text,booking.status::text,p_idempotency_key,'Requested mutual approval for a new booking time.',proposal);
  perform public.create_notification_outbox(recipient_id,'Booking time change requested',
    'The other participant proposed a new time. Review it in your booking before it takes effect.',
    'RESCHEDULE_REQUEST',p_job_id,jsonb_build_object('proposalId',proposal_id));
  return proposal;
end;
$$;
revoke all on function public.propose_booking_reschedule(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.propose_booking_reschedule(uuid,uuid,timestamptz,text) to service_role;

create or replace function public.respond_booking_reschedule(
  p_job_id uuid,
  p_actor_id uuid,
  p_accept boolean,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  booking public.jobs;
  proposal jsonb;
  proposed_at timestamptz;
  proposer_id uuid;
  new_status text;
begin
  select * into booking from public.jobs where id=p_job_id for update;
  if not found or (p_actor_id<>booking.customerId and p_actor_id is distinct from booking.cleanerId) then
    raise exception 'Only a booking participant can respond';
  end if;
  if exists(select 1 from public.jobEvents where jobId=p_job_id and idempotencyKey='reschedule_response_'||p_idempotency_key) then
    return jsonb_build_object('status','RECORDED','scheduledDateTime',booking.scheduledDateTime);
  end if;
  proposal:=booking.data->'rescheduleProposal';
  if proposal is null or proposal->>'status'<>'PENDING' or (proposal->>'recipientId')::uuid<>p_actor_id then
    raise exception 'There is no reschedule proposal awaiting your response';
  end if;
  if (proposal->>'expiresAt')::timestamptz<=now() then raise exception 'This reschedule proposal has expired'; end if;
  proposer_id:=(proposal->>'proposedBy')::uuid;
  proposed_at:=(proposal->>'proposedDateTime')::timestamptz;
  if p_accept then
    if booking.status not in ('PENDING','CONFIRMED','ASSIGNED') or proposed_at<now()+interval '2 hours' then
      raise exception 'This booking can no longer be moved to the proposed time';
    end if;
    update public.jobs set scheduledDateTime=proposed_at,updatedAt=now() where id=p_job_id;
    new_status:='ACCEPTED';
  else
    new_status:='DECLINED';
  end if;
  proposal:=proposal||jsonb_build_object('status',new_status,'respondedAt',now(),'respondedBy',p_actor_id);
  update public.jobs set data=data||jsonb_build_object('rescheduleProposal',proposal),updatedAt=now() where id=p_job_id;
  insert into public.jobEvents(jobId,actorId,actorRole,type,previousState,newState,idempotencyKey,reason,data)
    values(p_job_id,p_actor_id,case when p_actor_id=booking.customerId then 'CUSTOMER' else 'CLEANER' end,
      'RESCHEDULE_'||new_status,booking.status::text,booking.status::text,'reschedule_response_'||p_idempotency_key,
      case when p_accept then 'Accepted the proposed booking time' else 'Declined the proposed booking time' end,proposal);
  perform public.create_notification_outbox(proposer_id,
    case when p_accept then 'Booking time change accepted' else 'Booking time change declined' end,
    case when p_accept then 'The booking time is now updated.' else 'The booking will keep its existing time.' end,
    case when p_accept then 'RESCHEDULED' else 'RESCHEDULE_DECLINED' end,p_job_id,'{}'::jsonb);
  return jsonb_build_object('status',new_status,'scheduledDateTime',case when p_accept then proposed_at else booking.scheduledDateTime end);
end;
$$;
revoke all on function public.respond_booking_reschedule(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.respond_booking_reschedule(uuid,uuid,boolean,text) to service_role;
