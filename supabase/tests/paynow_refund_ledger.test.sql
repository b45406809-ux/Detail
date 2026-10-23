begin;
select plan(10);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('d88c99a9-1b75-4cde-a1f3-e61fbb323101','authenticated','authenticated','refund-customer@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.users(id,email,displayName,role,status,verificationStatus)
values('d88c99a9-1b75-4cde-a1f3-e61fbb323101','refund-customer@detail.invalid','Refund Customer','CUSTOMER','OFFLINE','NOT_STARTED')
on conflict(id) do nothing;
insert into public.payments(id,customerId,provider,amount,status,reference,data)
values('refund-ledger-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101','PAYNOW',100,'ESCROWED','refund-ledger-reference','{}'::jsonb),
('refund-request-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101','PAYNOW',50,'PAID','refund-request-reference','{}'::jsonb);
select is(public.request_paynow_refund('refund-request-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101',25,'first request','refund-request-key')->>'status','REQUESTED','refund request is durably recorded before provider action');
select is(public.request_paynow_refund('refund-request-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101',25,'retry','refund-request-key')->>'id','refund_refund-request-key','retry returns the same idempotent request');
select throws_ok($$select public.request_paynow_refund('refund-request-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101',25,'duplicate request','refund-request-key-2')$$,'P0001','A refund request is already awaiting provider reconciliation','payment cannot have concurrent unresolved refund requests');
insert into public.paynowrefundtransactions(id,paymentid,amount,status,reason,requestedby)
values('refund-ledger-first','refund-ledger-payment',40,'REQUESTED','test refund','d88c99a9-1b75-4cde-a1f3-e61fbb323101');

select is(public.record_paynow_refund_update('refund-ledger-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101','SUBMITTED',0,'','submitted','refund-submit-1')->>'status','SUBMITTED','requested refund can be marked submitted');
select is(public.record_paynow_refund_update('refund-ledger-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101','CONFIRMED',40,'provider-ref-1','confirmed','refund-confirm-1')->>'status','CONFIRMED','confirmed refund requires a provider reference');
select is((select sum(amount) from public.paynowrefundtransactions where paymentid='refund-ledger-payment' and status='CONFIRMED'),40::numeric,'confirmed totals include only provider-confirmed transactions');
insert into public.paynowrefundtransactions(id,paymentid,amount,status,reason,requestedby)
values('refund-ledger-second','refund-ledger-payment',70,'REQUESTED','second test refund','d88c99a9-1b75-4cde-a1f3-e61fbb323101');
select throws_ok($$select public.record_paynow_refund_update('refund-ledger-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101','CONFIRMED',70,'provider-ref-2','over limit','refund-confirm-2')$$,'P0001','Cumulative refunds cannot exceed the captured payment','cumulative provider-confirmed refunds cannot exceed capture');
select throws_ok($$select public.record_paynow_refund_update('refund-ledger-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101','CONFIRMED',20,'','missing reference','refund-confirm-3')$$,'P0001','A positive confirmed amount and provider reference are required','confirmation cannot be recorded without provider evidence');
select is(public.record_paynow_refund_update('refund-ledger-payment','d88c99a9-1b75-4cde-a1f3-e61fbb323101','FAILED',0,'','provider declined','refund-failed-1')->>'status','FAILED','failed provider action remains distinct from confirmed refunds');
select is((select status from public.paynowrefundtransactions where id='refund-ledger-first'),'CONFIRMED','a completed refund record remains confirmed');

select * from finish();
rollback;
