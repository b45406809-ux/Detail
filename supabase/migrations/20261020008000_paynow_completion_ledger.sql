create or replace function public.release_paynow_earnings(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare j public.jobs; p public.payments; gross numeric(12,2); commission numeric(12,2); net numeric(12,2);
begin
  select * into j from public.jobs where id=p_job_id for update;
  select * into p from public.payments where jobId=p_job_id and provider='PAYNOW' for update;
  if not found or p.status <> 'PAID' or j.status <> 'COMPLETED' or (p.data ? 'releasedAt') then return false; end if;
  gross := round(p.amount,2); commission := round(gross*0.1,2); net := round(gross-commission,2);
  perform public.record_wallet_transaction(j.cleanerId,'CREDIT',net,'EARNINGS','Paynow earnings from booking '||p_job_id,'paynow_earning_'||p_job_id,p_job_id,p.id);
  update public.users set jobsCompleted=jobsCompleted+1 where id=j.cleanerId;
  insert into public.platformTransactions(id,jobId,paymentId,type,amount,status,data)
    values('paynow_commission_'||p_job_id,p_job_id,p.id,'COMMISSION',commission,'COMPLETED',jsonb_build_object('rate',0.1,'source','PAYNOW')) on conflict(id) do nothing;
  update public.payments set data=data||jsonb_build_object('releasedAt',now(),'commission',commission,'cleanerNet',net) where id=p.id;
  update public.jobs set earnings=jsonb_build_object('gross',gross,'commission',commission,'net',net,'finalized',true),updatedAt=now() where id=p_job_id;
  return true;
end;
$$;
revoke all on function public.release_paynow_earnings(uuid) from public, anon, authenticated;
grant execute on function public.release_paynow_earnings(uuid) to service_role;
