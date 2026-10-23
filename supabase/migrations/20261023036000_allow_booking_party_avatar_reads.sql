-- Booking participants need each other's public profile photo to recognize
-- the assigned counterpart. Keep every other profile-photo object private.
create policy "Booking parties read counterpart profile photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'detail-media'
  and (storage.foldername(name))[1] = 'profile-photos'
  and exists (
    select 1
    from public.jobs j
    where (j.customerId = auth.uid() and (storage.foldername(name))[2] = j.cleanerId::text)
       or (j.cleanerId = auth.uid() and (storage.foldername(name))[2] = j.customerId::text)
  )
);
