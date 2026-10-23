begin;
select plan(5);

select ok(
  has_table_privilege('service_role','public.paynowproviderevents','INSERT'),
  'the verified webhook service can persist provider events'
);
select ok(
  not has_table_privilege('anon','public.paynowproviderevents','SELECT')
  and not has_table_privilege('authenticated','public.paynowproviderevents','SELECT'),
  'clients cannot read provider callback contents'
);
select ok(
  has_column_privilege('service_role','public.paynowproviderevents','processingstatus','UPDATE'),
  'the webhook can advance event processing state'
);
select ok(
  not has_column_privilege('service_role','public.paynowproviderevents','reference','UPDATE')
  and not has_column_privilege('service_role','public.paynowproviderevents','amount','UPDATE'),
  'provider event facts remain immutable after insertion'
);
select ok(
  not has_table_privilege('service_role','public.paynowproviderevents','DELETE'),
  'provider events cannot be deleted by the webhook service'
);

select * from finish();
rollback;
