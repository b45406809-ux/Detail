create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('CUSTOMER', 'CLEANER', 'ADMIN');
create type public.booking_status as enum ('PENDING', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '', displayName text not null default '', photoURL text not null default '',
  role public.user_role not null default 'CUSTOMER', accountType text not null default 'INDIVIDUAL' check (accountType in ('INDIVIDUAL','ORGANIZATION')),
  organizationId uuid, balance numeric(12,2) not null default 0 check (balance >= 0),
  earningsBalance numeric(12,2) not null default 0 check (earningsBalance >= 0), commissionBalance numeric(12,2) not null default 0 check (commissionBalance >= 0), commissionOwed numeric(12,2) not null default 0,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','BUSY','OFFLINE')),
  hasAgreedToTerms boolean not null default false, cleanerAgreementAccepted boolean not null default false, cleanerOnboardingComplete boolean not null default false,
  hasCompletedProfile boolean not null default false, hasSetupPermissions boolean not null default false, isSuspended boolean not null default false, isBanned boolean not null default false,
  verificationStatus text not null default 'NOT_STARTED', verificationLevel smallint not null default 1,
  serviceCategories text[] not null default '{}', serviceRadiusKm numeric(6,2), experienceYears smallint, address text, serviceArea text, phone text, location jsonb,
  jobsCompleted integer not null default 0, ratingAverage numeric(4,2) not null default 0, ratingCount integer not null default 0, responseTimeAverage numeric(10,2) not null default 0,
  expoPushToken text, createdAt timestamptz not null default now(), updatedAt timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(), ownerId uuid not null references public.users(id), name text not null,
  registrationNumber text, phone text, country text, city text, createdAt timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
alter table public.users add constraint users_organization_fk foreign key (organizationId) references public.organizations(id) on delete set null;

create table public.organizationMembers (
  id uuid primary key default gen_random_uuid(), organizationId uuid not null references public.organizations(id) on delete cascade,
  userId uuid not null references public.users(id) on delete cascade, role text not null default 'CLEANER', status text not null default 'ACTIVE',
  createdAt timestamptz not null default now(), unique (organizationId, userId)
);
create table public.organizationInvites (
  id uuid primary key default gen_random_uuid(), organizationId uuid not null references public.organizations(id) on delete cascade,
  email text not null, codeHash text not null unique, expiresAt timestamptz not null, acceptedBy uuid references public.users(id),
  createdAt timestamptz not null default now(), createdBy uuid not null references public.users(id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(), customerId uuid not null references public.users(id), cleanerId uuid references public.users(id),
  customerName text, customerPhoto text, customerPhone text, cleanerName text, cleanerPhoto text, cleanerPhone text, cleanerRating numeric(4,2),
  category text, serviceType text not null default '', checklist jsonb, description text not null default '', location jsonb not null default '{}'::jsonb,
  scheduledTime text, scheduledDateTime timestamptz, timePreference text, status public.booking_status not null default 'PENDING', pricingStrategy text,
  budget numeric(12,2), price numeric(12,2), photos text[] not null default '{}', completionPhotos text[] not null default '{}',
  biddingExpiresAt timestamptz, reminderSent boolean not null default false, estimatedDuration integer, cleanerLocation jsonb, cleanerLocationUpdatedAt timestamptz,
  paidAt timestamptz, paymentMethod text, paymentStatus text, earnings jsonb, rating numeric(4,2), ratedAt timestamptz, isFavoriteRebook boolean not null default false,
  createdAt timestamptz not null default now(), updatedAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);
create table public.openJobs (
  jobId uuid primary key references public.jobs(id) on delete cascade, status public.booking_status not null default 'PENDING', category text,
  serviceType text not null default '', budget numeric(12,2), biddingExpiresAt timestamptz, customerId uuid not null references public.users(id),
  createdAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);
create table public.bids (
  id uuid primary key default gen_random_uuid(), jobId uuid not null references public.jobs(id) on delete cascade, cleanerId uuid not null references public.users(id),
  cleanerName text, cleanerPhoto text, cleanerRating numeric(4,2), cleanerReviewCount integer, cleanerJobsCompleted integer, cleanerEliteVerified boolean,
  bidPrice numeric(12,2) not null check (bidPrice > 0), estimatedArrival integer,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED','COUNTERED')), message text, history jsonb not null default '[]'::jsonb,
  createdAt timestamptz not null default now(), updatedAt timestamptz not null default now()
);
create table public.jobEvents (
  id uuid primary key default gen_random_uuid(), jobId uuid not null references public.jobs(id) on delete cascade, actorId uuid references public.users(id), actorRole text,
  type text not null, previousState text, newState text, idempotencyKey text not null, reason text, createdAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb,
  unique(jobId, idempotencyKey)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), jobId uuid not null references public.jobs(id) on delete cascade, senderId uuid not null references public.users(id),
  senderName text, text text not null default '', imageUrl text, read boolean not null default false, createdAt timestamptz not null default now()
);
create table public.favorites (
  id uuid primary key default gen_random_uuid(), customerId uuid not null references public.users(id) on delete cascade,
  cleanerId uuid not null references public.users(id) on delete cascade, cleanerName text, cleanerPhoto text, createdAt timestamptz not null default now(), unique(customerId, cleanerId)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), userId uuid not null references public.users(id) on delete cascade,
  title text not null default '', body text not null default '', type text not null default 'SYSTEM', jobId uuid references public.jobs(id) on delete set null,
  read boolean not null default false, createdAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), jobId uuid not null unique references public.jobs(id), customerId uuid not null references public.users(id),
  cleanerId uuid not null references public.users(id), rating smallint not null check (rating between 1 and 5), comment text, createdAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);
