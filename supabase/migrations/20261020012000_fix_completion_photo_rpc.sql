create or replace function public.add_completion_photo(
  p_job_id uuid,
  p_cleaner_id uuid,
  p_path text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  job_record public.jobs;
  photo_paths text[];
begin
  select j.* into job_record
  from public.jobs as j
  where j.id = p_job_id
  for update;

  if not found then
    raise exception 'Only the assigned cleaner can add completion photos';
  end if;

  if job_record.cleanerId is distinct from p_cleaner_id then
    raise exception 'Only the assigned cleaner can add completion photos';
  end if;

  if job_record.status not in ('ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS') then
    raise exception 'Only the assigned cleaner can add completion photos';
  end if;

  photo_paths := coalesce(job_record.completionPhotos, array[]::text[]);
  if cardinality(photo_paths) >= 6 then
    raise exception 'Photo limit reached';
  end if;

  if p_path is null
    or p_path not like 'detail-media/job-completion/' || p_job_id::text || '/' || p_cleaner_id::text || '/%' then
    raise exception 'Invalid photo path';
  end if;

  if not (p_path = any(photo_paths)) then
    photo_paths := array_append(photo_paths, p_path);
  end if;

  update public.jobs as target
  set completionPhotos = photo_paths,
      updatedAt = now()
  where target.id = p_job_id;

  return cardinality(photo_paths);
end;
$$;
