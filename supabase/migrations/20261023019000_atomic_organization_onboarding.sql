create or replace function public.register_organization_secure(
  p_owner_id uuid,
  p_name text,
  p_registration_number text,
  p_phone text,
  p_country text,
  p_city text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  owner_profile public.users;
  organization_id uuid;
begin
  select * into owner_profile from public.users where id=p_owner_id for update;
  if not found or owner_profile.isSuspended or owner_profile.isBanned or owner_profile.accountDeletedAt is not null then
    raise exception 'Account cannot register an organization';
  end if;
  select id into organization_id from public.organizations where ownerId=p_owner_id order by createdAt limit 1;
  if organization_id is not null then
    update public.users set accountType='ORGANIZATION',organizationId=organization_id,updatedAt=now() where id=p_owner_id;
    return organization_id;
  end if;
  if length(trim(coalesce(p_name,'')))<2 or length(trim(coalesce(p_registration_number,'')))=0
     or length(trim(coalesce(p_phone,'')))<7 or length(trim(coalesce(p_country,'')))=0 or length(trim(coalesce(p_city,'')))=0 then
    raise exception 'Complete the organization registration details';
  end if;
  insert into public.organizations(ownerId,name,registrationNumber,phone,country,city)
    values(p_owner_id,left(trim(p_name),160),left(trim(p_registration_number),100),left(trim(p_phone),40),left(trim(p_country),80),left(trim(p_city),100))
    returning id into organization_id;
  update public.users set accountType='ORGANIZATION',organizationId=organization_id,updatedAt=now() where id=p_owner_id;
  return organization_id;
end;
$$;
revoke all on function public.register_organization_secure(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.register_organization_secure(uuid,text,text,text,text,text) to service_role;

create or replace function public.join_organization_secure(
  p_user_id uuid,
  p_email text,
  p_code_hash text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  invite public.organizationInvites;
  cleaner public.users;
begin
  select * into cleaner from public.users where id=p_user_id for update;
  if not found or cleaner.email<>lower(trim(p_email)) or cleaner.role<>'CLEANER'
     or cleaner.verificationStatus<>'VERIFIED' or not cleaner.cleanerAgreementAccepted
     or not cleaner.cleanerOnboardingComplete or cleaner.isSuspended or cleaner.isBanned
     or cleaner.accountDeletedAt is not null then
    raise exception 'Complete cleaner onboarding with this verified email before joining an organization';
  end if;
  select * into invite from public.organizationInvites where codeHash=p_code_hash and acceptedBy is null and expiresAt>now() for update;
  if not found or lower(invite.email)<>lower(trim(p_email)) then
    raise exception 'This invitation is invalid, expired, or belongs to another email';
  end if;
  if cleaner.organizationId is not null and cleaner.organizationId<>invite.organizationId then
    raise exception 'Leave your current organization before accepting another invitation';
  end if;
  insert into public.organizationMembers(organizationId,userId,role,status,cleanerName,email,verificationStatus)
    values(invite.organizationId,p_user_id,'CLEANER','ACTIVE',coalesce(invite.cleanerName,cleaner.displayName),cleaner.email,cleaner.verificationStatus)
    on conflict(organizationId,userId) do update set status='ACTIVE',cleanerName=excluded.cleanerName,email=excluded.email,verificationStatus=excluded.verificationStatus;
  update public.organizationInvites set acceptedBy=p_user_id where id=invite.id;
  update public.users set organizationId=invite.organizationId,accountType='ORGANIZATION',updatedAt=now() where id=p_user_id;
  return invite.organizationId;
end;
$$;
revoke all on function public.join_organization_secure(uuid,text,text) from public,anon,authenticated;
grant execute on function public.join_organization_secure(uuid,text,text) to service_role;
