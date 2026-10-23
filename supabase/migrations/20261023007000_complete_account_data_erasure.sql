create or replace function public.close_account(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare active_count integer; profile public.users;
begin
  select * into profile from public.users where id = p_user_id for update;
  if not found then raise exception 'Account profile not found'; end if;
  if profile.balance > 0 or profile.earningsBalance > 0 or profile.commissionBalance > 0 or profile.commissionOwed > 0 or profile.walletRestricted then
    raise exception 'Outstanding wallet funds or restrictions must be settled before account deletion';
  end if;
  if exists(select 1 from public.payoutRequests where cleanerId=p_user_id and status='PENDING') then
    raise exception 'Pending payouts must be settled before account deletion';
  end if;
  select count(*) into active_count from public.jobs where (customerId=p_user_id or cleanerId=p_user_id) and
    (status not in ('COMPLETED','CANCELLED') or paymentStatus in ('PENDING','FAILED','INITIATING','ESCROWED','DELIVERED','DISPUTED'));
  if active_count > 0 then raise exception 'Active bookings or payments must be resolved before account deletion'; end if;

  delete from public.favorites where customerId=p_user_id or cleanerId=p_user_id;
  delete from public.notifications where userId=p_user_id;
  delete from public.privateKyc where userId=p_user_id;
  delete from public.cleanerPortfolio where cleanerId=p_user_id;
  delete from public.organizationMembers where userId=p_user_id;
  delete from public.organizationInvites where createdBy=p_user_id or acceptedBy=p_user_id;
  delete from public.openJobs where customerId=p_user_id;
  update public.organizations set name='Deleted organization',registrationNumber=null,phone=null where ownerId=p_user_id;

  update public.messages set senderName='Deleted user',text='',imageUrl=null where senderId=p_user_id;
  update public.reviews set comment=null where customerId=p_user_id;
  update public.bids set cleanerName='Deleted user',cleanerPhoto=null,message=null,history='[]'::jsonb where cleanerId=p_user_id;
  update public.jobs set
    customerName=case when customerId=p_user_id then 'Deleted user' else customerName end,
    customerPhoto=case when customerId=p_user_id then null else customerPhoto end,
    customerPhone=case when customerId=p_user_id then null else customerPhone end,
    cleanerName=case when cleanerId=p_user_id then 'Deleted user' else cleanerName end,
    cleanerPhoto=case when cleanerId=p_user_id then null else cleanerPhoto end,
    cleanerPhone=case when cleanerId=p_user_id then null else cleanerPhone end,
    location=case when customerId=p_user_id then '{}'::jsonb else location end,
    checklist=case when customerId=p_user_id then null else checklist end,
    description=case when customerId=p_user_id then '' else description end,
    photos=case when customerId=p_user_id then '{}'::text[] else photos end,
    cleanerLocation=case when cleanerId=p_user_id then null else cleanerLocation end,
    cleanerLocationUpdatedAt=case when cleanerId=p_user_id then null else cleanerLocationUpdatedAt end,
    data=case
      when customerId=p_user_id then data-'location'-'checklist'-'description'-'photos'-'customerName'-'customerPhoto'-'customerPhone'
      when cleanerId=p_user_id then data-'cleanerName'-'cleanerPhoto'-'cleanerPhone'
      else data end,
    updatedAt=now()
    where customerId=p_user_id or cleanerId=p_user_id;

  update public.users set email='',displayName='Deleted user',photoURL='',phone=null,address=null,serviceArea=null,location=null,
    locationPoint=null,locationUpdatedAt=null,expoPushToken=null,verificationStatus='NOT_STARTED',verificationLevel=1,
    serviceCategories='{}',serviceRadiusKm=null,experienceYears=null,hasAgreedToTerms=false,cleanerAgreementAccepted=false,
    cleanerOnboardingComplete=false,accountDeletedAt=now(),updatedAt=now(),metadata='{}'::jsonb
    where id=p_user_id;
  return true;
end;
$$;
revoke all on function public.close_account(uuid) from public, anon, authenticated;
grant execute on function public.close_account(uuid) to service_role;
