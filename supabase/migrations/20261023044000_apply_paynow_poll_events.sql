alter table public.paynowProviderEvents add column appliedStatus text;
revoke update on public.paynowProviderEvents from service_role;
grant update (processingStatus, processedAt, attemptCount, lastError, appliedStatus)
  on public.paynowProviderEvents to service_role;

create or replace function public.apply_paynow_provider_poll(
  p_event_id text,p_reference text,p_status text,p_amount numeric
) returns jsonb language plpgsql security definer set search_path=public as $$
declare event public.paynowProviderEvents; canonical_reference text:=p_reference; result jsonb;
begin
  if p_event_id !~ '^[0-9a-f]{64}$' or nullif(trim(p_reference),'') is null
     or p_status is null or p_amount is null or p_amount<=0 then
    raise exception 'Invalid Paynow poll event';
  end if;

  insert into public.paynowProviderEvents(eventId,reference,providerStatus,amount,data)
    values(p_event_id,p_reference,p_status,p_amount,jsonb_build_object('source','authoritative_poll'))
    on conflict(eventId) do nothing;
  select * into event from public.paynowProviderEvents where eventId=p_event_id for update;
  if event.reference<>p_reference or event.providerStatus<>p_status or event.amount<>p_amount then
    raise exception 'Paynow poll event ID collision';
  end if;
  if event.processingStatus='APPLIED' then
    return jsonb_build_object('status',event.appliedStatus,'replayed',true);
  end if;
  update public.paynowProviderEvents set processingStatus='RECEIVED',attemptCount=attemptCount+1,lastError=null
    where eventId=p_event_id;

  begin
    select payment.reference into canonical_reference
      from public.paynowPaymentAttempts attempt
      join public.payments payment on payment.id=attempt.paymentId
      where attempt.reference=p_reference;
    canonical_reference:=coalesce(canonical_reference,p_reference);
    result:=public.apply_paynow_status(canonical_reference,p_status,p_amount);
    update public.paynowProviderEvents set processingStatus='APPLIED',processedAt=now(),
      appliedStatus=result->>'status',lastError=null where eventId=p_event_id;
    return result||jsonb_build_object('replayed',false);
  exception when others then
    update public.paynowProviderEvents set processingStatus='FAILED',lastError=left(sqlerrm,1000)
      where eventId=p_event_id;
    return jsonb_build_object('status','FAILED','replayed',false);
  end;
end;
$$;
revoke all on function public.apply_paynow_provider_poll(text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.apply_paynow_provider_poll(text,text,text,numeric) to service_role;
