begin;
select plan(7);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('6c71d302-d700-4b31-85b5-c485f5f51357','authenticated','authenticated','reassign-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('9f171a9b-c535-47f7-bd0f-7d7452c7e9b2','authenticated','authenticated','reassign-old@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('cf218c2d-8c58-4c13-a6cb-abd7c6f46b67','authenticated','authenticated','reassign-new@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete)
values
  ('6c71d302-d700-4b31-85b5-c485f5f51357','reassign-customer@detail.invalid','Reassignment Customer','CUSTOMER','OFFLINE','NOT_STARTED',false,false),
  ('9f171a9b-c535-47f7-bd0f-7d7452c7e9b2','reassign-old@detail.invalid','Original Cleaner','CLEANER','BUSY','VERIFIED',true,true),
  ('cf218c2d-8c58-4c13-a6cb-abd7c6f46b67','reassign-new@detail.invalid','Replacement Cleaner','CLEANER','AVAILABLE','VERIFIED',true,true)
on conflict(id) do update set role=excluded.role,status=excluded.status,verificationStatus=excluded.verificationStatus,
  cleanerAgreementAccepted=excluded.cleanerAgreementAccepted,cleanerOnboardingComplete=excluded.cleanerOnboardingComplete;

insert into public.jobs(id,customerId,cleanerId,category,serviceType,status,scheduledDateTime)
values
  ('185fd004-5139-4f48-a6d0-1554b8bf9f9d','6c71d302-d700-4b31-85b5-c485f5f51357','9f171a9b-c535-47f7-bd0f-7d7452c7e9b2','HOUSE','Completed clean','COMPLETED',now()+interval '1 day'),
  ('fe88bc25-d435-45d6-8fd0-281aa64c3a1a','6c71d302-d700-4b31-85b5-c485f5f51357','9f171a9b-c535-47f7-bd0f-7d7452c7e9b2','HOUSE','Cancelled clean','CANCELLED',now()+interval '2 days'),
  ('0e97dc4a-3bd9-47a3-b658-e3f90d84c29b','6c71d302-d700-4b31-85b5-c485f5f51357','9f171a9b-c535-47f7-bd0f-7d7452c7e9b2','HOUSE','In progress clean','IN_PROGRESS',now()+interval '3 days'),
  ('8ee75ac2-e139-4876-93d5-838783f9a9ea','6c71d302-d700-4b31-85b5-c485f5f51357','9f171a9b-c535-47f7-bd0f-7d7452c7e9b2','HOUSE','Assigned clean','ASSIGNED',now()+interval '4 days');

insert into public.payments(id,jobId,customerId,cleanerId,amount,status)
values('reassign-payment','8ee75ac2-e139-4876-93d5-838783f9a9ea','6c71d302-d700-4b31-85b5-c485f5f51357','9f171a9b-c535-47f7-bd0f-7d7452c7e9b2',40,'ESCROWED');

select throws_ok(
  $$select public.admin_reassign_booking('185fd004-5139-4f48-a6d0-1554b8bf9f9d','6c71d302-d700-4b31-85b5-c485f5f51357','cf218c2d-8c58-4c13-a6cb-abd7c6f46b67','audit test','closed-completed-01')$$,
  'P0001','Only open or assigned bookings can be assigned or reassigned','completed work cannot be reopened'
);
select throws_ok(
  $$select public.admin_reassign_booking('fe88bc25-d435-45d6-8fd0-281aa64c3a1a','6c71d302-d700-4b31-85b5-c485f5f51357','cf218c2d-8c58-4c13-a6cb-abd7c6f46b67','audit test','closed-cancelled-01')$$,
  'P0001','Only open or assigned bookings can be assigned or reassigned','cancelled work cannot be reopened'
);
select throws_ok(
  $$select public.admin_reassign_booking('0e97dc4a-3bd9-47a3-b658-e3f90d84c29b','6c71d302-d700-4b31-85b5-c485f5f51357','cf218c2d-8c58-4c13-a6cb-abd7c6f46b67','audit test','closed-active-01')$$,
  'P0001','Only open or assigned bookings can be assigned or reassigned','in-progress work requires a separate remediation path'
);

select is(
  (public.admin_reassign_booking('8ee75ac2-e139-4876-93d5-838783f9a9ea','6c71d302-d700-4b31-85b5-c485f5f51357','cf218c2d-8c58-4c13-a6cb-abd7c6f46b67','provider test','reassign-success-01')).cleanerId,
  'cf218c2d-8c58-4c13-a6cb-abd7c6f46b67'::uuid,
  'an open assignment moves to the replacement cleaner'
);
select ok(
  (select status='ASSIGNED' and cleanerId='cf218c2d-8c58-4c13-a6cb-abd7c6f46b67' from public.jobs where id='8ee75ac2-e139-4876-93d5-838783f9a9ea'),
  'the booking remains assigned after reassignment'
);
select is(
  (select cleanerId from public.payments where id='reassign-payment'),
  'cf218c2d-8c58-4c13-a6cb-abd7c6f46b67'::uuid,
  'the escrow payment ownership follows the replacement cleaner'
);
select ok(
  exists(select 1 from public.jobEvents where jobId='8ee75ac2-e139-4876-93d5-838783f9a9ea' and idempotencyKey='reassign-success-01'
    and data->>'previousCleanerId'='9f171a9b-c535-47f7-bd0f-7d7452c7e9b2' and data->>'newCleanerId'='cf218c2d-8c58-4c13-a6cb-abd7c6f46b67'),
  'the reassignment records both cleaner identities for audit'
);

select * from finish();
rollback;
