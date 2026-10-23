-- Reset any table-level UPDATE grants inherited from earlier migrations or
-- project defaults. The application only needs the explicit column grants.
revoke update on table public.users from public, anon, authenticated;
revoke update (email, phone) on table public.users from anon, authenticated;
grant update (displayName, photoURL, hasAgreedToTerms, hasCompletedProfile, hasSetupPermissions, serviceCategories, serviceRadiusKm, experienceYears, address, serviceArea, location, expoPushToken, updatedAt, metadata) on public.users to authenticated;

create or replace function public.protect_user_financial_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.email := old.email;
    new.phone := old.phone;
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
    new.cleanerOnboardingComplete := old.cleanerOnboardingComplete;
    new.jobsCompleted := old.jobsCompleted;
    new.ratingAverage := old.ratingAverage;
    new.ratingCount := old.ratingCount;
    new.responseTimeAverage := old.responseTimeAverage;
    new.walletRestricted := old.walletRestricted;
    new.locationPoint := old.locationPoint;
    new.locationUpdatedAt := old.locationUpdatedAt;
    new.accountDeletedAt := old.accountDeletedAt;
    new.createdAt := old.createdAt;
    if old.role <> 'CLEANER' or old.verificationStatus <> 'VERIFIED' or not old.cleanerAgreementAccepted then
      new.status := old.status;
    end if;
  end if;
  new.updatedAt := now();
  return new;
end;
$$;

-- Keep the profile's phone and email synchronized with Supabase Auth. Phone is
-- copied only after Supabase marks it confirmed, never from editable metadata.
create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users(id, email, displayName, photoURL, phone, hasAgreedToTerms)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'displayName', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    case when new.phone_confirmed_at is not null then new.phone else null end,
    coalesce(new.raw_user_meta_data->>'termsAccepted', 'false') = 'true'
  )
  on conflict(id) do update set
    email = excluded.email,
    phone = case when new.phone is null then null when new.phone_confirmed_at is not null then new.phone else public.users.phone end;
  return new;
end;
$$;

drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile
after insert or update of email, phone, phone_confirmed_at on auth.users
for each row execute function public.on_auth_user_created();
