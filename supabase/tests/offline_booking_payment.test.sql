begin;
select plan(10);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('db37bbce-d766-40ea-a722-0d4fca09df11','authenticated','authenticated','offline-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
 ('ac87c0fa-5c20-454c-8ca0-06c802f2bc62','authenticated','authenticated','offline-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now())
on conflict(id) do nothing;
insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete,balance,commissionBalance)
values
 ('db37bbce-d766-40ea-a722-0d4fca09df11','offline-customer@detail.invalid','Offline Customer','CUSTOMER','OFFLINE','NOT_STARTED',false,false,100,0),
 ('ac87c0fa-5c20-454c-8ca0-06c802f2bc62','offline-cleaner@detail.invalid','Offline Cleaner','CLEANER','AVAILABLE','VERIFIED',true,true,0,0)
on conflict(id) do update set role=excluded.role,status=excluded.status,verificationStatus=excluded.verificationStatus,cleanerAgreementAccepted=true,commissionBalance=0;
insert into public.jobs(id,customerId,category,serviceType,status,bookingMode,biddingExpiresAt,checklist,location,budget)
values('71ab570c-2ef4-4db4-84c5-8782e9347d60','db37bbce-d766-40ea-a722-0d4fca09df11','HOUSE','Basic house clean','PENDING','SCHEDULED',now()+interval '1 hour','{}'::jsonb,'{"address":"Test address"}'::jsonb,30);
insert into public.bids(id,jobId,cleanerId,bidPrice,estimatedArrival,status,message)
values('c4ee7757-654a-43ea-a0c7-f09c34aa55be','71ab570c-2ef4-4db4-84c5-8782e9347d60','ac87c0fa-5c20-454c-8ca0-06c802f2bc62',25,30,'PENDING','Test quote');

select is(public.accept_bid('db37bbce-d766-40ea-a722-0d4fca09df11','71ab570c-2ef4-4db4-84c5-8782e9347d60','c4ee7757-654a-43ea-a0c7-f09c34aa55be','DIRECT_OFFLINE','offline-accept-1')->>'paymentMethod','DIRECT_OFFLINE','acceptance records the explicit offline payment method');
select is((select status::text from public.jobs where id='71ab570c-2ef4-4db4-84c5-8782e9347d60'),'ASSIGNED','quote acceptance assigns the cleaner');
select is((select paymentStatus from public.jobs where id='71ab570c-2ef4-4db4-84c5-8782e9347d60'),'PENDING','the booking is not falsely marked paid');
select is((select provider from public.payments where jobId='71ab570c-2ef4-4db4-84c5-8782e9347d60'),'OFFLINE','the payment ledger identifies payment arranged outside Detail');
select is((select status from public.payments where jobId='71ab570c-2ef4-4db4-84c5-8782e9347d60'),'PENDING','offline payment remains pending');
select is((select balance::numeric from public.users where id='db37bbce-d766-40ea-a722-0d4fca09df11'),100::numeric,'no customer wallet funds are taken');
select is((select commissionBalance::numeric from public.users where id='ac87c0fa-5c20-454c-8ca0-06c802f2bc62'),0::numeric,'no cleaner commission reserve is taken');
select lives_ok($$select public.transition_booking('71ab570c-2ef4-4db4-84c5-8782e9347d60','ac87c0fa-5c20-454c-8ca0-06c802f2bc62','EN_ROUTE','offline-enroute-1',null)$$,'cleaner can start an offline-payment booking without escrow');
select is((public.cancel_booking('71ab570c-2ef4-4db4-84c5-8782e9347d60','db37bbce-d766-40ea-a722-0d4fca09df11','test cancellation','offline-cancel-1')->>'status'),'NOT_REQUIRED','cancelling an unpaid offline booking does not fabricate a refund');
select is((select status from public.payments where jobId='71ab570c-2ef4-4db4-84c5-8782e9347d60'),'CANCELLED','cancellation closes its pending offline ledger entry');

select * from finish();
rollback;
