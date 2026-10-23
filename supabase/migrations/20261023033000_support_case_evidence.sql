drop policy if exists "Participants upload support evidence" on storage.objects;
create policy "Participants upload support evidence" on storage.objects for insert to authenticated
with check (
  bucket_id='detail-media'
  and (storage.foldername(name))[1]='support-evidence'
  and public.is_job_participant(((storage.foldername(name))[2])::uuid)
  and (storage.foldername(name))[3]=auth.uid()::text
);

drop policy if exists "Users remove own support evidence" on storage.objects;
create policy "Users remove own support evidence" on storage.objects for delete to authenticated
using (
  bucket_id='detail-media'
  and (storage.foldername(name))[1]='support-evidence'
  and public.is_job_participant(((storage.foldername(name))[2])::uuid)
  and (storage.foldername(name))[3]=auth.uid()::text
);
