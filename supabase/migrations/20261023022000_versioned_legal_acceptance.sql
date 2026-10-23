create table public.legalDocumentAcceptances (
  id uuid primary key default gen_random_uuid(),
  userId uuid not null references public.users(id) on delete cascade,
  documentType text not null check (documentType in ('CUSTOMER','CLEANER')),
  documentVersion text not null,
  acceptedAt timestamptz not null default now(),
  unique(userId,documentType,documentVersion)
);
alter table public.legalDocumentAcceptances enable row level security;
revoke all privileges on table public.legalDocumentAcceptances from public,anon,authenticated;

-- Existing booleans have no trustworthy document version or acceptance time.
-- Require users to review and accept the current agreement before continuing.
update public.users set hasAgreedToTerms=false,cleanerAgreementAccepted=false where accountDeletedAt is null;
revoke update (hasAgreedToTerms,cleanerAgreementAccepted) on public.users from public,anon,authenticated;

create or replace function public.protect_user_financial_fields()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is not null then
    new.email:=old.email; new.phone:=old.phone; new.balance:=old.balance; new.earningsBalance:=old.earningsBalance;
    new.commissionBalance:=old.commissionBalance; new.commissionOwed:=old.commissionOwed;
    new.verificationStatus:=old.verificationStatus; new.verificationLevel:=old.verificationLevel;
    new.isSuspended:=old.isSuspended; new.isBanned:=old.isBanned; new.role:=old.role;
    new.accountType:=old.accountType; new.organizationId:=old.organizationId;
    new.hasAgreedToTerms:=old.hasAgreedToTerms; new.cleanerAgreementAccepted:=old.cleanerAgreementAccepted;
    new.cleanerOnboardingComplete:=old.cleanerOnboardingComplete; new.jobsCompleted:=old.jobsCompleted;
    new.ratingAverage:=old.ratingAverage; new.ratingCount:=old.ratingCount; new.responseTimeAverage:=old.responseTimeAverage;
    new.walletRestricted:=old.walletRestricted; new.locationPoint:=old.locationPoint; new.locationUpdatedAt:=old.locationUpdatedAt;
    new.accountDeletedAt:=old.accountDeletedAt; new.createdAt:=old.createdAt;
    if old.role<>'CLEANER' or old.verificationStatus<>'VERIFIED' or not old.cleanerAgreementAccepted then new.status:=old.status; end if;
  end if;
  new.updatedAt:=now();
  return new;
end;
$$;

create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.users(id,email,displayName,photoURL,phone,hasAgreedToTerms)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'displayName',''),coalesce(new.raw_user_meta_data->>'avatar_url',''),
    case when new.phone_confirmed_at is not null then new.phone else null end,false)
  on conflict(id) do update set email=excluded.email,
    phone=case when new.phone is null then null when new.phone_confirmed_at is not null then new.phone else public.users.phone end;
  return new;
end;
$$;

create or replace function public.accept_customer_agreement(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare profile public.users;
begin
  select * into profile from public.users where id=p_user_id for update;
  if not found or profile.isSuspended or profile.isBanned or profile.accountDeletedAt is not null then raise exception 'This account cannot accept the agreement'; end if;
  insert into public.legalDocumentAcceptances(userId,documentType,documentVersion)
    values(p_user_id,'CUSTOMER','customer-2026-10-23') on conflict(userId,documentType,documentVersion) do nothing;
  update public.users set hasAgreedToTerms=true,updatedAt=now() where id=p_user_id;
  return true;
end;
$$;
revoke all on function public.accept_customer_agreement(uuid) from public,anon,authenticated;
grant execute on function public.accept_customer_agreement(uuid) to service_role;

create or replace function public.accept_cleaner_agreement(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare profile public.users;
begin
  select * into profile from public.users where id=p_user_id for update;
  if not found or not profile.hasAgreedToTerms or not profile.cleanerOnboardingComplete or profile.verificationStatus<>'VERIFIED'
     or profile.isSuspended or profile.isBanned or profile.accountDeletedAt is not null then
    raise exception 'Complete registration and identity verification first';
  end if;
  insert into public.legalDocumentAcceptances(userId,documentType,documentVersion)
    values(p_user_id,'CLEANER','cleaner-2026-10-23') on conflict(userId,documentType,documentVersion) do nothing;
  update public.users set role='CLEANER',cleanerAgreementAccepted=true,updatedAt=now() where id=p_user_id;
  return true;
end;
$$;
revoke all on function public.accept_cleaner_agreement(uuid) from public,anon,authenticated;
grant execute on function public.accept_cleaner_agreement(uuid) to service_role;
