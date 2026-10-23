begin;
select plan(4);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('92f2c7a4-8d91-4aa6-b8a4-299a99157b89','authenticated','authenticated','settle-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('5e95b4ec-717f-40d6-8c0c-29ed320fa00d','authenticated','authenticated','settle-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now())
on conflict(id) do nothing;
insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete)
values
  ('92f2c7a4-8d91-4aa6-b8a4-299a99157b89','settle-customer@detail.invalid','Settle Customer','CUSTOMER','OFFLINE','NOT_STARTED',false,false),
  ('5e95b4ec-717f-40d6-8c0c-29ed320fa00d','settle-cleaner@detail.invalid','Settle Cleaner','CLEANER','AVAILABLE','VERIFIED',true,true)
on conflict(id) do nothing;

insert into public.jobs(id,customerId,cleanerId,category,serviceType,status,location,price,paymentMethod,paymentStatus,completionSubmittedAt,data)
values
  ('b5620d31-3a30-4a13-a4ca-f1ae7ee8359a','92f2c7a4-8d91-4aa6-b8a4-299a99157b89','5e95b4ec-717f-40d6-8c0c-29ed320fa00d','HOUSE','House clean','COMPLETED','{"address":"A"}'::jsonb,50,'CASH','AUTHORIZED',now(),'{}'::jsonb),
  ('371505dc-e9a6-489d-9ab9-b6b8c859d0f1','92f2c7a4-8d91-4aa6-b8a4-299a99157b89','5e95b4ec-717f-40d6-8c0c-29ed320fa00d','HOUSE','House clean','COMPLETED','{"address":"B"}'::jsonb,50,'CASH','AUTHORIZED',now(),' {"customerCompletionResponse":{"status":"DISPUTED"}}'::jsonb);
insert into public.supportCases(id,jobId,customerId,cleanerId,reason,status,data)
values('completion_371505dc-e9a6-489d-9ab9-b6b8c859d0f1','371505dc-e9a6-489d-9ab9-b6b8c859d0f1',
  '92f2c7a4-8d91-4aa6-b8a4-299a99157b89','5e95b4ec-717f-40d6-8c0c-29ed320fa00d','Work is incomplete','URGENT',
  '{"type":"COMPLETION_DISPUTE"}'::jsonb);
update public.jobs set customerResponseAt=now() where id='371505dc-e9a6-489d-9ab9-b6b8c859d0f1';

select throws_ok(
  $$select public.settle_job_payment('b5620d31-3a30-4a13-a4ca-f1ae7ee8359a','92f2c7a4-8d91-4aa6-b8a4-299a99157b89','CASH')$$,
  'P0001','Completion must be confirmed or the dispute resolved before settlement',
  'a customer cannot settle cash before reviewing the submitted completion');
select throws_ok(
  $$select public.settle_job_payment('371505dc-e9a6-489d-9ab9-b6b8c859d0f1','92f2c7a4-8d91-4aa6-b8a4-299a99157b89','CASH')$$,
  'P0001','Completion must be confirmed or the dispute resolved before settlement',
  'a disputed completion cannot settle before support resolution');
update public.supportCases set status='RESOLVED',data=data||'{"settlementDecision":"RELEASE_EARNINGS"}'::jsonb
  where id='completion_371505dc-e9a6-489d-9ab9-b6b8c859d0f1';
select ok(public.settle_job_payment('371505dc-e9a6-489d-9ab9-b6b8c859d0f1','92f2c7a4-8d91-4aa6-b8a4-299a99157b89','CASH'),
  'an explicitly resolved dispute can settle');
select is((select paymentStatus from public.jobs where id='371505dc-e9a6-489d-9ab9-b6b8c859d0f1'),
  'PAID','the resolved booking records its payment settlement');

select * from finish();
rollback;
