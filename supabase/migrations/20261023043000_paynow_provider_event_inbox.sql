-- Preserve every verified Paynow callback before mutating payment state. The
-- event key is a digest of the exact signed form body, so callback retries are
-- idempotent while differently encoded provider events remain auditable.
create table public.paynowProviderEvents (
  eventId text primary key check (eventId ~ '^[0-9a-f]{64}$'),
  reference text not null,
  providerStatus text not null,
  amount numeric(12,2) not null check (amount > 0),
  processingStatus text not null default 'RECEIVED'
    check (processingStatus in ('RECEIVED','APPLIED','FAILED')),
  receivedAt timestamptz not null default now(),
  processedAt timestamptz,
  attemptCount integer not null default 0 check (attemptCount >= 0),
  lastError text,
  data jsonb not null default '{}'::jsonb
);

create index paynow_provider_events_status_received_idx
  on public.paynowProviderEvents(processingStatus, receivedAt)
  where processingStatus <> 'APPLIED';

alter table public.paynowProviderEvents enable row level security;
revoke all on public.paynowProviderEvents from public, anon, authenticated, service_role;
grant select, insert on public.paynowProviderEvents to service_role;
grant update (processingStatus, processedAt, attemptCount, lastError)
  on public.paynowProviderEvents to service_role;