create table public.disputes (
  id uuid primary key default gen_random_uuid(), jobId uuid not null references public.jobs(id), customerId uuid not null references public.users(id),
  cleanerId uuid references public.users(id), status text not null default 'OPEN', reason text not null default '', evidence text[] not null default '{}', resolution text,
  resolvedBy uuid references public.users(id), createdAt timestamptz not null default now(), resolvedAt timestamptz, data jsonb not null default '{}'::jsonb
);
create table public.reviewCases (
  id text primary key, jobId uuid references public.jobs(id), customerId uuid references public.users(id), cleanerId uuid references public.users(id), reporterId uuid references public.users(id),
  status text not null default 'ADMIN_REVIEW', reason text, problemDescription text, evidence text[] not null default '{}', createdAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);

create table public.payments (
  id text primary key, jobId uuid references public.jobs(id), customerId uuid not null references public.users(id), cleanerId uuid references public.users(id),
  provider text not null default 'PAYNOW', reference text unique, pollUrl text, redirectUrl text, amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD', status text not null default 'PENDING', providerStatus text, idempotencyKey text unique,
  createdAt timestamptz not null default now(), updatedAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);
create table public.payoutRequests (
  id uuid primary key default gen_random_uuid(), cleanerId uuid not null references public.users(id), amount numeric(12,2) not null check (amount > 0),
  method text not null, accountName text not null, accountNumber text not null, status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','PAID')),
  transferReference text, settledBy uuid references public.users(id), createdAt timestamptz not null default now(), settledAt timestamptz, data jsonb not null default '{}'::jsonb
);
create table public.walletTransactions (
  id text primary key default gen_random_uuid()::text, userId uuid not null references public.users(id), jobId uuid references public.jobs(id), payoutRequestId uuid references public.payoutRequests(id),
  paymentId text references public.payments(id), type text not null check (type in ('CREDIT','DEBIT')), amount numeric(12,2) not null check (amount > 0),
  balanceType text not null default 'GENERAL', status text not null default 'COMPLETED', description text not null default '', idempotencyKey text unique,
  createdAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);
