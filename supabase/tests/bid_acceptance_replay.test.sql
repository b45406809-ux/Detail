begin;
select plan(7);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('35f3162f-0ea7-4e36-a02e-c98525a5fc18','authenticated','authenticated','accept-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('f97f2526-06b2-4c34-a42d-2fbb66984ea7','authenticated','authenticated','accept-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('2267252c-2a14-45e2-a9f3-bfcb2caa8652','authenticated','authenticated','accept-stranger@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now())
on conflict(id) do nothing;

insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete,balance)
values
  ('35f3162f-0ea7-4e36-a02e-c98525a5fc18','accept-customer@detail.invalid','Accept Customer','CUSTOMER','OFFLINE','NOT_STARTED',false,false,100),
  ('f97f2526-06b2-4c34-a42d-2fbb66984ea7','accept-cleaner@detail.invalid','Accept Cleaner','CLEANER','AVAILABLE','VERIFIED',true,true,0),
  ('2267252c-2a14-45e2-a9f3-bfcb2caa8652','accept-stranger@detail.invalid','Accept Stranger','CUSTOMER','OFFLINE','NOT_STARTED',false,false,0)
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role=excluded.role,status=excluded.status,
  verificationStatus=excluded.verificationStatus,cleanerAgreementAccepted=excluded.cleanerAgreementAccepted,
  cleanerOnboardingComplete=excluded.cleanerOnboardingComplete,balance=excluded.balance;

insert into public.jobs(id,customerId,category,serviceType,status,bookingMode,biddingExpiresAt,checklist,location,budget)
values('a9643c87-a840-42e3-91ed-eeced76c103a','35f3162f-0ea7-4e36-a02e-c98525a5fc18',
  'HOUSE','Basic house clean','PENDING','SCHEDULED',now()+interval '1 hour','{}'::jsonb,'{"address":"Test address"}'::jsonb,30);
insert into public.bids(id,jobId,cleanerId,bidPrice,estimatedArrival,status,message)
values('7f9a924c-9567-4f52-9f4f-a03b96095083','a9643c87-a840-42e3-91ed-eeced76c103a',
  'f97f2526-06b2-4c34-a42d-2fbb66984ea7',25,30,'PENDING','Test offer');

select ok((public.accept_bid('35f3162f-0ea7-4e36-a02e-c98525a5fc18','a9643c87-a840-42e3-91ed-eeced76c103a','7f9a924c-9567-4f52-9f4f-a03b96095083','PAYNOW','accept-retry')->>'replayed')::boolean=false,
  'the first acceptance creates a new result');
select throws_ok(
  $$select public.accept_bid('f97f2526-06b2-4c34-a42d-2fbb66984ea7','a9643c87-a840-42e3-91ed-eeced76c103a','7f9a924c-9567-4f52-9f4f-a03b96095083','WALLET','accept-retry')$$,
  'P0001','Only the customer can accept a bid','a cleaner cannot read or replay the cached customer acceptance');
select is(public.accept_bid('35f3162f-0ea7-4e36-a02e-c98525a5fc18','a9643c87-a840-42e3-91ed-eeced76c103a','7f9a924c-9567-4f52-9f4f-a03b96095083','WALLET','accept-retry')->>'paymentMethod',
  'PAYNOW','a retry returns the original payment method despite a changed request');
select ok((public.accept_bid('35f3162f-0ea7-4e36-a02e-c98525a5fc18','a9643c87-a840-42e3-91ed-eeced76c103a','7f9a924c-9567-4f52-9f4f-a03b96095083','WALLET','accept-retry')->>'replayed')::boolean,
  'the retried result is marked as a replay so the API skips provider checkout');
select is((select paymentMethod from public.jobs where id='a9643c87-a840-42e3-91ed-eeced76c103a'),
  'PAYNOW','a replay cannot change the booking payment method');
select is((select balance::numeric from public.users where id='35f3162f-0ea7-4e36-a02e-c98525a5fc18'),
  100::numeric,'a changed wallet retry cannot debit the customer');
select is((select count(*)::integer from public.payments where jobId='a9643c87-a840-42e3-91ed-eeced76c103a'),
  1,'only the original payment record exists');

select * from finish();
rollback;
