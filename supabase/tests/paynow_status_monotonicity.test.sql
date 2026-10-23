begin;

select plan(9);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  '0b44ed65-1f77-4a20-a513-a5baad558cb4',
  'authenticated','authenticated','paynow-status-test@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()
);

insert into public.users(id,email,displayName,role)
values('0b44ed65-1f77-4a20-a513-a5baad558cb4','paynow-status-test@detail.invalid','Paynow Test Customer','CUSTOMER')
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role='CUSTOMER';

insert into public.jobs(id,customerId,serviceType,status,paymentStatus)
values('7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09214','0b44ed65-1f77-4a20-a513-a5baad558cb4','House clean','PENDING','DELIVERED');

insert into public.payments(id,jobId,customerId,amount,status,reference)
values('paynow-status-test','7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09214','0b44ed65-1f77-4a20-a513-a5baad558cb4',25,'DELIVERED','paynow-status-test-ref');

insert into public.jobs(id,customerId,serviceType,status,paymentStatus)
values
 ('7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09215','0b44ed65-1f77-4a20-a513-a5baad558cb4','House clean','PENDING','DISPUTED'),
 ('7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09216','0b44ed65-1f77-4a20-a513-a5baad558cb4','House clean','PENDING','PAID'),
 ('7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09217','0b44ed65-1f77-4a20-a513-a5baad558cb4','House clean','PENDING','REFUNDED');
insert into public.payments(id,jobId,customerId,amount,status,reference)
values
 ('paynow-disputed-test','7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09215','0b44ed65-1f77-4a20-a513-a5baad558cb4',25,'DISPUTED','paynow-disputed-test-ref'),
 ('paynow-paid-test','7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09216','0b44ed65-1f77-4a20-a513-a5baad558cb4',25,'PAID','paynow-paid-test-ref'),
 ('paynow-refunded-test','7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09217','0b44ed65-f6d0-41bd-b2fb-a8e8e1c09214',25,'REFUNDED','paynow-refunded-test-ref');

select is(
  public.apply_paynow_status('paynow-status-test-ref','Awaiting Delivery',25)->>'status',
  'DELIVERED',
  'a delayed escrow callback cannot regress a delivered Paynow booking'
);
select is(
  (select status from public.payments where id='paynow-status-test'),
  'DELIVERED',
  'the payment ledger retains its later provider state'
);
select is(
  (select paymentStatus from public.jobs where id='7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09214'),
  'DELIVERED',
  'the booking retains its later payment state'
);

select is(public.apply_paynow_status('paynow-disputed-test-ref','Awaiting Delivery',25)->>'status','DISPUTED','a delayed escrow callback cannot clear a dispute');
select is((select status from public.payments where id='paynow-disputed-test'),'DISPUTED','the payment ledger retains its dispute hold');
select is((select paymentStatus from public.jobs where id='7cdd0c69-f6d0-41bd-b2fb-a8e8e1c09215'),'DISPUTED','the booking retains its dispute hold');
select is(public.apply_paynow_status('paynow-paid-test-ref','Awaiting Delivery',25)->>'status','PAID','a delayed escrow callback cannot regress a paid booking');
select is((select status from public.payments where id='paynow-paid-test'),'PAID','the payment ledger retains its paid state');
select is(public.apply_paynow_status('paynow-refunded-test-ref','Paid',25)->>'status','REFUNDED','a delayed paid callback cannot reverse a refund');

select * from finish();
rollback;
