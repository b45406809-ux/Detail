begin;
select plan(6);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('abb56c59-044b-4fd1-8b1b-cfd1b39e7f86','authenticated','authenticated','quote-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('5fae0f47-4552-4220-8796-9d08c43fca7e','authenticated','authenticated','quote-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete)
values
  ('abb56c59-044b-4fd1-8b1b-cfd1b39e7f86','quote-customer@detail.invalid','Quote Customer','CUSTOMER','OFFLINE','NOT_STARTED',false,false),
  ('5fae0f47-4552-4220-8796-9d08c43fca7e','quote-cleaner@detail.invalid','Quote Cleaner','CLEANER','AVAILABLE','VERIFIED',true,true)
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role=excluded.role,
  status=excluded.status,verificationStatus=excluded.verificationStatus,
  cleanerAgreementAccepted=excluded.cleanerAgreementAccepted,cleanerOnboardingComplete=excluded.cleanerOnboardingComplete;

insert into public.jobs(id,customerId,category,serviceType,status,bookingMode,biddingExpiresAt,price,checklist,location)
values('8fd24a33-1846-49d8-9d78-0ce56b0f2a44','abb56c59-044b-4fd1-8b1b-cfd1b39e7f86',
  'HOUSE','Basic house clean','PENDING','SCHEDULED',now()+interval '1 hour',25,'{}'::jsonb,'{"address":"Test address"}'::jsonb);

select ok(
  public.submit_bid_secure('8fd24a33-1846-49d8-9d78-0ce56b0f2a44','5fae0f47-4552-4220-8796-9d08c43fca7e',40,30,'First quote') is not null,
  'a verified cleaner can submit a valid quote'
);
select is(
  public.submit_bid_secure('8fd24a33-1846-49d8-9d78-0ce56b0f2a44','5fae0f47-4552-4220-8796-9d08c43fca7e',40,30,'First quote'),
  (select id from public.bids where jobId='8fd24a33-1846-49d8-9d78-0ce56b0f2a44' and cleanerId='5fae0f47-4552-4220-8796-9d08c43fca7e' and status='PENDING'),
  'retrying an identical quote returns the existing active quote'
);
select throws_ok(
  $$select public.submit_bid_secure('8fd24a33-1846-49d8-9d78-0ce56b0f2a44','5fae0f47-4552-4220-8796-9d08c43fca7e',45,30,'Changed quote')$$,
  'P0001','You already have an active quote for this booking',
  'a cleaner cannot create a second active quote by changing its terms'
);
select ok(
  public.reject_bid_secure('8fd24a33-1846-49d8-9d78-0ce56b0f2a44',
    (select id from public.bids where jobId='8fd24a33-1846-49d8-9d78-0ce56b0f2a44' and cleanerId='5fae0f47-4552-4220-8796-9d08c43fca7e'),
    'abb56c59-044b-4fd1-8b1b-cfd1b39e7f86'),
  'the customer can reject the active quote'
);
select ok(
  public.submit_bid_secure('8fd24a33-1846-49d8-9d78-0ce56b0f2a44','5fae0f47-4552-4220-8796-9d08c43fca7e',45,30,'Revised quote') is distinct from
    (select id from public.bids where jobId='8fd24a33-1846-49d8-9d78-0ce56b0f2a44' and cleanerId='5fae0f47-4552-4220-8796-9d08c43fca7e' and status='REJECTED'),
  'a cleaner can submit a revised quote after customer rejection'
);
update public.jobs set status='CANCELLED' where id='8fd24a33-1846-49d8-9d78-0ce56b0f2a44';
select throws_ok(
  $$select public.submit_bid_secure('8fd24a33-1846-49d8-9d78-0ce56b0f2a44','5fae0f47-4552-4220-8796-9d08c43fca7e',45,30,'Late quote')$$,
  'P0001','This booking is not accepting cleaner bids',
  'a closed booking cannot receive a late cleaner quote'
);

select * from finish();
rollback;
