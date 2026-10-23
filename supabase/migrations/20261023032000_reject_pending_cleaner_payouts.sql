create or replace function public.reject_pending_cleaner_payout(
  p_payout_id uuid,p_actor_id uuid,p_reason text,p_idempotency_key text
) returns public.payoutRequests language plpgsql security definer set search_path=public as $$
declare payout public.payoutRequests; hold public.walletTransactions;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,160}$' or length(trim(coalesce(p_reason,'')))<4 then
    raise exception 'A valid idempotency key and rejection reason are required';
  end if;
  select * into payout from public.payoutRequests where id=p_payout_id for update;
  if not found then raise exception 'Payout request not found'; end if;
  if payout.status='REJECTED' and payout.data->>'rejectionKey'=p_idempotency_key then return payout; end if;
  if payout.status<>'PENDING' then raise exception 'Only a pending payout can be rejected directly'; end if;
  select * into hold from public.walletTransactions where idempotencyKey='payout_hold_'||p_payout_id for update;
  if not found or hold.userId<>payout.cleanerId or hold.type<>'DEBIT' or hold.amount<>payout.amount or hold.status<>'COMPLETED' then raise exception 'Reserved payout funds could not be verified'; end if;
  perform public.record_wallet_transaction(payout.cleanerId,'CREDIT',payout.amount,'EARNINGS','Pending payout rejected — reserved funds returned','payout_reversal_'||p_payout_id,null,null);
  update public.walletTransactions set status='REVERSED' where idempotencyKey='payout_hold_'||p_payout_id;
  update public.payoutRequests set status='REJECTED',settledBy=p_actor_id,settledAt=now(),
    data=data||jsonb_build_object('rejectionReason',left(trim(p_reason),500),'rejectionKey',p_idempotency_key)
    where id=p_payout_id returning * into payout;
  insert into public.adminAuditEvents(id,action,actorId,targetId,reason,amount,createdAt)
    values('payout_reject_'||p_idempotency_key,'cleaner_payout_rejected',p_actor_id,p_payout_id::text,left(trim(p_reason),500),payout.amount,now())
    on conflict(id) do nothing;
  return payout;
end $$;
revoke all on function public.reject_pending_cleaner_payout(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reject_pending_cleaner_payout(uuid,uuid,text,text) to service_role;
