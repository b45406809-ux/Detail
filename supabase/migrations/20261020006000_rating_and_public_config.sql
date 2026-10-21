drop policy "Beta configuration visible to signed-in clients" on public.configuration;
create policy "Public beta configuration" on public.configuration for select to anon, authenticated
using (key='beta' or (auth.uid() is not null and public.is_admin()));
grant select on public.configuration to anon;

drop policy "Users read own and verified cleaner profiles" on public.users;
create policy "Users read own profile or admin" on public.users for select to authenticated
using (id=auth.uid() or public.is_admin());

create or replace function public.submit_booking_rating(p_actor_id uuid,p_job_id uuid,p_rating smallint,p_comment text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare j public.jobs; review_count integer; average_rating numeric(4,2);
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.customerId<>p_actor_id or j.status<>'COMPLETED' or j.cleanerId is null then
    raise exception 'Only the customer can rate a completed booking';
  end if;
  if p_rating<1 or p_rating>5 then raise exception 'Rating must be between 1 and 5'; end if;
  insert into public.reviews(jobId,customerId,cleanerId,rating,comment) values(p_job_id,p_actor_id,j.cleanerId,p_rating,left(p_comment,1000));
  select count(*),round(avg(rating),2) into review_count,average_rating from public.reviews where cleanerId=j.cleanerId;
  update public.users set ratingCount=review_count,ratingAverage=average_rating where id=j.cleanerId;
  update public.jobs set rating=p_rating,ratedAt=now(),updatedAt=now() where id=p_job_id;
  return jsonb_build_object('success',true,'ratingCount',review_count,'ratingAverage',average_rating);
end;
$$;
revoke all on function public.submit_booking_rating(uuid,uuid,smallint,text) from public, anon, authenticated;
grant execute on function public.submit_booking_rating(uuid,uuid,smallint,text) to service_role;
