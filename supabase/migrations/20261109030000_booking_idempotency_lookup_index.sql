-- create_booking checks retries by actor and operation key. The existing
-- (jobId, idempotencyKey) unique index cannot serve that lookup as bookings grow.
create index if not exists job_events_creation_idempotency_idx
  on public.jobEvents(actorId,idempotencyKey)
  where type='CREATION';
