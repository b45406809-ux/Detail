begin;

select plan(3);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('6e65891e-0b79-4a0e-8a92-4a235c50e0cc','authenticated','authenticated','admin-booking-search@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.users(id,email,displayName,role,verificationStatus,cleanerAgreementAccepted)
values('6e65891e-0b79-4a0e-8a92-4a235c50e0cc','admin-booking-search@detail.invalid','Admin Search Fixture','CUSTOMER','VERIFIED',true)
on conflict(id) do update set role='CUSTOMER';
insert into public.jobs(id,customerId,serviceType,createdAt)
values('aabbccdd-1111-1111-1111-111111111111','6e65891e-0b79-4a0e-8a92-4a235c50e0cc','Search fixture',now());

select is(
  (select count(*)::integer from public.admin_search_booking_ids('aabbccdd',1000) where id='aabbccdd-1111-1111-1111-111111111111'),
  1,
  'partial UUID prefix search returns the matching booking'
);
select is(has_function_privilege('anon','public.admin_search_booking_ids(text,integer)','EXECUTE'),false,'anonymous callers cannot search booking identifiers');
select is(has_function_privilege('service_role','public.admin_search_booking_ids(text,integer)','EXECUTE'),true,'the server can perform authorized dashboard searches');

select * from finish();
rollback;
