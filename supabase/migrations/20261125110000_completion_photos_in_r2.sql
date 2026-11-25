-- Completion photos now upload to Cloudflare R2 (signed PUT from mediaUploadUrl),
-- so they are never in storage.objects and every add failed with "Uploaded
-- completion photo was not found". The marketplace API now checks the object
-- (size and type) in R2 before calling this function.

create or replace function public.add_completion_photo(
  p_job_id uuid,
  p_cleaner_id uuid,
  p_path text
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  job_record public.jobs;
  photo_paths text[];
begin
  select * into job_record from public.jobs where id=p_job_id for update;
  if not found or job_record.cleanerId is distinct from p_cleaner_id
     or job_record.status not in ('ASSIGNED','EN_ROUTE','IN_PROGRESS') then
    raise exception 'Only the assigned cleaner can add completion photos';
  end if;
  if p_path is null or p_path not like 'detail-media/job-completion/'||p_job_id::text||'/'||p_cleaner_id::text||'/%'
     or p_path like '%..%' or p_path like '%?%' or p_path like '%#%' then
    raise exception 'Invalid photo path';
  end if;

  photo_paths:=coalesce(job_record.completionPhotos,array[]::text[]);
  if p_path=any(photo_paths) then return cardinality(photo_paths); end if;
  if cardinality(photo_paths)>=6 then raise exception 'Photo limit reached'; end if;
  update public.jobs set completionPhotos=array_append(photo_paths,p_path),updatedAt=now() where id=p_job_id;
  return cardinality(photo_paths)+1;
end;
$$;
revoke all on function public.add_completion_photo(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.add_completion_photo(uuid,uuid,text) to service_role;
