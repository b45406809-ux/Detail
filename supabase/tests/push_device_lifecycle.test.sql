begin;
select plan(9);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('65e2589a-ddb1-4ffb-b4cb-63d8a0bc669a','authenticated','authenticated','push-device-owner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('c92062eb-ebbb-4bb4-8720-43e3bb12be55','authenticated','authenticated','push-device-next-owner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

insert into public.users(id,email,displayName,role,status,verificationStatus)
values
  ('65e2589a-ddb1-4ffb-b4cb-63d8a0bc669a','push-device-owner@detail.invalid','Push Owner','CUSTOMER','OFFLINE','NOT_STARTED'),
  ('c92062eb-ebbb-4bb4-8720-43e3bb12be55','push-device-next-owner@detail.invalid','Next Owner','CUSTOMER','OFFLINE','NOT_STARTED')
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role=excluded.role;

select ok(public.register_push_device('65e2589a-ddb1-4ffb-b4cb-63d8a0bc669a','ExponentPushToken[deviceOneToken]'),
  'one authenticated account can register its first device token');
select ok(public.register_push_device('65e2589a-ddb1-4ffb-b4cb-63d8a0bc669a','ExponentPushToken[deviceTwoToken]'),
  'the same account can register a second device token');
select ok((public.create_notification_outbox('65e2589a-ddb1-4ffb-b4cb-63d8a0bc669a','Test','Two devices','BOOKING_CREATED',null,'{}'::jsonb)->>'hasDeliveries')::boolean,
  'notifications enqueue for the registered devices');
select is(
  (select count(*)::integer from public.notificationDeliveries where userId='65e2589a-ddb1-4ffb-b4cb-63d8a0bc669a' and provider='EXPO'),
  2,
  'one notification creates a delivery for each registered device'
);
select is(
  (select payload->'data'->>'type' from public.notificationDeliveries where userId='65e2589a-ddb1-4ffb-b4cb-63d8a0bc669a' and provider='EXPO' limit 1),
  'BOOKING_CREATED',
  'push delivery data preserves the notification type for app routing'
);
select ok(public.unregister_push_device('65e2589a-ddb1-4ffb-b4cb-63d8a0bc669a','ExponentPushToken[deviceOneToken]'),
  'logout can revoke only the current device token');
select ok(public.register_push_device('c92062eb-ebbb-4bb4-8720-43e3bb12be55','ExponentPushToken[deviceOneToken]'),
  'signing into another account transfers that device token');
select is(
  (select count(*)::integer from public.userPushDevices where userId='65e2589a-ddb1-4ffb-b4cb-63d8a0bc669a'),
  1,
  'the original account retains its other device registration'
);
select is(
  (select userId from public.userPushDevices where expoPushToken='ExponentPushToken[deviceOneToken]'),
  'c92062eb-ebbb-4bb4-8720-43e3bb12be55'::uuid,
  'a device token cannot remain attached to the previous account'
);

select * from finish();
rollback;
