begin;
select plan(3);

insert into public.authRateLimits(key,count,windowStartedAt,expiresAt)
values
  ('rate-limit-cleanup-expired',3,now()-interval '2 hours',now()-interval '1 hour'),
  ('rate-limit-cleanup-live',2,now(),now()+interval '1 hour');

select is(public.cleanup_expired_rate_limits(100),1,'cleanup removes expired counters in a bounded batch');
select ok(not exists(select 1 from public.authRateLimits where key='rate-limit-cleanup-expired'),'expired counter is removed');
select ok(exists(select 1 from public.authRateLimits where key='rate-limit-cleanup-live'),'active counter is preserved');

select * from finish();
rollback;
