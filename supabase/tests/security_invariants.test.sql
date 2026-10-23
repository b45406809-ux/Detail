begin;

select plan(12);

select ok(
  not has_function_privilege('anon', 'public.accept_customer_agreement(uuid)', 'execute'),
  'anonymous users cannot accept a customer agreement for an arbitrary account'
);
select ok(
  not has_function_privilege('authenticated', 'public.accept_customer_agreement(uuid)', 'execute'),
  'authenticated users cannot bypass the agreement service'
);
select ok(
  has_function_privilege('service_role', 'public.accept_customer_agreement(uuid)', 'execute'),
  'the trusted service can record customer agreement acceptance'
);
select ok(
  not has_function_privilege('authenticated', 'public.accept_cleaner_agreement(uuid)', 'execute'),
  'authenticated users cannot bypass cleaner eligibility checks'
);
select ok(
  not has_column_privilege('authenticated', 'public.users', 'hasAgreedToTerms', 'UPDATE'),
  'users cannot directly set customer legal acceptance'
);
select ok(
  not has_column_privilege('authenticated', 'public.users', 'cleanerAgreementAccepted', 'UPDATE'),
  'users cannot directly set cleaner legal acceptance'
);
select ok(
  not has_table_privilege('authenticated', 'public.legalDocumentAcceptances', 'SELECT'),
  'legal acceptance records are not directly readable by app users'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.legalDocumentAcceptances'::regclass),
  'legal acceptance records have row-level security enabled'
);
select ok(
  to_regclass('public.bids_one_active_quote_per_cleaner_idx') is not null,
  'a cleaner cannot hold multiple active quotes for one job'
);
select ok(
  to_regclass('public.payout_requests_cleaner_operation_key') is not null,
  'payout retries are protected by a per-cleaner operation key'
);
select ok(
  not has_function_privilege('authenticated', 'public.request_cleaner_payout_idempotent(uuid,numeric,text,text,text,text,text,text)', 'execute'),
  'payout requests are only created through the trusted service'
);
select ok(
  has_function_privilege('service_role', 'public.request_cleaner_payout_idempotent(uuid,numeric,text,text,text,text,text,text)', 'execute'),
  'the trusted service can create idempotent payout requests'
);

select * from finish();
rollback;
