begin;
select plan(8);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('3d64d5d2-07cb-4dab-9dde-cb2cc4554231','authenticated','authenticated','paynow-poll@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.users(id,email,displayName,role)
values('3d64d5d2-07cb-4dab-9dde-cb2cc4554231','paynow-poll@detail.invalid','Paynow Poll Customer','CUSTOMER')
on conflict(id) do nothing;
insert into public.jobs(id,customerId,serviceType,status,paymentStatus)
values('d7d8f99a-b1f3-4aaf-9122-c57de004b345','3d64d5d2-07cb-4dab-9dde-cb2cc4554231','House clean','PENDING','DELIVERED');
insert into public.payments(id,jobId,customerId,provider,amount,status,reference)
values('paynow-poll-payment','d7d8f99a-b1f3-4aaf-9122-c57de004b345','3d64d5d2-07cb-4dab-9dde-cb2cc4554231','PAYNOW',25,'DELIVERED','paynow-canonical-reference');
insert into public.paynowPaymentAttempts(reference,paymentId,data)
values('paynow-previous-attempt','paynow-poll-payment','{"attempt":"BOOKING_RETRY"}'::jsonb);

select is(
  public.apply_paynow_provider_poll(repeat('a',64),'paynow-previous-attempt','Awaiting Delivery',25)->>'status',
  'DELIVERED','an authoritative poll for an older attempt resolves to the canonical payment without regressing it'
);
select is(
  (select processingStatus from public.paynowProviderEvents where eventId=repeat('a',64)),
  'APPLIED','a successful poll is retained in the provider event inbox'
);
select ok(
  (public.apply_paynow_provider_poll(repeat('a',64),'paynow-previous-attempt','Awaiting Delivery',25)->>'replayed')::boolean,
  'replaying an already applied poll event returns its stored result'
);
select is(
  (select attemptCount from public.paynowProviderEvents where eventId=repeat('a',64)),
  1,'a completed duplicate does not run the payment transition twice'
);
select is(
  public.apply_paynow_provider_poll(repeat('b',64),'missing-paynow-reference','Paid',25)->>'status',
  'FAILED','an unappliable provider result is reported as failed without losing the event'
);
select is(
  (select processingStatus from public.paynowProviderEvents where eventId=repeat('b',64)),
  'FAILED','failed poll results remain available for reconciliation'
);
select is(
  public.apply_paynow_provider_poll(repeat('b',64),'missing-paynow-reference','Paid',25)->>'status',
  'FAILED','a failed poll event can be retried'
);
select is(
  (select attemptCount from public.paynowProviderEvents where eventId=repeat('b',64)),
  2,'failed poll retries increment the recorded attempt count'
);

select * from finish();
rollback;
