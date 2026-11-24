begin;
select plan(11);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('f994a4ab-a43b-4c26-ae97-225f93422c88','authenticated','authenticated','account-delete-test@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.users(id,email,displayName,role,locationPoint,locationUpdatedAt)
values('f994a4ab-a43b-4c26-ae97-225f93422c88','account-delete-test@detail.invalid','Deletion Test','CUSTOMER',
  extensions.st_setsrid(extensions.st_makepoint(31.03,-17.82),4326)::extensions.geography,now())
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,locationPoint=excluded.locationPoint,locationUpdatedAt=excluded.locationUpdatedAt;

insert into public.jobs(id,customerId,customerName,category,serviceType,description,location,status,paymentStatus,data)
values('0587c8d6-e371-4b8a-9ed6-7d13a35ad2ee','f994a4ab-a43b-4c26-ae97-225f93422c88','Deletion Test','HOUSE','Standard','Private instructions',
  '{"address":"123 Private St","lat":-17.82,"lng":31.03}'::jsonb,'COMPLETED','SETTLED',
  '{"location":{"address":"123 Private St"},"description":"Private instructions"}'::jsonb);

insert into public.payoutRequests(cleanerId,amount,method,accountName,accountNumber,status)
values('f994a4ab-a43b-4c26-ae97-225f93422c88',10,'BANK','Deletion Test','encrypted','APPROVED');
select throws_ok(
  $$select public.close_account('f994a4ab-a43b-4c26-ae97-225f93422c88')$$,
  'P0001',
  'Pending or approved payouts must be settled before account deletion',
  'approved payout blocks account deletion'
);
delete from public.payoutRequests where cleanerId='f994a4ab-a43b-4c26-ae97-225f93422c88';

insert into public.payments(id,customerId,jobId,provider,amount,status)
values('account-delete-authorized','f994a4ab-a43b-4c26-ae97-225f93422c88','0587c8d6-e371-4b8a-9ed6-7d13a35ad2ee','PAYNOW',10,'AUTHORIZED');
select throws_ok(
  $$select public.close_account('f994a4ab-a43b-4c26-ae97-225f93422c88')$$,
  'P0001',
  'Outstanding payment records must be resolved before account deletion',
  'authorized provider payment blocks account deletion'
);
delete from public.payments where id='account-delete-authorized';

insert into public.payments(id,customerId,reference,amount,status,createdAt,data) values
  ('account-delete-ecocash','f994a4ab-a43b-4c26-ae97-225f93422c88',
    'account-delete-ecocash',1,'PENDING',now(),'{"type":"wallet_topup","channel":"ECOCASH"}'),
  ('account-delete-expired','f994a4ab-a43b-4c26-ae97-225f93422c88',
    'account-delete-expired',1,'INITIATING',now()-interval '31 minutes','{"type":"wallet_topup","channel":"ECOCASH"}');
select is(public.wallet_attempt_status(p),'EXPIRED','old EcoCash requests expire in Detail')
  from public.payments p where p.id='account-delete-expired';
select throws_ok(
  $$select public.close_account('f994a4ab-a43b-4c26-ae97-225f93422c88')$$,
  'P0001','Outstanding payment records must be resolved before account deletion',
  'an active EcoCash request blocks closure until cancelled or expired'
);
select is(public.cancel_ecocash_wallet_attempt('f994a4ab-a43b-4c26-ae97-225f93422c88','account-delete-ecocash'),
  'APP_CANCELLED','the customer can cancel the request in Detail');
select is((select status from public.payments where id='account-delete-ecocash'),
  'PENDING','the provider status remains available for reconciliation');

select ok(public.close_account('f994a4ab-a43b-4c26-ae97-225f93422c88'),'eligible account can be anonymized');
select ok((select locationPoint is null and locationUpdatedAt is null from public.users where id='f994a4ab-a43b-4c26-ae97-225f93422c88'),'precise user location and freshness are erased');
select ok((select location='{}'::jsonb and description='' and data->'location' is null from public.jobs where id='0587c8d6-e371-4b8a-9ed6-7d13a35ad2ee'),'retained booking no longer contains customer address or instructions');
select is(public.apply_paynow_status('account-delete-ecocash','Paid',1)->>'status',
  'PAID','late Paynow confirmation remains recorded after account closure');
select ok(exists(select 1 from public.supportCases where id='late_wallet_payment_account-delete-ecocash')
  and (select balance=0 from public.users where id='f994a4ab-a43b-4c26-ae97-225f93422c88'),
  'late payment goes to refund review without crediting a closed wallet');

select * from finish();
rollback;
