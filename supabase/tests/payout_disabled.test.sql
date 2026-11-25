begin;
select plan(3);

select ok(not has_function_privilege('service_role',
  'public.request_cleaner_payout_idempotent(uuid,numeric,text,text,text,text,text,text)', 'EXECUTE'),
  'the application service cannot start a legacy payout');
select ok(not has_function_privilege('service_role',
  'public.approve_cleaner_payout(uuid,uuid)', 'EXECUTE'),
  'the application service cannot approve a legacy payout');
select ok(not has_function_privilege('service_role',
  'public.settle_cleaner_payout(uuid,uuid,text,text)', 'EXECUTE'),
  'the application service cannot settle a legacy payout');

select * from finish();
rollback;
