begin;

select plan(8);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c0877466-32d1-487c-9aa1-b243b805db7c','authenticated','authenticated','instant-customer-one@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('40b4bda5-953a-44d5-9b56-5dc6c024f24f','authenticated','authenticated','instant-customer-two@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('922363f4-9721-42b0-8f6d-d12411d72716','authenticated','authenticated','instant-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete)
values
  ('c0877466-32d1-487c-9aa1-b243b805db7c','instant-customer-one@detail.invalid','Instant Customer One','CUSTOMER','OFFLINE','NOT_STARTED',false,false),
  ('40b4bda5-953a-44d5-9b56-5dc6c024f24f','instant-customer-two@detail.invalid','Instant Customer Two','CUSTOMER','OFFLINE','NOT_STARTED',false,false),
  ('922363f4-9721-42b0-8f6d-d12411d72716','instant-cleaner@detail.invalid','Instant Cleaner','CLEANER','AVAILABLE','VERIFIED',true,true)
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role=excluded.role,
  status=excluded.status,verificationStatus=excluded.verificationStatus,
  cleanerAgreementAccepted=excluded.cleanerAgreementAccepted,cleanerOnboardingComplete=excluded.cleanerOnboardingComplete;

insert into public.jobs(id,customerId,category,serviceType,status,bookingMode,estimatedDuration,matchExpiresAt,price,checklist,location)
values
  ('504693dc-1a0b-4b3a-8c4b-23265148ba3f','c0877466-32d1-487c-9aa1-b243b805db7c','HOUSE','Basic house clean','PENDING','INSTANT',90,now()+interval '3 minutes',25,'{}'::jsonb,'{"address":"Test address"}'::jsonb),
  ('68f879e0-e59d-40c8-9481-5149dce50734','40b4bda5-953a-44d5-9b56-5dc6c024f24f','HOUSE','Basic house clean','PENDING','INSTANT',90,now()+interval '3 minutes',25,'{}'::jsonb,'{"address":"Test address"}'::jsonb);

insert into public.instantOffers(jobId,cleanerId,status,expiresAt,distanceMeters)
values
  ('504693dc-1a0b-4b3a-8c4b-23265148ba3f','922363f4-9721-42b0-8f6d-d12411d72716','OFFERED',now()+interval '3 minutes',1000),
  ('68f879e0-e59d-40c8-9481-5149dce50734','922363f4-9721-42b0-8f6d-d12411d72716','OFFERED',now()+interval '3 minutes',1000);

select ok(
  public.respond_instant_offer('504693dc-1a0b-4b3a-8c4b-23265148ba3f'::uuid,'922363f4-9721-42b0-8f6d-d12411d72716',true,'instant-accept-one')->>'status'='CUSTOMER_ACTION_REQUIRED',
  'the first cleaner acceptance waits for customer confirmation'
);
select is(
  (select count(*)::integer from public.cleanerAvailabilityBlocks where jobId='504693dc-1a0b-4b3a-8c4b-23265148ba3f' and cleanerId='922363f4-9721-42b0-8f6d-d12411d72716' and blockType='CONFIRMATION'),
  1,
  'customer confirmation creates an exclusive cleaner availability hold'
);
select throws_ok(
  $$select public.respond_instant_offer('68f879e0-e59d-40c8-9481-5149dce50734'::uuid,'922363f4-9721-42b0-8f6d-d12411d72716',true,'instant-accept-two')$$,
  'P0001',
  'Cleaner is not available for another customer confirmation',
  'a second customer cannot reserve the same cleaner at the same time'
);
select ok(
  public.reject_bid_secure('504693dc-1a0b-4b3a-8c4b-23265148ba3f',
    (select id from public.bids where jobId='504693dc-1a0b-4b3a-8c4b-23265148ba3f'),
    'c0877466-32d1-487c-9aa1-b243b805db7c'),
  'the customer can decline an instant offer while no payment is charged'
);
select is(
  (select count(*)::integer from public.cleanerAvailabilityBlocks where jobId='504693dc-1a0b-4b3a-8c4b-23265148ba3f' and blockType='CONFIRMATION'),
  0,
  'declining releases the cleaner reservation'
);
select ok(
  (select matchExpiresAt>now() from public.jobs where id='504693dc-1a0b-4b3a-8c4b-23265148ba3f'),
  'declining leaves time for another instant matching round'
);
select ok(
  public.respond_instant_offer('68f879e0-e59d-40c8-9481-5149dce50734'::uuid,'922363f4-9721-42b0-8f6d-d12411d72716',true,'instant-accept-two-retry')->>'status'='CUSTOMER_ACTION_REQUIRED',
  'the released cleaner can accept another customer request'
);
select is(
  (select count(*)::integer from public.bids where jobId='68f879e0-e59d-40c8-9481-5149dce50734' and cleanerId='922363f4-9721-42b0-8f6d-d12411d72716' and status='PENDING'),
  1,
  'the second customer receives exactly one pending cleaner offer'
);

select * from finish();
rollback;
