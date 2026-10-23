create or replace function public.request_cleaner_payout_secure(
  p_cleaner_id uuid,
  p_amount numeric,
  p_method text,
  p_account_name text,
  p_ciphertext text,
  p_last4 text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  cleaner public.users;
  payout_id uuid:=gen_random_uuid();
  available numeric;
begin
  select * into cleaner from public.users where id=p_cleaner_id for update;
  if not found or cleaner.role<>'CLEANER' then raise exception 'Only cleaners can request payouts'; end if;
  available:=greatest(0,cleaner.earningsBalance);
  if p_amount is null or p_amount<5 or p_amount>available or p_method is null or p_method not in ('ECOCASH','INNBUCKS','BANK')
     or p_account_name is null or trim(p_account_name)='' or p_ciphertext is null or length(p_ciphertext)<32
     or p_last4 is null or p_last4 !~ '^[0-9A-Za-z]{4}$' then
    raise exception 'Invalid payout details or amount';
  end if;
  insert into public.payoutRequests(id,cleanerId,amount,method,accountName,accountNumber,accountNumberCiphertext,accountNumberLast4)
    values(payout_id,p_cleaner_id,p_amount,p_method,left(trim(p_account_name),100),'••••'||p_last4,p_ciphertext,p_last4);
  perform public.record_wallet_transaction(p_cleaner_id,'DEBIT',p_amount,'EARNINGS','Payout requested — funds reserved','payout_hold_'||payout_id,null,null);
  return payout_id;
end;
$$;
revoke all on function public.request_cleaner_payout_secure(uuid,numeric,text,text,text,text) from public,anon,authenticated;
grant execute on function public.request_cleaner_payout_secure(uuid,numeric,text,text,text,text) to service_role;