create table public.platformTransactions (
  id text primary key default gen_random_uuid()::text, jobId uuid references public.jobs(id), paymentId text references public.payments(id),
  type text not null, amount numeric(12,2) not null, status text not null default 'COMPLETED', createdAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);

create table public.adminRoles (userId uuid primary key references public.users(id) on delete cascade, elevated boolean not null default false, permissions text[] not null default '{}', createdAt timestamptz not null default now());
create table public.adminInvites (
  id uuid primary key default gen_random_uuid(), email text not null, tokenHash text not null unique, permissions text[] not null default '{}', elevated boolean not null default false,
  status text not null default 'PENDING', createdBy uuid not null references public.users(id), createdAt timestamptz not null default now(), expiresAt timestamptz not null
);
create table public.adminAuditEvents (
  id text primary key default gen_random_uuid()::text, action text not null, actorId uuid references public.users(id), targetId text, reason text, amount numeric(12,2),
  createdAt timestamptz not null default now(), immutable boolean not null default true, data jsonb not null default '{}'::jsonb
);
create table public.configuration (key text primary key, value jsonb not null default '{}'::jsonb, updatedBy uuid references public.users(id), updatedAt timestamptz not null default now());
create table public.betaWaitlist (
  id uuid primary key default gen_random_uuid(), email text not null, fullName text not null, participantType text not null, serviceInterest text not null,
  country text, city text, area text, marketingEmailPermission text not null default 'NO', marketingConsent jsonb not null default '{}'::jsonb,
  unsubscribeToken text unique, createdAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);
create table public.marketingCampaigns (
  id text primary key, subject text not null, message text not null, status text not null default 'PENDING', recipientCount integer not null default 0,
  createdBy uuid references public.users(id), createdAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);
create table public.legacyAuthMappings (
  firebaseUid text primary key, supabaseUid uuid not null unique references auth.users(id) on delete cascade, recoveryRequired boolean not null default true, createdAt timestamptz not null default now()
);
create table public.privateKyc (
  userId uuid primary key references public.users(id) on delete cascade, provider text not null default 'didit', sessionId text, sessionUrl text,
  status text not null default 'Not started', consentedAt timestamptz, updatedAt timestamptz not null default now(), data jsonb not null default '{}'::jsonb
);
create table public.authRateLimits (key text primary key, count integer not null default 0, windowStartedAt timestamptz not null default now(), expiresAt timestamptz not null);

create index jobs_customer_created_idx on public.jobs (customerId, createdAt desc);
create index jobs_cleaner_created_idx on public.jobs (cleanerId, createdAt desc);
create index jobs_open_feed_idx on public.openJobs (status, createdAt desc, biddingExpiresAt);
create index bids_job_status_created_idx on public.bids (jobId, status, createdAt desc);
create index messages_job_created_idx on public.messages (jobId, createdAt);
create index notifications_user_created_idx on public.notifications (userId, createdAt desc);
create index transactions_user_created_idx on public.walletTransactions (userId, createdAt desc);
create index payouts_status_created_idx on public.payoutRequests (status, createdAt);
create index beta_waitlist_marketing_idx on public.betaWaitlist (marketingEmailPermission, createdAt);

create function public.is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.adminRoles where userId = auth.uid()) $$;
create function public.is_job_participant(job_id uuid) returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.jobs where id = job_id and (customerId = auth.uid() or cleanerId = auth.uid())) $$;
create function public.is_organization_member(organization_id uuid) returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.organizationMembers where organizationId = organization_id and userId = auth.uid()) $$;
create function public.owns_organization(organization_id uuid) returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.organizations where id = organization_id and ownerId = auth.uid()) $$;

