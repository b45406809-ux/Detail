alter table public.organizationInvites add column if not exists cleanerName text;
alter table public.organizationMembers add column if not exists cleanerName text;
alter table public.organizationMembers add column if not exists email text;
alter table public.organizationMembers add column if not exists verificationStatus text;

create or replace function public.is_verified_cleaner(profile_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.users where id=profile_id and role='CLEANER' and verificationStatus='VERIFIED' and not isSuspended and not isBanned) $$;
revoke all on function public.is_verified_cleaner(uuid) from public, anon;
grant execute on function public.is_verified_cleaner(uuid) to authenticated, service_role;

-- Chat list state is non-financial booking metadata and is currently updated
-- by booking participants after sending/reading a message.
grant update (data) on public.jobs to authenticated;

-- Private profile photos remain in a private bucket. Signed URLs are issued
-- only to authenticated users after the target has completed cleaner KYC.
create policy "Verified cleaner profile photos visible to authenticated users"
on storage.objects for select to authenticated
using (
  bucket_id='detail-media'
  and (storage.foldername(name))[1]='profile-photos'
  and public.is_verified_cleaner(((storage.foldername(name))[2])::uuid)
);

-- Assigned cleaner and customer can see booking photos stored under the
-- customer's UID, with the booking id available from the object's metadata.
create policy "Booking participants read customer job photos"
on storage.objects for select to authenticated
using (
  bucket_id='detail-media'
  and (storage.foldername(name))[1]='job-photos'
  and exists (
    select 1 from public.jobs j
    where j.customerId=((storage.foldername(name))[2])::uuid
      and (j.customerId=auth.uid() or j.cleanerId=auth.uid())
      and ('detail-media/'||name)=any(j.photos)
  )
);
