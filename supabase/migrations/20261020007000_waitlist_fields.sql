alter table public.betaWaitlist add column if not exists phone text;
alter table public.betaWaitlist add column if not exists preferredLanguage text;
alter table public.betaWaitlist add column if not exists status text not null default 'WAITLISTED';