create function public.protect_user_financial_fields() returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.balance := old.balance;
    new.earningsBalance := old.earningsBalance;
    new.commissionBalance := old.commissionBalance;
    new.commissionOwed := old.commissionOwed;
    new.verificationStatus := old.verificationStatus;
    new.verificationLevel := old.verificationLevel;
    new.isSuspended := old.isSuspended;
    new.isBanned := old.isBanned;
    new.role := old.role;
    new.accountType := old.accountType;
    new.organizationId := old.organizationId;
    new.cleanerAgreementAccepted := old.cleanerAgreementAccepted;
    if old.role <> 'CLEANER' or old.verificationStatus <> 'VERIFIED' or not old.cleanerAgreementAccepted then
      new.status := old.status;
    end if;
  end if;
  new.updatedAt := now();
  return new;
end;
$$;
create trigger users_protect_sensitive before update on public.users for each row execute function public.protect_user_financial_fields();

create function public.on_auth_user_created() returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users(id, email, displayName, photoURL, hasAgreedToTerms)
  values(new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'displayName',''), coalesce(new.raw_user_meta_data->>'avatar_url',''), coalesce(new.raw_user_meta_data->>'termsAccepted','false') = 'true')
  on conflict(id) do update set email = excluded.email;
  return new;
end;
$$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.on_auth_user_created();

do $$
declare table_name text;
begin
  foreach table_name in array array['users','organizations','organizationMembers','organizationInvites','jobs','openJobs','bids','jobEvents','messages','favorites','notifications','reviews','disputes','reviewCases','payments','payoutRequests','walletTransactions','platformTransactions','adminRoles','adminInvites','adminAuditEvents','configuration','betaWaitlist','marketingCampaigns','legacyAuthMappings','privateKyc','authRateLimits'] loop
    -- CREATE TABLE used unquoted identifiers, so PostgreSQL stored camelCase
    -- table declarations in lowercase. %I quotes exactly; normalize first.
    execute format('alter table public.%I enable row level security', lower(table_name));
  end loop;
end;
$$;

create policy "Users read own and verified cleaner profiles" on public.users for select to authenticated
using (id = auth.uid() or (role = 'CLEANER' and verificationStatus = 'VERIFIED') or public.is_admin());
create policy "Users update own safe fields" on public.users for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "Organization readers" on public.organizations for select to authenticated
using (ownerId = auth.uid() or public.is_organization_member(id) or public.is_admin());
create policy "Organization owners manage" on public.organizations for all to authenticated using (ownerId = auth.uid() or public.is_admin()) with check (ownerId = auth.uid() or public.is_admin());
create policy "Organization memberships readers" on public.organizationMembers for select to authenticated
using (userId = auth.uid() or public.owns_organization(organizationId) or public.is_admin());

