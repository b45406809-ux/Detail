-- Let either participant view the other participant's profile photo for an
-- existing booking. Profile photos remain private to authenticated viewers.
create policy "Booking participants read party profile photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'detail-media'
  and (storage.foldername(name))[1] = 'profile-photos'
  and exists (
    select 1 from public.jobs j
    where (j.customerId = (storage.foldername(name))[2]::uuid or j.cleanerId = (storage.foldername(name))[2]::uuid)
      and (j.customerId = auth.uid() or j.cleanerId = auth.uid())
  )
);
