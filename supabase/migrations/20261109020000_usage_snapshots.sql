create table if not exists public.usage_snapshots (
  captured_date date primary key,
  captured_at timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  provider_meters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.usage_snapshots enable row level security;
revoke all on table public.usage_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.usage_snapshots to service_role;

comment on table public.usage_snapshots is 'Daily provider usage snapshots; contains aggregate operational metrics only.';
