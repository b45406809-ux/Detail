alter table public.payoutRequests add column if not exists operationKey text;
alter table public.payoutRequests add column if not exists requestHash text;
create unique index if not exists payout_requests_cleaner_operation_key
  on public.payoutRequests(cleanerId,operationKey) where operationKey is not null;

create or replace function public.request_cleaner_payout_idempotent(
  p_cleaner_id uuid,
  p_amount numeric,
  p_method text,
  p_account_name text,
  p_ciphertext text,
  p_last4 text,
  p_operation_key text,
  p_request_hash text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  cleaner public.users;
  existing public.payoutRequests;
  payout_id uuid:=gen_random_uuid();
  available numeric;
begin
  select * into cleaner from public.users where id=p_cleaner_id for update;
  if not found or cleaner.role<>'CLEANER' or cleaner.isSuspended or cleaner.isBanned or cleaner.accountDeletedAt is not null then
    raise exception 'Only an active cleaner can request a payout';
  end if;
  if p_operation_key is null or p_request_hash is null
     or p_operation_key !~ '^[A-Za-z0-9_-]{8,160}$' or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid payout operation key';
  end if;
  select * into existing from public.payoutRequests where cleanerId=p_cleaner_id and operationKey=p_operation_key;
  if found then
    if existing.requestHash is distinct from p_request_hash then raise exception 'Payout operation key was already used for different details'; end if;
    return existing.id;
  end if;
  available:=greatest(0,cleaner.earningsBalance-cleaner.commissionBalance);
  if p_amount<5 or p_amount>available or p_method not in ('ECOCASH','INNBUCKS','BANK')
     or trim(coalesce(p_account_name,''))='' or length(coalesce(p_ciphertext,''))<32 or p_last4 !~ '^[0-9A-Za-z]{4}$' then
    raise exception 'Invalid payout details or amount';
  end if;
  if available<p_amount then raise exception 'Insufficient cleared earnings'; end if;
  insert into public.payoutRequests(id,cleanerId,amount,method,accountName,accountNumber,accountNumberCiphertext,accountNumberLast4,operationKey,requestHash)
    values(payout_id,p_cleaner_id,p_amount,p_method,left(trim(p_account_name),100),'••••'||p_last4,p_ciphertext,p_last4,p_operation_key,p_request_hash);
  perform public.record_wallet_transaction(p_cleaner_id,'DEBIT',p_amount,'EARNINGS','Payout requested — funds reserved','payout_hold_'||payout_id,null,null);
  return payout_id;
end;
$$;
revoke all on function public.request_cleaner_payout_idempotent(uuid,numeric,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.request_cleaner_payout_idempotent(uuid,numeric,text,text,text,text,text,text) to service_role;
