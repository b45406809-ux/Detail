insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('detail-media', 'detail-media', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Users upload own media" on storage.objects for insert to authenticated
with check (bucket_id = 'detail-media' and (storage.foldername(name))[2] = auth.uid()::text and (storage.foldername(name))[1] in ('job-photos','profile-photos','verification'));
create policy "Users read own media" on storage.objects for select to authenticated
using (bucket_id = 'detail-media' and ((storage.foldername(name))[2] = auth.uid()::text or public.is_admin()));
create policy "Job participants read job media" on storage.objects for select to authenticated
using (bucket_id = 'detail-media' and (storage.foldername(name))[1] in ('job-completion','chat-photos') and public.is_job_participant(((storage.foldername(name))[2])::uuid));
create policy "Job participants upload job media" on storage.objects for insert to authenticated
with check (bucket_id = 'detail-media' and (storage.foldername(name))[1] in ('job-completion','chat-photos') and public.is_job_participant(((storage.foldername(name))[2])::uuid));
create policy "Users update and remove own media" on storage.objects for update to authenticated
using (bucket_id = 'detail-media' and (storage.foldername(name))[2] = auth.uid()::text)
with check (bucket_id = 'detail-media' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "Users remove own media" on storage.objects for delete to authenticated
using (bucket_id = 'detail-media' and (storage.foldername(name))[2] = auth.uid()::text);

create or replace function public.record_wallet_transaction(
  p_user_id uuid,
  p_type text,
  p_amount numeric,
  p_balance_type text,
  p_description text,
  p_idempotency_key text,
  p_job_id uuid default null,
  p_payment_id text default null
) returns public.walletTransactions
language plpgsql security definer set search_path = public
as $$
declare result public.walletTransactions;
begin
  if p_amount <= 0 or p_type not in ('CREDIT','DEBIT') or p_balance_type not in ('GENERAL','EARNINGS','COMMISSION') then
    raise exception 'Invalid wallet transaction';
  end if;
  select * into result from public.walletTransactions where idempotencyKey = p_idempotency_key;
  if found then return result; end if;
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Wallet owner not found'; end if;
  if p_balance_type = 'GENERAL' then
    update public.users set balance = balance + case when p_type = 'CREDIT' then p_amount else -p_amount end where id = p_user_id;
  elsif p_balance_type = 'EARNINGS' then
    update public.users set earningsBalance = earningsBalance + case when p_type = 'CREDIT' then p_amount else -p_amount end,
      balance = balance + case when p_type = 'CREDIT' then p_amount else -p_amount end where id = p_user_id;
  else
    update public.users set commissionBalance = commissionBalance + case when p_type = 'CREDIT' then p_amount else -p_amount end,
      balance = balance + case when p_type = 'CREDIT' then p_amount else -p_amount end where id = p_user_id;
  end if;
  insert into public.walletTransactions(userId, jobId, paymentId, type, amount, balanceType, description, idempotencyKey)
    values (p_user_id, p_job_id, p_payment_id, p_type, p_amount, p_balance_type, p_description, p_idempotency_key)
    returning * into result;
  return result;
end;
$$;
revoke all on function public.record_wallet_transaction(uuid,text,numeric,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.record_wallet_transaction(uuid,text,numeric,text,text,text,uuid,text) to service_role;

create or replace function public.transition_booking(
  p_job_id uuid,
  p_actor_id uuid,
  p_new_status public.booking_status,
  p_idempotency_key text,
  p_reason text default null
) returns public.jobs
language plpgsql security definer set search_path = public
as $$
declare job public.jobs; old_status public.booking_status; allowed boolean := false;
begin
  if exists (select 1 from public.jobEvents where jobId = p_job_id and idempotencyKey = p_idempotency_key) then
    select * into job from public.jobs where id = p_job_id;
    return job;
  end if;
  select * into job from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Booking not found'; end if;
  old_status := job.status;
  allowed := case old_status
    when 'PENDING' then p_new_status in ('CONFIRMED','CANCELLED')
    when 'CONFIRMED' then p_new_status in ('ASSIGNED','CANCELLED')
    when 'ASSIGNED' then p_new_status in ('EN_ROUTE','CANCELLED')
    when 'EN_ROUTE' then p_new_status in ('IN_PROGRESS','CANCELLED')
    when 'IN_PROGRESS' then p_new_status in ('COMPLETED','CANCELLED')
    else false end;
  if not allowed then raise exception 'Invalid booking transition'; end if;
  update public.jobs set status = p_new_status, updatedAt = now() where id = p_job_id returning * into job;
  if p_new_status in ('ASSIGNED','CANCELLED','COMPLETED') then delete from public.openJobs where jobId = p_job_id; end if;
  insert into public.jobEvents(jobId, actorId, type, previousState, newState, idempotencyKey, reason)
    values (p_job_id,p_actor_id,'STATUS_CHANGE',old_status::text,p_new_status::text,p_idempotency_key,p_reason);
  return job;
end;
$$;
revoke all on function public.transition_booking(uuid,uuid,public.booking_status,text,text) from public, anon, authenticated;
grant execute on function public.transition_booking(uuid,uuid,public.booking_status,text,text) to service_role;
