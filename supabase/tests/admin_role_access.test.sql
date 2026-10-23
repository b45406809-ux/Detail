begin;
select plan(2);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('3c101e10-38ea-4c31-8661-196ea5c33875','authenticated','authenticated','admin-role-owner@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('bb27b785-d5b9-42e8-bc13-c2ed93d6841a','authenticated','authenticated','admin-role-outsider@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.users(id,email,displayName,role)
values
  ('3c101e10-38ea-4c31-8661-196ea5c33875','admin-role-owner@detail.invalid','Admin Role Owner','ADMIN'),
  ('bb27b785-d5b9-42e8-bc13-c2ed93d6841a','admin-role-outsider@detail.invalid','Admin Role Outsider','CUSTOMER')
on conflict(id) do update set role=excluded.role;
insert into public.adminRoles(userId,elevated,permissions)
values('3c101e10-38ea-4c31-8661-196ea5c33875',false,array['operations.read']);

set local role authenticated;
select set_config('request.jwt.claim.sub','3c101e10-38ea-4c31-8661-196ea5c33875',true);
select is((select count(*)::integer from public.adminRoles where userId='3c101e10-38ea-4c31-8661-196ea5c33875'),1,
  'an administrator can read their own permission snapshot');
select set_config('request.jwt.claim.sub','bb27b785-d5b9-42e8-bc13-c2ed93d6841a',true);
select is((select count(*)::integer from public.adminRoles where userId='3c101e10-38ea-4c31-8661-196ea5c33875'),0,
  'another account cannot read the administrator permission snapshot');
reset role;

select * from finish();
rollback;
