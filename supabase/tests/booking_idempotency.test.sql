begin;
select plan(3);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('1b738e32-e846-40da-9dc6-3c7f5dc66231','authenticated','authenticated','booking-idem-one@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('b4aff413-8c74-4b4b-b3b2-d2918f7555ac','authenticated','authenticated','booking-idem-two@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now())
on conflict(id) do nothing;

select is(
  public.create_booking('1b738e32-e846-40da-9dc6-3c7f5dc66231','retry-key',
    '{"category":"HOUSE","serviceType":"Basic house clean","location":{"address":"123 Test Street","lat":-17.8,"lng":31.0},"bookingMode":"SCHEDULED","timePreference":"ASAP","budget":30}'::jsonb),
  public.create_booking('1b738e32-e846-40da-9dc6-3c7f5dc66231','retry-key',
    '{"category":"HOUSE","serviceType":"Basic house clean","location":{"address":"123 Test Street","lat":-17.8,"lng":31.0},"bookingMode":"SCHEDULED","timePreference":"ASAP","budget":30}'::jsonb),
  'a retry by the same customer returns the original booking'
);

select isnt(
  public.create_booking('1b738e32-e846-40da-9dc6-3c7f5dc66231','same-key',
    '{"category":"HOUSE","serviceType":"Basic house clean","location":{"address":"123 Test Street","lat":-17.8,"lng":31.0},"bookingMode":"SCHEDULED","timePreference":"ASAP","budget":30}'::jsonb),
  public.create_booking('b4aff413-8c74-4b4b-b3b2-d2918f7555ac','same-key',
    '{"category":"HOUSE","serviceType":"Basic house clean","location":{"address":"456 Test Street","lat":-17.9,"lng":31.1},"bookingMode":"SCHEDULED","timePreference":"ASAP","budget":30}'::jsonb),
  'identical operation keys remain isolated between customers'
);

select is(
  (select count(*)::integer from public.jobs where customerId='1b738e32-e846-40da-9dc6-3c7f5dc66231'),
  2,
  'one original and one distinct booking exist for the customer'
);

select * from finish();
rollback;
