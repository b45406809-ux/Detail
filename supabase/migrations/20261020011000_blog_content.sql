create table if not exists public.blogposts (
  id text primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 180),
  excerpt text not null check (length(excerpt) between 1 and 300),
  content text not null check (length(content) between 1 and 30000),
  keywords text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED')),
  publishedat timestamptz,
  updatedat timestamptz not null default now(),
  createdby uuid references auth.users(id) on delete set null,
  createdat timestamptz not null default now()
);

create index if not exists blogposts_publication_idx on public.blogposts(status, publishedat desc);
alter table public.blogposts enable row level security;
drop policy if exists "Published articles are public" on public.blogposts;
create policy "Published articles are public" on public.blogposts for select to anon, authenticated using (status = 'PUBLISHED');
grant select on public.blogposts to anon, authenticated;
revoke insert, update, delete on public.blogposts from anon, authenticated;
