begin;

select plan(42);

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
  not has_column_privilege('authenticated', 'public.users', 'hasagreedtoterms', 'UPDATE'),
  'users cannot directly set customer legal acceptance'
);
select ok(
  not has_column_privilege('authenticated', 'public.users', 'cleaneragreementaccepted', 'UPDATE'),
  'users cannot directly set cleaner legal acceptance'
);
select ok(
  not has_table_privilege('authenticated', 'public.users', 'UPDATE'),
  'authenticated users have no broad table-level profile update grant'
);
select ok(not has_column_privilege('authenticated','public.users','role','UPDATE'),'users cannot directly change marketplace role');
select ok(not has_column_privilege('authenticated','public.users','cleaneronboardingcomplete','UPDATE'),'users cannot self-complete cleaner onboarding');
select ok(not has_column_privilege('authenticated','public.users','jobscompleted','UPDATE'),'users cannot modify completed-job totals');
select ok(not has_column_privilege('authenticated','public.users','ratingaverage','UPDATE'),'users cannot modify their aggregate rating');
select ok(not has_column_privilege('authenticated','public.users','ratingcount','UPDATE'),'users cannot modify their rating count');
select ok(not has_column_privilege('authenticated','public.users','walletrestricted','UPDATE'),'users cannot remove wallet restrictions');
select ok(not has_column_privilege('authenticated','public.users','locationpoint','UPDATE'),'users cannot forge dispatch geospatial coordinates');
select ok(not has_column_privilege('authenticated','public.users','locationupdatedat','UPDATE'),'users cannot forge location freshness');
select ok(not has_column_privilege('authenticated','public.users','issuspended','UPDATE'),'users cannot clear their suspension');
select ok(not has_column_privilege('authenticated','public.users','isbanned','UPDATE'),'users cannot clear their ban');
select ok(not has_column_privilege('authenticated','public.users','verificationstatus','UPDATE'),'users cannot self-assert identity verification');
select ok(not has_column_privilege('authenticated','public.users','accountdeletedat','UPDATE'),'users cannot change account deletion state');
select ok(not has_column_privilege('authenticated','public.users','status','UPDATE'),'users cannot directly change dispatch availability');
select ok(not has_column_privilege('authenticated','public.users','balance','UPDATE'),'users cannot write wallet balance');
select ok(not has_column_privilege('authenticated','public.users','earningsbalance','UPDATE'),'users cannot write cleaner earnings');
select ok(not has_column_privilege('authenticated','public.users','commissionbalance','UPDATE'),'users cannot write commission credit');
select ok(not has_column_privilege('authenticated','public.users','commissionowed','UPDATE'),'users cannot modify commission debt');
select ok(not has_column_privilege('authenticated','public.users','verificationlevel','UPDATE'),'users cannot self-assert verification level');
select ok(not has_column_privilege('authenticated','public.users','accounttype','UPDATE'),'users cannot change account ownership type');
select ok(not has_column_privilege('authenticated','public.users','organizationid','UPDATE'),'users cannot attach themselves to an organization');
select ok(not has_column_privilege('authenticated','public.users','email','UPDATE'),'users cannot desynchronize profile email from auth');
select ok(not has_column_privilege('authenticated','public.users','phone','UPDATE'),'users cannot desynchronize profile phone from auth');
select ok(not has_column_privilege('authenticated','public.users','expopushtoken','UPDATE'),'users cannot bypass device-scoped push token registration');
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
select has_column('public','jobs','lastmessage','job message previews have a persisted column');
select has_column('public','jobs','lastmessageat','job message previews have a persisted timestamp');
select has_column('public','jobs','cleanerunread','cleaner unread counts have a persisted column');
select has_column('public','jobs','customerunread','customer unread counts have a persisted column');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Participants upload support evidence' and cmd='INSERT' and with_check like '%is_job_participant%'),
  'support evidence uploads are limited to booking participants');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Users remove own support evidence' and cmd='DELETE' and qual like '%is_job_participant%'),
  'support evidence cleanup is limited to its booking participant');

select * from finish();
rollback;
