create table if not exists public.paynowPaymentAttempts (
  reference text primary key,
  paymentId text not null references public.payments(id) on delete cascade,
  idempotencyKey text,
  createdAt timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);
create index if not exists paynow_payment_attempts_payment_idx on public.paynowPaymentAttempts(paymentId,createdAt desc);
alter table public.paynowPaymentAttempts enable row level security;
revoke all on public.paynowPaymentAttempts from public,anon,authenticated;
grant select,insert,update on public.paynowPaymentAttempts to service_role;

create or replace function public.claim_paynow_booking_retry(
  p_job_id uuid,
  p_customer_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  booking public.jobs;
  payment public.payments;
  retry_reference text;
  prior_reference text;
  history jsonb;
  current_attempt jsonb;
begin
  select * into booking from public.jobs where id=p_job_id for update;
  if not found or booking.customerId<>p_customer_id or booking.paymentMethod<>'PAYNOW' then
    raise exception 'Only the customer can retry this Paynow booking';
  end if;
  select * into payment from public.payments where id=p_job_id::text||'_booking' for update;
  if not found or payment.provider<>'PAYNOW' then raise exception 'Paynow payment not found'; end if;
  current_attempt:=payment.data->'retryAttempt';
  if current_attempt->>'idempotencyKey'=p_idempotency_key then
    if payment.status='PENDING' and payment.redirectUrl is not null then
      return jsonb_build_object('status','PENDING','reference',payment.reference,'redirectUrl',payment.redirectUrl);
    end if;
    if payment.status='INITIATING' then return jsonb_build_object('status','IN_PROGRESS','reference',payment.reference); end if;
    raise exception 'This Paynow retry already failed; start a new retry';
  end if;
  if payment.status='INITIATING' then
    if coalesce((current_attempt->>'startedAt')::timestamptz,'-infinity')>now()-interval '5 minutes' then
      return jsonb_build_object('status','IN_PROGRESS','reference',payment.reference);
    end if;
    current_attempt:=coalesce(current_attempt,'{}'::jsonb)||jsonb_build_object('status','UNKNOWN','endedAt',now(),'reason','Checkout initiation timed out; provider result may require reconciliation');
    history:=coalesce(payment.data->'retryHistory','[]'::jsonb)||jsonb_build_array(current_attempt);
    update public.payments set status='FAILED',data=data||jsonb_build_object('retryHistory',history,'retryAttempt',current_attempt),updatedAt=now() where id=payment.id;
    update public.jobs set paymentStatus='FAILED',updatedAt=now() where id=p_job_id;
    payment.status:='FAILED';
  end if;
  if payment.status not in ('FAILED','CANCELLED') then raise exception 'This Paynow payment cannot be retried'; end if;

  prior_reference:=payment.reference;
  retry_reference:=p_job_id::text||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,12);
  if prior_reference is not null then
    insert into public.paynowPaymentAttempts(reference,paymentId,idempotencyKey,data)
      values(prior_reference,payment.id,null,jsonb_build_object('retrySource',true)) on conflict(reference) do nothing;
    if not exists(select 1 from public.paynowPaymentAttempts where reference=prior_reference and paymentId=payment.id) then
      raise exception 'Existing Paynow reference is already associated with another payment';
    end if;
  end if;
  insert into public.paynowPaymentAttempts(reference,paymentId,idempotencyKey,data)
    values(retry_reference,payment.id,p_idempotency_key,jsonb_build_object('attempt','BOOKING_RETRY'));
  current_attempt:=jsonb_build_object('idempotencyKey',p_idempotency_key,'reference',retry_reference,'startedAt',now(),'status','INITIATING');
  history:=coalesce(payment.data->'retryHistory','[]'::jsonb);
  update public.payments set status='INITIATING',reference=retry_reference,pollUrl=null,redirectUrl=null,
    data=data||jsonb_build_object('retryHistory',history,'retryAttempt',current_attempt),updatedAt=now()
    where id=payment.id;
  update public.jobs set paymentStatus='INITIATING',updatedAt=now() where id=p_job_id;
  return jsonb_build_object('status','STARTED','reference',retry_reference,'priorReference',prior_reference);
end;
$$;
revoke all on function public.claim_paynow_booking_retry(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_paynow_booking_retry(uuid,uuid,text) to service_role;
