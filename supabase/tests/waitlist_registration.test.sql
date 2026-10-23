begin;
select plan(6);

select is(
  public.register_waitlist_entry('Waitlist.Person@detail.invalid','Original Name','+263771111111','Zimbabwe','Harare','Avondale','CUSTOMER','HOUSE','English',true,'unsubscribe-original-token','{"campaign":{"source":"test"}}'::jsonb),
  true,
  'the first waitlist registration is created'
);
select is(
  public.register_waitlist_entry('waitlist.person@detail.invalid','Different Name','+263772222222','Zimbabwe','Bulawayo','CBD','CLEANER','CAR','Shona',false,'unsubscribe-attacker-token','{}'::jsonb),
  false,
  'a duplicate normalized address does not create another registration'
);
select is(
  (select count(*)::integer from public.betaWaitlist where lower(email)='waitlist.person@detail.invalid'),
  1,
  'case variants resolve to one waitlist record'
);
select is(
  (select fullName from public.betaWaitlist where lower(email)='waitlist.person@detail.invalid'),
  'Original Name',
  'a duplicate cannot overwrite the original contact name'
);
select is(
  (select marketingEmailPermission from public.betaWaitlist where lower(email)='waitlist.person@detail.invalid'),
  'YES',
  'a duplicate cannot change the original marketing consent'
);
select is(
  (select unsubscribeToken from public.betaWaitlist where lower(email)='waitlist.person@detail.invalid'),
  'unsubscribe-original-token',
  'a duplicate cannot invalidate the original unsubscribe link'
);

select * from finish();
rollback;