create policy "Job participant and eligible cleaner read" on public.jobs for select to authenticated
using (customerId = auth.uid() or cleanerId = auth.uid() or public.is_admin() or (status = 'PENDING' and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'CLEANER' and u.verificationStatus = 'VERIFIED' and u.cleanerAgreementAccepted)));
create policy "Customers create jobs" on public.jobs for insert to authenticated with check (customerId = auth.uid());
create policy "Participants update jobs" on public.jobs for update to authenticated using (customerId = auth.uid() or cleanerId = auth.uid() or public.is_admin()) with check (customerId = auth.uid() or cleanerId = auth.uid() or public.is_admin());
create policy "Verified cleaners read open feed" on public.openJobs for select to authenticated
using ((status = 'PENDING' and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'CLEANER' and u.verificationStatus = 'VERIFIED' and u.cleanerAgreementAccepted)) or customerId = auth.uid() or public.is_admin());
create policy "Bid parties read bids" on public.bids for select to authenticated using (cleanerId = auth.uid() or exists (select 1 from public.jobs j where j.id = jobId and j.customerId = auth.uid()) or public.is_admin());
create policy "Cleaners create bids" on public.bids for insert to authenticated with check (cleanerId = auth.uid());
create policy "Job participants read events" on public.jobEvents for select to authenticated using (public.is_job_participant(jobId) or public.is_admin());
create policy "Job participants read messages" on public.messages for select to authenticated using (public.is_job_participant(jobId) or public.is_admin());
create policy "Job participants send messages" on public.messages for insert to authenticated with check (senderId = auth.uid() and public.is_job_participant(jobId));
create policy "Users manage own favorites" on public.favorites for all to authenticated using (customerId = auth.uid() or public.is_admin()) with check (customerId = auth.uid() or public.is_admin());
create policy "Users read notifications" on public.notifications for select to authenticated using (userId = auth.uid() or public.is_admin());
create policy "Users update notifications" on public.notifications for update to authenticated using (userId = auth.uid()) with check (userId = auth.uid());
create policy "Reviews visible to parties and cleaner search" on public.reviews for select to authenticated
using (customerId = auth.uid() or cleanerId = auth.uid() or public.is_admin() or exists (select 1 from public.users u where u.id = cleanerId and u.verificationStatus = 'VERIFIED'));
create policy "Disputes visible to parties" on public.disputes for select to authenticated using (customerId = auth.uid() or cleanerId = auth.uid() or public.is_admin());
create policy "Payout requests visible to cleaner and admin" on public.payoutRequests for select to authenticated using (cleanerId = auth.uid() or public.is_admin());
create policy "Wallet ledger visible to owner and admin" on public.walletTransactions for select to authenticated using (userId = auth.uid() or public.is_admin());
create policy "Payment status visible to parties" on public.payments for select to authenticated using (customerId = auth.uid() or cleanerId = auth.uid() or public.is_admin());
create policy "Admin roles visible to admins" on public.adminRoles for select to authenticated using (userId = auth.uid() or public.is_admin());
create policy "Admin invites protected" on public.adminInvites for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin audits protected" on public.adminAuditEvents for select to authenticated using (public.is_admin());
create policy "Configuration available to signed-in clients" on public.configuration for select to authenticated using (key in ('beta','operations') or public.is_admin());
create policy "Waitlist protected" on public.betaWaitlist for select to authenticated using (public.is_admin());
create policy "Campaigns protected" on public.marketingCampaigns for select to authenticated using (public.is_admin());
create policy "Private KYC visible to subject and admin" on public.privateKyc for select to authenticated using (userId = auth.uid() or public.is_admin());

drop policy "Configuration available to signed-in clients" on public.configuration;
create policy "Beta configuration visible to signed-in clients" on public.configuration for select to authenticated using (key = 'beta' or public.is_admin());

revoke all on public.platformTransactions, public.legacyAuthMappings, public.authRateLimits, public.privateKyc, public.adminAuditEvents from anon, authenticated;
grant select on public.users to authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
grant select on public.jobs, public.openJobs, public.bids, public.jobEvents, public.messages, public.notifications, public.reviews, public.disputes, public.payments, public.walletTransactions, public.payoutRequests, public.organizations, public.organizationMembers, public.configuration to authenticated;
grant insert on public.messages to authenticated;
grant update (read) on public.notifications to authenticated;
grant update (email, displayName, photoURL, accountType, hasAgreedToTerms, hasCompletedProfile, hasSetupPermissions, serviceCategories, serviceRadiusKm, experienceYears, address, serviceArea, phone, location, expoPushToken, updatedAt, metadata) on public.users to authenticated;
revoke insert, update on public.jobs, public.openJobs, public.bids, public.payoutRequests, public.walletTransactions, public.payments, public.disputes, public.privateKyc, public.adminRoles, public.platformTransactions from anon, authenticated;
grant select on public.adminRoles, public.adminInvites, public.adminAuditEvents, public.betaWaitlist, public.marketingCampaigns, public.privateKyc to authenticated;

alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.openJobs;
alter publication supabase_realtime add table public.bids;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.favorites;
alter publication supabase_realtime add table public.walletTransactions;
alter publication supabase_realtime add table public.organizationMembers;
