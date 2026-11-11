begin;

select plan(25);

select has_table('public', 'userblocks', 'conversation blocks have a dedicated table');
select ok((select relrowsecurity from pg_class where oid='public.userBlocks'::regclass), 'block records have row-level security enabled');
select ok(not has_table_privilege('anon','public.userBlocks','SELECT'), 'anonymous users cannot read block records');
select ok(not has_table_privilege('authenticated','public.userBlocks','SELECT'), 'app users cannot read block records directly');
select ok(not has_table_privilege('authenticated','public.userBlocks','INSERT'), 'app users can create blocks only through the participant-checked RPC');
select ok(has_table_privilege('service_role','public.userBlocks','SELECT'), 'trusted Edge Functions can enforce blocks before media and call setup');
select ok(has_table_privilege('service_role','public.userBlocks','DELETE'), 'trusted account deletion can remove block records');
select ok(not has_function_privilege('anon','public.get_message_safety_state(uuid)','EXECUTE'), 'anonymous users cannot inspect conversation safety state');
select ok(has_function_privilege('authenticated','public.get_message_safety_state(uuid)','EXECUTE'), 'signed-in participants can inspect their own conversation safety state');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4','authenticated','authenticated','safety-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('337d52fe-2bfd-441c-8bb7-e0140ee21ab9','authenticated','authenticated','safety-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('a11a4010-8dd2-4ff2-a8da-731db1111954','authenticated','authenticated','safety-bystander@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

insert into public.users(id,email,displayName,role)
values
  ('06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4','safety-customer@detail.invalid','Safety Customer','CUSTOMER'),
  ('337d52fe-2bfd-441c-8bb7-e0140ee21ab9','safety-cleaner@detail.invalid','Safety Cleaner','CLEANER'),
  ('a11a4010-8dd2-4ff2-a8da-731db1111954','safety-bystander@detail.invalid','Safety Bystander','CUSTOMER')
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role=excluded.role;

insert into public.jobs(id,customerId,cleanerId,serviceType,status)
values('508d398f-5481-402f-807e-c730a62fdf80','06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4','337d52fe-2bfd-441c-8bb7-e0140ee21ab9','House clean','ASSIGNED');

select set_config('request.jwt.claim.sub','06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4',true);
select is(
  public.get_message_safety_state('508d398f-5481-402f-807e-c730a62fdf80'),
  '{"blockedByMe":false,"blockedMe":false}'::jsonb,
  'a participant sees only the directional block state for their booking'
);
select ok(public.send_job_message('508d398f-5481-402f-807e-c730a62fdf80','Hello, I will be there at 10.',null,'customer-message-1') is not null, 'a participant can send acceptable text');
select is(
  public.send_job_message('508d398f-5481-402f-807e-c730a62fdf80','Hello, I will be there at 10.',null,'customer-message-1'),
  (select id from public.messages where senderId='06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4' and idempotencyKey='customer-message-1'),
  'retrying an accepted message returns its existing row'
);
select is((select count(*)::integer from public.messages where jobId='508d398f-5481-402f-807e-c730a62fdf80'),1,'an idempotent retry does not create a duplicate');
select ok(public.block_user('508d398f-5481-402f-807e-c730a62fdf80','337d52fe-2bfd-441c-8bb7-e0140ee21ab9'), 'a booking participant can block the other participant');
select is(
  public.get_message_safety_state('508d398f-5481-402f-807e-c730a62fdf80'),
  '{"blockedByMe":true,"blockedMe":false}'::jsonb,
  'block state identifies the blocker without exposing unrelated block records'
);
select throws_ok(
  $$select public.send_job_message('508d398f-5481-402f-807e-c730a62fdf80','Please call me',null,'customer-message-2')$$,
  'P0001','MESSAGING_BLOCKED','a blocked participant cannot send new messages'
);

select set_config('request.jwt.claim.sub','337d52fe-2bfd-441c-8bb7-e0140ee21ab9',true);
select is(
  public.get_message_safety_state('508d398f-5481-402f-807e-c730a62fdf80'),
  '{"blockedByMe":false,"blockedMe":true}'::jsonb,
  'the other participant sees that they were blocked'
);
select throws_ok(
  $$select public.send_job_message('508d398f-5481-402f-807e-c730a62fdf80','Reply',null,'cleaner-message-1')$$,
  'P0001','MESSAGING_BLOCKED','a participant who was blocked cannot send new messages'
);

select set_config('request.jwt.claim.sub','a11a4010-8dd2-4ff2-a8da-731db1111954',true);
select throws_ok(
  $$select public.block_user('508d398f-5481-402f-807e-c730a62fdf80','06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4')$$,
  'P0001','Only a participant in this booking can block the other participant','a bystander cannot block users through another booking'
);
select throws_ok(
  $$select public.get_message_safety_state('508d398f-5481-402f-807e-c730a62fdf80')$$,
  'P0001','This conversation is unavailable','a bystander cannot inspect a booking conversation safety state'
);

select set_config('request.jwt.claim.sub','06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4',true);
select ok(public.unblock_user('337d52fe-2bfd-441c-8bb7-e0140ee21ab9'), 'a participant can remove their own block');
select is(
  public.get_message_safety_state('508d398f-5481-402f-807e-c730a62fdf80'),
  '{"blockedByMe":false,"blockedMe":false}'::jsonb,
  'unblocking restores the conversation when the other participant has not blocked back'
);
select throws_ok(
  $$select public.send_job_message('508d398f-5481-402f-807e-c730a62fdf80','You are a bitch',null,'customer-message-3')$$,
  'P0001','CHAT_CONTENT_FILTERED','common abusive language is rejected before storage'
);
select ok(public.chat_message_is_allowed('Please arrive at 10.'), 'ordinary booking coordination passes the language screen');
select is((select count(*)::integer from public.messages where jobId='508d398f-5481-402f-807e-c730a62fdf80'),1,'rejected abusive text is not persisted');

select * from finish();
rollback;
