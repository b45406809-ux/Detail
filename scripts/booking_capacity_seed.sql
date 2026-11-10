-- Synthetic rows for the local-only booking capacity benchmark.
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select
  ('00000000-0000-0000-0000-'||lpad(to_hex(n),12,'0'))::uuid,
  'authenticated','authenticated',format('capacity-customer-%s@detail.invalid',n),'',null,'{}'::jsonb,
  jsonb_build_object('displayName',format('Capacity Customer %s',n)),now(),now()
from generate_series(1,10000) n
on conflict(id) do nothing;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select
  ('00000000-0000-0000-0001-'||lpad(to_hex(n),12,'0'))::uuid,
  'authenticated','authenticated',format('capacity-cleaner-%s@detail.invalid',n),'',null,'{}'::jsonb,
  jsonb_build_object('displayName',format('Capacity Cleaner %s',n)),now(),now()
from generate_series(1,1000) n
on conflict(id) do nothing;

update public.users
set role='CLEANER', verificationStatus='NOT_STARTED', cleanerAgreementAccepted=false,
    cleanerOnboardingComplete=false, status='OFFLINE', serviceRadiusKm=null,
    serviceCategories='{}', locationPoint=null, locationUpdatedAt=null
where email like 'capacity-cleaner-%@detail.invalid';
