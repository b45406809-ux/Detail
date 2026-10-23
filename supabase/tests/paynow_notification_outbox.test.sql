begin;
select plan(3);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('8a9e8ad1-1519-40e7-a30a-68b8494e6e65','authenticated','authenticated','paynow-outbox@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now())
on conflict(id) do nothing;
insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete)
values('8a9e8ad1-1519-40e7-a30a-68b8494e6e65','paynow-outbox@detail.invalid','Paynow Outbox','CUSTOMER','OFFLINE','NOT_STARTED',false,false)
on conflict(id) do nothing;
insert into public.userPushDevices(expoPushToken,userId) values
  ('ExponentPushToken[paynow-outbox-device-a]','8a9e8ad1-1519-40e7-a30a-68b8494e6e65'),
  ('ExponentPushToken[paynow-outbox-device-b]','8a9e8ad1-1519-40e7-a30a-68b8494e6e65')
on conflict(expoPushToken) do nothing;

select ok((public.create_notification_outbox_with_id('e4500d13-f841-5f0f-b25f-92875c29cc80','8a9e8ad1-1519-40e7-a30a-68b8494e6e65',
  'Paynow released','Payment is complete','PAYMENT_PAID',null,'{"paymentStatus":"PAID"}'::jsonb)->>'duplicate')::boolean=false,
  'the first payment callback creates its notification and delivery outbox');
select ok((public.create_notification_outbox_with_id('e4500d13-f841-5f0f-b25f-92875c29cc80','8a9e8ad1-1519-40e7-a30a-68b8494e6e65',
  'Paynow released','Payment is complete','PAYMENT_PAID',null,'{"paymentStatus":"PAID"}'::jsonb)->>'duplicate')::boolean,
  'replaying the callback returns the existing notification');
select is((select count(*)::integer from public.notificationDeliveries where notificationId='e4500d13-f841-5f0f-b25f-92875c29cc80'),
  2,'callback replay does not duplicate per-device deliveries');

select * from finish();
rollback;
