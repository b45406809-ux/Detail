begin;

select plan(5);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  '7a0ce2d7-43a1-4fe4-b771-5ccf20e68020',
  'authenticated','authenticated','payout-idempotency-test@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()
);

insert into public.users(id,email,displayName,role,verificationStatus,cleanerAgreementAccepted,balance,earningsBalance)
values(
  '7a0ce2d7-43a1-4fe4-b771-5ccf20e68020',
  'payout-idempotency-test@detail.invalid','Payout Test Cleaner','CLEANER','VERIFIED',true,10,10
)
on conflict(id) do update set role='CLEANER',verificationStatus='VERIFIED',cleanerAgreementAccepted=true,balance=10,earningsBalance=10;

select is(
  public.request_cleaner_payout_idempotent(
    '7a0ce2d7-43a1-4fe4-b771-5ccf20e68020',5,'BANK','Test Cleaner',repeat('x',40),'1234','payout-test-operation-1',repeat('a',64)
  ),
  public.request_cleaner_payout_idempotent(
    '7a0ce2d7-43a1-4fe4-b771-5ccf20e68020',5,'BANK','Test Cleaner',repeat('x',40),'1234','payout-test-operation-1',repeat('a',64)
  ),
  'retrying an identical payout operation returns its original ID'
);
select is(
  (select count(*)::integer from public.payoutRequests where cleanerId='7a0ce2d7-43a1-4fe4-b771-5ccf20e68020'),
  1,
  'an identical retry creates only one payout request'
);
select is(
  (select count(*)::integer from public.walletTransactions where idempotencyKey like 'payout_hold_%'),
  1,
  'an identical retry reserves funds only once'
);
select is(
  (select earningsBalance from public.users where id='7a0ce2d7-43a1-4fe4-b771-5ccf20e68020'),
  5::numeric,
  'the retry debits cleared earnings exactly once'
);
select is(
  (select balance from public.users where id='7a0ce2d7-43a1-4fe4-b771-5ccf20e68020'),
  5::numeric,
  'the retry debits the overall wallet exactly once'
);

select * from finish();
rollback;
