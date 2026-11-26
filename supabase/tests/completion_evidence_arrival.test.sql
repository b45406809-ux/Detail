begin;
select plan(4);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('b6b3a50a-96a1-46a4-9b1f-e5b26aa9c6c1','authenticated','authenticated','evidence-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('a6131e89-42e2-4b3c-b919-8ae8339b469a','authenticated','authenticated','evidence-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

set local request.jwt.claim.role = 'service_role';
insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete,photoURL,cleanerSelfieAt)
values
  ('b6b3a50a-96a1-46a4-9b1f-e5b26aa9c6c1','evidence-customer@detail.invalid','Evidence Customer','CUSTOMER','OFFLINE','NOT_STARTED',false,false,'',null),
  ('a6131e89-42e2-4b3c-b919-8ae8339b469a','evidence-cleaner@detail.invalid','Evidence Cleaner','CLEANER','BUSY','VERIFIED',true,true,'detail-media/profile-photos/a6131e89-42e2-4b3c-b919-8ae8339b469a/avatar.jpg',now())
on conflict(id) do update set role=excluded.role,status=excluded.status,verificationStatus=excluded.verificationStatus,
  cleanerAgreementAccepted=excluded.cleanerAgreementAccepted,cleanerOnboardingComplete=excluded.cleanerOnboardingComplete, photoURL=excluded.photoURL, cleanerSelfieAt=excluded.cleanerSelfieAt;
reset request.jwt.claim.role;

insert into public.jobs(id,customerId,cleanerId,category,serviceType,status,location,completionPhotos)
values('cd6506f6-0f60-4b48-963b-cc78783b37b8','b6b3a50a-96a1-46a4-9b1f-e5b26aa9c6c1','a6131e89-42e2-4b3c-b919-8ae8339b469a',
  'HOUSE','Basic house clean','EN_ROUTE','{"lat":-17.8,"lng":31.05}'::jsonb,'{}');

-- The upload itself is verified in R2 by the edge function; the database rejects paths outside this booking.
select throws_ok(
  $$select public.add_completion_photo('cd6506f6-0f60-4b48-963b-cc78783b37b8','a6131e89-42e2-4b3c-b919-8ae8339b469a','detail-media/job-completion/00000000-0000-0000-0000-000000000000/a6131e89-42e2-4b3c-b919-8ae8339b469a/forged.jpg')$$,
  'P0001','Invalid photo path',
  'a forged path cannot count as completion evidence'
);

select throws_ok(
  $$select public.mark_booking_arrived('cd6506f6-0f60-4b48-963b-cc78783b37b8','a6131e89-42e2-4b3c-b919-8ae8339b469a','arrival-remote-01',-17.7,31.05)$$,
  'P0001','Move closer to the booking address before recording arrival',
  'arrival outside the geofence is rejected'
);

select ok(
  public.mark_booking_arrived('cd6506f6-0f60-4b48-963b-cc78783b37b8','a6131e89-42e2-4b3c-b919-8ae8339b469a','arrival-near-001',-17.8,31.05) is not null,
  'the assigned cleaner can record arrival from the booking location'
);

select ok(
  (select arrivalAt is not null from public.jobs where id='cd6506f6-0f60-4b48-963b-cc78783b37b8'),
  'accepted arrival is persisted on the booking'
);

select * from finish();
rollback;
