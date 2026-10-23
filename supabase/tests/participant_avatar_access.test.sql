begin;
select plan(3);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('6c32a407-a8ca-4b46-9fad-6165c5f90910','authenticated','authenticated','avatar-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('87150e3b-4530-4438-9e1e-dbc3d14ee901','authenticated','authenticated','avatar-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('9e064150-967a-45e4-92a4-114fe8c979c0','authenticated','authenticated','avatar-outsider@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

insert into public.users(id,email,displayName,role,verificationStatus,cleanerAgreementAccepted)
values
  ('6c32a407-a8ca-4b46-9fad-6165c5f90910','avatar-customer@detail.invalid','Avatar Customer','CUSTOMER','NOT_STARTED',false),
  ('87150e3b-4530-4438-9e1e-dbc3d14ee901','avatar-cleaner@detail.invalid','Avatar Cleaner','CLEANER','VERIFIED',true),
  ('9e064150-967a-45e4-92a4-114fe8c979c0','avatar-outsider@detail.invalid','Avatar Outsider','CUSTOMER','NOT_STARTED',false)
on conflict(id) do update set displayName=excluded.displayName,role=excluded.role,verificationStatus=excluded.verificationStatus,cleanerAgreementAccepted=excluded.cleanerAgreementAccepted;

insert into public.jobs(id,customerId,cleanerId,serviceType,status)
values('5da6206d-53d7-4955-901a-d108da2aa6eb','6c32a407-a8ca-4b46-9fad-6165c5f90910','87150e3b-4530-4438-9e1e-dbc3d14ee901','House cleaning','ASSIGNED');
insert into storage.objects(id,bucket_id,name)
values
  ('59c625bd-e64d-4555-b98f-f13ab751ee01','detail-media','profile-photos/6c32a407-a8ca-4b46-9fad-6165c5f90910/avatar.jpg'),
  ('e9380e9e-4363-486b-8cf2-e019e060c07e','detail-media','profile-photos/87150e3b-4530-4438-9e1e-dbc3d14ee901/avatar.jpg');

set local role authenticated;
select set_config('request.jwt.claim.sub','6c32a407-a8ca-4b46-9fad-6165c5f90910',true);
select is((select count(*)::integer from storage.objects where name='profile-photos/87150e3b-4530-4438-9e1e-dbc3d14ee901/avatar.jpg'),1,
  'customer can read the assigned cleaner avatar');
select set_config('request.jwt.claim.sub','87150e3b-4530-4438-9e1e-dbc3d14ee901',true);
select is((select count(*)::integer from storage.objects where name='profile-photos/6c32a407-a8ca-4b46-9fad-6165c5f90910/avatar.jpg'),1,
  'cleaner can read the assigned customer avatar');
select set_config('request.jwt.claim.sub','9e064150-967a-45e4-92a4-114fe8c979c0',true);
select is((select count(*)::integer from storage.objects where name in (
  'profile-photos/6c32a407-a8ca-4b46-9fad-6165c5f90910/avatar.jpg',
  'profile-photos/87150e3b-4530-4438-9e1e-dbc3d14ee901/avatar.jpg')),0,
  'an unrelated account cannot read either booking avatar');
reset role;

select * from finish();
rollback;
