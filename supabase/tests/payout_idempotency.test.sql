begin;

select plan(10);

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

select public.request_cleaner_payout_idempotent(
  '7a0ce2d7-43a1-4fe4-b771-5ccf20e68020',5,'BANK','Test Cleaner',repeat('y',40),'5678','payout-pending-reject-1',repeat('b',64)
);
select is(
  (public.reject_pending_cleaner_payout((select id from public.payoutRequests where operationKey='payout-pending-reject-1'),'7a0ce2d7-43a1-4fe4-b771-5ccf20e68020','Invalid destination details','pending-reject-key-1')).status,
  'REJECTED'::text,
  'pending payout can be reasonedly rejected without approval'
);
select is(
  (select status from public.walletTransactions where idempotencyKey='payout_hold_'||(select id from public.payoutRequests where operationKey='payout-pending-reject-1')),
  'REVERSED',
  'rejecting a pending payout reverses its reservation'
);
select is(
  (select earningsBalance from public.users where id='7a0ce2d7-43a1-4fe4-b771-5ccf20e68020'),
  5::numeric,
  'rejecting a pending payout restores the reserved earnings once'
);
select is(
  (public.reject_pending_cleaner_payout((select id from public.payoutRequests where operationKey='payout-pending-reject-1'),'7a0ce2d7-43a1-4fe4-b771-5ccf20e68020','Retry rejection','pending-reject-key-1')).status,
  'REJECTED'::text,
  'retrying the same rejection is idempotent'
);
select is(
  (select count(*)::integer from public.walletTransactions where idempotencyKey='payout_reversal_'||(select id from public.payoutRequests where operationKey='payout-pending-reject-1')),
  1,
  'idempotent rejection creates only one wallet credit'
);

select * from finish();
rollback;
