begin;
select plan(12);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('3a398724-2e26-4d3d-b0b4-50bc89ee16f4','authenticated','authenticated','reschedule-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('f95f7f14-f66e-4c2a-8dd3-b7d32735b57f','authenticated','authenticated','reschedule-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete)
values
  ('3a398724-2e26-4d3d-b0b4-50bc89ee16f4','reschedule-customer@detail.invalid','Reschedule Customer','CUSTOMER','OFFLINE','NOT_STARTED',false,false),
  ('f95f7f14-f66e-4c2a-8dd3-b7d32735b57f','reschedule-cleaner@detail.invalid','Reschedule Cleaner','CLEANER','AVAILABLE','VERIFIED',true,true)
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role=excluded.role,
  status=excluded.status,verificationStatus=excluded.verificationStatus,
  cleanerAgreementAccepted=excluded.cleanerAgreementAccepted,cleanerOnboardingComplete=excluded.cleanerOnboardingComplete;

insert into public.jobs(id,customerId,category,serviceType,status,bookingMode,estimatedDuration,scheduledDateTime,price,checklist,location)
values('611a954d-5607-40ae-b0d8-9dc24c96774b','3a398724-2e26-4d3d-b0b4-50bc89ee16f4',
  'HOUSE','Basic house clean','PENDING','SCHEDULED',120,now()+interval '1 day',25,'{}'::jsonb,'{"address":"Test address"}'::jsonb);
update public.jobs set cleanerId='f95f7f14-f66e-4c2a-8dd3-b7d32735b57f',status='ASSIGNED'
where id='611a954d-5607-40ae-b0d8-9dc24c96774b';

select lives_ok(
  $$select public.reschedule_booking('611a954d-5607-40ae-b0d8-9dc24c96774b','3a398724-2e26-4d3d-b0b4-50bc89ee16f4',now()+interval '1 day 30 minutes','reschedule-self-overlap')$$,
  'moving a booking into its own former buffer succeeds'
);
select is(
  (select count(*)::integer from public.cleanerAvailabilityBlocks
   where jobId='611a954d-5607-40ae-b0d8-9dc24c96774b' and blockType in ('BOOKING','BUFFER')),
  2,
  'rescheduling replaces rather than duplicates its booking and buffer blocks'
);
select is(
  (select startsAt from public.cleanerAvailabilityBlocks where jobId='611a954d-5607-40ae-b0d8-9dc24c96774b' and blockType='BOOKING'),
  (select scheduledDateTime from public.jobs where id='611a954d-5607-40ae-b0d8-9dc24c96774b'),
  'the availability block tracks the new scheduled time'
);

insert into public.cleanerAvailabilityBlocks(cleanerId,startsAt,endsAt,blockType)
values('f95f7f14-f66e-4c2a-8dd3-b7d32735b57f',now()+interval '3 days',now()+interval '3 days 3 hours','MANUAL');
select throws_ok(
  $$select public.reschedule_booking('611a954d-5607-40ae-b0d8-9dc24c96774b','3a398724-2e26-4d3d-b0b4-50bc89ee16f4',now()+interval '3 days','reschedule-real-overlap')$$,
  '23P01', null,
  'rescheduling into another availability block still fails'
);
select is(
  (select startsAt from public.cleanerAvailabilityBlocks where jobId='611a954d-5607-40ae-b0d8-9dc24c96774b' and blockType='BOOKING'),
  (select scheduledDateTime from public.jobs where id='611a954d-5607-40ae-b0d8-9dc24c96774b'),
  'a rejected move preserves the previous booking slot'
);

select is(
  public.propose_booking_reschedule('611a954d-5607-40ae-b0d8-9dc24c96774b','3a398724-2e26-4d3d-b0b4-50bc89ee16f4',now()+interval '2 days','mutual-reschedule-one')->>'status',
  'PENDING',
  'a participant creates a pending time-change proposal'
);
select is(
  (select scheduledDateTime from public.jobs where id='611a954d-5607-40ae-b0d8-9dc24c96774b'),
  (select (data->'rescheduleProposal'->>'previousDateTime')::timestamptz from public.jobs where id='611a954d-5607-40ae-b0d8-9dc24c96774b'),
  'the existing time remains confirmed until the other participant responds'
);
select lives_ok(
  $$select public.respond_booking_reschedule('611a954d-5607-40ae-b0d8-9dc24c96774b','f95f7f14-f66e-4c2a-8dd3-b7d32735b57f',true,'mutual-reschedule-one')$$,
  'the other participant can accept the proposed time'
);
select is(
  (select scheduledDateTime from public.jobs where id='611a954d-5607-40ae-b0d8-9dc24c96774b'),
  (select (data->'rescheduleProposal'->>'proposedDateTime')::timestamptz from public.jobs where id='611a954d-5607-40ae-b0d8-9dc24c96774b'),
  'accepting the proposal updates the booking and its availability slot'
);
select is(
  public.propose_booking_reschedule('611a954d-5607-40ae-b0d8-9dc24c96774b','f95f7f14-f66e-4c2a-8dd3-b7d32735b57f',now()+interval '4 days','mutual-reschedule-two')->>'status',
  'PENDING',
  'either participant may propose a later time after the previous proposal is resolved'
);
select is(
  (public.respond_booking_reschedule('611a954d-5607-40ae-b0d8-9dc24c96774b','3a398724-2e26-4d3d-b0b4-50bc89ee16f4',false,'mutual-reschedule-two')->>'status'),
  'DECLINED',
  'the other participant can decline a proposal'
);
select is(
  (select scheduledDateTime from public.jobs where id='611a954d-5607-40ae-b0d8-9dc24c96774b'),
  (select (data->'rescheduleProposal'->>'previousDateTime')::timestamptz from public.jobs where id='611a954d-5607-40ae-b0d8-9dc24c96774b'),
  'declining preserves the previously accepted booking time'
);

select * from finish();
rollback;
