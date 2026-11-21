create table if not exists public.usage_alert_milestones (
  provider text not null,
  milestone integer not null check (milestone between 10 and 100 and milestone % 10 = 0),
  usage_month date not null,
  sent_at timestamptz not null default now(),
  primary key (provider, milestone, usage_month)
);

alter table public.usage_alert_milestones enable row level security;
revoke all on public.usage_alert_milestones from public, anon, authenticated;
grant select, insert, delete on public.usage_alert_milestones to service_role;
