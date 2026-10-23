alter table public.jobs
  add column if not exists lastMessage text not null default '',
  add column if not exists lastMessageAt timestamptz,
  add column if not exists cleanerUnread integer not null default 0 check (cleanerUnread >= 0),
  add column if not exists customerUnread integer not null default 0 check (customerUnread >= 0);
