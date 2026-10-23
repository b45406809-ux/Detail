begin;

select plan(5);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('c02f770b-d92c-4a44-bb01-ab74e70d17be','authenticated','authenticated','delivery-status-test@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.users(id,email,displayName,role,verificationStatus,cleanerAgreementAccepted)
values('c02f770b-d92c-4a44-bb01-ab74e70d17be','delivery-status-test@detail.invalid','Delivery Test User','CUSTOMER','VERIFIED',true)
on conflict(id) do update set role='CUSTOMER';
insert into public.notifications(id,userId,title,body)
values('287fd6ed-a9cf-4c5e-bc40-bfd27a80ecc8','c02f770b-d92c-4a44-bb01-ab74e70d17be','Test','Test');
insert into public.notificationDeliveries(id,notificationId,userId,provider,destination,payload,status,attempts)
values('ba87250a-e6c6-42c0-a135-461b97f3ba2d','287fd6ed-a9cf-4c5e-bc40-bfd27a80ecc8','c02f770b-d92c-4a44-bb01-ab74e70d17be','TWILIO','+263770000000','{}','PROCESSING',1);
insert into public.notificationDeliveries(id,notificationId,userId,provider,destination,payload,status,attempts)
values('ab8fcacd-aea2-4d1e-a1da-08e44235de99','287fd6ed-a9cf-4c5e-bc40-bfd27a80ecc8','c02f770b-d92c-4a44-bb01-ab74e70d17be','EXPO','ExponentPushToken[test]','{}','PROCESSING',1);

select public.finish_notification_delivery('ab8fcacd-aea2-4d1e-a1da-08e44235de99',true,null,'expo-receipt-test');
select is((select status from public.notificationDeliveries where id='ab8fcacd-aea2-4d1e-a1da-08e44235de99'),'ACCEPTED','provider API acceptance is not reported as delivery');

insert into public.notificationDeliveryCallbacks(providerReceiptId,providerStatus)
values('SM0123456789abcdef0123456789abcdef','delivered');
select is(public.apply_twilio_delivery_status('SM0123456789abcdef0123456789abcdef','delivered',null),false,'callback arriving before the worker stores its receipt is safely retained');
select public.finish_notification_delivery('ba87250a-e6c6-42c0-a135-461b97f3ba2d',true,null,'SM0123456789abcdef0123456789abcdef');
select is((select status from public.notificationDeliveries where id='ba87250a-e6c6-42c0-a135-461b97f3ba2d'),'DELIVERED','delivery state reflects provider confirmation');
select is(public.apply_twilio_delivery_status('SM0123456789abcdef0123456789abcdef','queued',null),false,'late nonterminal callback cannot downgrade a terminal delivery');
select is((select status from public.notificationDeliveries where id='ba87250a-e6c6-42c0-a135-461b97f3ba2d'),'DELIVERED','terminal delivery state remains monotonic');

select * from finish();
rollback;
