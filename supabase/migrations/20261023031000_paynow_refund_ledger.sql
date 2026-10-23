create table public.paynowrefundtransactions (
  id text primary key,
  paymentid text not null references public.payments(id),
  amount numeric(12,2) not null check (amount > 0),
  status text not null check (status in ('REQUESTED','SUBMITTED','CONFIRMED','FAILED','RECONCILIATION_REQUIRED')),
  reason text not null default '',
  providerreference text unique,
  requestedby uuid references public.users(id),
  updatedby uuid references public.users(id),
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);
create index paynowrefundtransactions_payment_status_idx on public.paynowrefundtransactions(paymentid,status,createdat);
alter table public.paynowrefundtransactions enable row level security;
revoke all on public.paynowrefundtransactions from anon,authenticated;
grant all on public.paynowrefundtransactions to service_role;

create or replace function public.request_paynow_refund(
  p_payment_id text,p_actor_id uuid,p_amount numeric,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare payment public.payments; refund public.paynowrefundtransactions; requested_amount numeric(12,2):=round(p_amount,2); confirmed_total numeric(12,2);
begin
  select * into payment from public.payments where id=p_payment_id for update;
  if not found or payment.provider<>'PAYNOW' then raise exception 'Paynow payment not found'; end if;
  select * into refund from public.paynowrefundtransactions where id='refund_'||p_idempotency_key;
  if found then
    if refund.paymentid<>p_payment_id then raise exception 'Idempotency key belongs to another payment'; end if;
    return jsonb_build_object('id',refund.id,'status',refund.status,'amount',refund.amount);
  end if;
  if payment.status not in ('ESCROWED','DELIVERED','PAID','DISPUTED') then raise exception 'Only captured Paynow payments can be refunded'; end if;
  if requested_amount is null or requested_amount<=0 then raise exception 'Refund amount must be positive'; end if;
  if exists(select 1 from public.paynowrefundtransactions where paymentid=p_payment_id and status in ('REQUESTED','SUBMITTED','RECONCILIATION_REQUIRED')) then raise exception 'A refund request is already awaiting provider reconciliation'; end if;
  select coalesce(sum(amount),0) into confirmed_total from public.paynowrefundtransactions where paymentid=p_payment_id and status='CONFIRMED';
  if confirmed_total+requested_amount>payment.amount then raise exception 'Cumulative refunds cannot exceed the captured payment'; end if;
  insert into public.paynowrefundtransactions(id,paymentid,amount,status,reason,requestedby)
    values('refund_'||p_idempotency_key,p_payment_id,requested_amount,'REQUESTED',left(trim(p_reason),500),p_actor_id) returning * into refund;
  update public.payments set data=data||jsonb_build_object('refundRequest',jsonb_build_object('amount',requested_amount,'reason',left(trim(p_reason),500),'status','REQUESTED','requestedBy',p_actor_id,'requestedAt',now()),'refundSummary',jsonb_build_object('confirmedAmount',confirmed_total,'latestStatus','REQUESTED','updatedAt',now())),updatedat=now() where id=p_payment_id;
  return jsonb_build_object('id',refund.id,'status',refund.status,'amount',refund.amount);
end $$;
revoke all on function public.request_paynow_refund(text,uuid,numeric,text,text) from public,anon,authenticated;
grant execute on function public.request_paynow_refund(text,uuid,numeric,text,text) to service_role;

create or replace function public.record_paynow_refund_update(
  p_payment_id text,p_actor_id uuid,p_status text,p_amount numeric,
  p_provider_reference text,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare payment public.payments; refund public.paynowrefundtransactions; next_status text:=upper(p_status);
  requested_amount numeric(12,2); confirmed_total numeric(12,2); updated_amount numeric(12,2); provider_ref text:=nullif(trim(p_provider_reference),'');
begin
  if next_status not in ('SUBMITTED','CONFIRMED','FAILED') then raise exception 'Unsupported refund update'; end if;
  select * into payment from public.payments where id=p_payment_id for update;
  if not found or payment.provider<>'PAYNOW' then raise exception 'Paynow payment not found'; end if;
  select * into refund from public.paynowrefundtransactions where paymentid=p_payment_id and data->>'updateId'=p_idempotency_key;
  if found then return jsonb_build_object('id',refund.id,'status',refund.status,'amount',refund.amount,'providerReference',refund.providerreference); end if;
  select * into refund from public.paynowrefundtransactions where paymentid=p_payment_id and status in ('REQUESTED','SUBMITTED','RECONCILIATION_REQUIRED') order by createdat limit 1 for update;
  if not found then raise exception 'No refund request is awaiting an update'; end if;
  if next_status='SUBMITTED' and refund.status<>'REQUESTED' then raise exception 'Only a requested refund can be submitted'; end if;
  if next_status='CONFIRMED' then
    updated_amount:=round(p_amount,2);
    if updated_amount is null or updated_amount<=0 or provider_ref is null then raise exception 'A positive confirmed amount and provider reference are required'; end if;
    select coalesce(sum(amount),0) into confirmed_total from public.paynowrefundtransactions where paymentid=p_payment_id and status='CONFIRMED' and id<>refund.id;
    if confirmed_total+updated_amount>payment.amount then raise exception 'Cumulative refunds cannot exceed the captured payment'; end if;
    if updated_amount>refund.amount then raise exception 'Confirmed amount cannot exceed the requested amount'; end if;
  else
    updated_amount:=refund.amount;
  end if;
  update public.paynowrefundtransactions set status=next_status,amount=updated_amount,
    providerreference=case when next_status='CONFIRMED' then provider_ref else providerreference end,
    reason=case when nullif(trim(p_reason),'') is not null then left(trim(p_reason),500) else reason end,
    updatedby=p_actor_id,updatedat=now(),data=data||jsonb_build_object('updateId',p_idempotency_key)
    where id=refund.id returning * into refund;
  update public.payments set data=data||jsonb_build_object('refundSummary',jsonb_build_object(
    'confirmedAmount',(select coalesce(sum(amount),0) from public.paynowrefundtransactions where paymentid=p_payment_id and status='CONFIRMED'),
    'latestStatus',refund.status,'updatedAt',now()),'refundRequest',coalesce(data->'refundRequest','{}'::jsonb)||jsonb_build_object(
    'amount',refund.amount,'status',refund.status,'providerReference',refund.providerreference,'updatedAt',now())),updatedat=now() where id=p_payment_id;
  return jsonb_build_object('id',refund.id,'status',refund.status,'amount',refund.amount,'providerReference',refund.providerreference);
end $$;
revoke all on function public.record_paynow_refund_update(text,uuid,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.record_paynow_refund_update(text,uuid,text,numeric,text,text,text) to service_role;
