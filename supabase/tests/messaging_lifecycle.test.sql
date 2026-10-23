begin;

select plan(8);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4','authenticated','authenticated','message-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('337d52fe-2bfd-441c-8bb7-e0140ee21ab9','authenticated','authenticated','message-cleaner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

insert into public.users(id,email,displayName,role)
values
  ('06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4','message-customer@detail.invalid','Message Customer','CUSTOMER'),
  ('337d52fe-2bfd-441c-8bb7-e0140ee21ab9','message-cleaner@detail.invalid','Message Cleaner','CLEANER')
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role=excluded.role;

insert into public.jobs(id,customerId,cleanerId,serviceType,status)
values('508d398f-5481-402f-807e-c730a62fdf80','06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4','337d52fe-2bfd-441c-8bb7-e0140ee21ab9','House clean','ASSIGNED');

select set_config('request.jwt.claim.sub','06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4',true);
select ok(public.send_job_message('508d398f-5481-402f-807e-c730a62fdf80','Hello cleaner',null) is not null,'a booking participant can send a message');
select is((select lastMessage from public.jobs where id='508d398f-5481-402f-807e-c730a62fdf80'),'Hello cleaner','the booking summary stores the latest message preview');
select is((select cleanerUnread from public.jobs where id='508d398f-5481-402f-807e-c730a62fdf80'),1,'a customer message increments the cleaner unread count');
select is((select customerUnread from public.jobs where id='508d398f-5481-402f-807e-c730a62fdf80'),0,'a customer message clears that sender unread count');

select set_config('request.jwt.claim.sub','337d52fe-2bfd-441c-8bb7-e0140ee21ab9',true);
select public.send_job_message('508d398f-5481-402f-807e-c730a62fdf80','Hello customer',null);
select is((select count(*)::integer from public.messages where jobId='508d398f-5481-402f-807e-c730a62fdf80'),2,'both booking participants messages are durably stored');
select is((select customerUnread from public.jobs where id='508d398f-5481-402f-807e-c730a62fdf80'),1,'a cleaner reply increments the customer unread count');
select is((select cleanerUnread from public.jobs where id='508d398f-5481-402f-807e-c730a62fdf80'),0,'a cleaner reply clears that sender unread count');

select set_config('request.jwt.claim.sub','06a4e1cb-214d-4e5b-b6cb-0d8a8a91d2c4',true);
select public.mark_job_messages_read('508d398f-5481-402f-807e-c730a62fdf80');
select is((select customerUnread from public.jobs where id='508d398f-5481-402f-807e-c730a62fdf80'),0,'opening the thread clears the participant unread count');

select * from finish();
rollback;
