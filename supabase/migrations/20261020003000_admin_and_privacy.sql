alter table public.users drop constraint if exists users_id_fkey;
alter table public.users add column if not exists accountDeletedAt timestamptz;

create table public.paymentFailures (
  idempotencyKey text primary key,
  jobId uuid references public.jobs(id),
  customerId uuid references public.users(id),
  amount numeric(12,2),
  code text not null,
  createdAt timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);
create table public.productSales (
  id text primary key,
  productId text,
  cleanerId uuid references public.users(id),
  customerId uuid references public.users(id),
  quantity integer not null default 0,
  amount numeric(12,2) not null default 0,
  status text not null default 'PENDING',
  createdAt timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);
create table public.reportingAggregates (
  id text primary key,
  type text not null default 'GENERAL',
  period text,
  createdAt timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);
create table public.supportCases (
  id text primary key,
  jobId uuid references public.jobs(id),
  customerId uuid references public.users(id),
  cleanerId uuid references public.users(id),
  ownerId uuid references public.users(id),
  reason text,
  status text not null default 'OPEN',
  createdAt timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

alter table public.paymentFailures enable row level security;
alter table public.productSales enable row level security;
alter table public.reportingAggregates enable row level security;
alter table public.supportCases enable row level security;
create policy "Admin financial and support records" on public.paymentFailures for select to authenticated using (public.is_admin());
create policy "Admin product records" on public.productSales for select to authenticated using (public.is_admin());
create policy "Admin report records" on public.reportingAggregates for select to authenticated using (public.is_admin());
create policy "Support parties and admins read cases" on public.supportCases for select to authenticated using (customerId=auth.uid() or cleanerId=auth.uid() or public.is_admin());
revoke all on public.paymentFailures, public.productSales, public.reportingAggregates, public.supportCases from anon, authenticated;
grant select on public.paymentFailures, public.productSales, public.reportingAggregates, public.supportCases to authenticated;

create or replace function public.close_account(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare active_count integer;
begin
  select count(*) into active_count from public.jobs where (customerId=p_user_id or cleanerId=p_user_id) and
    (status not in ('COMPLETED','CANCELLED') or paymentStatus in ('PENDING','FAILED','INITIATING','ESCROWED','DELIVERED','DISPUTED'));
  if active_count > 0 then raise exception 'Active bookings or payments must be resolved before account deletion'; end if;
  delete from public.favorites where customerId=p_user_id or cleanerId=p_user_id;
  delete from public.notifications where userId=p_user_id;
  delete from public.privateKyc where userId=p_user_id;
  delete from public.organizationMembers where userId=p_user_id;
  delete from public.organizationInvites where createdBy=p_user_id or acceptedBy=p_user_id;
  update public.organizations set name='Deleted organization',registrationNumber=null,phone=null where ownerId=p_user_id;
  update public.jobs set customerName=case when customerId=p_user_id then 'Deleted user' else customerName end,
    customerPhoto=case when customerId=p_user_id then null else customerPhoto end,
    customerPhone=case when customerId=p_user_id then null else customerPhone end,
    cleanerName=case when cleanerId=p_user_id then 'Deleted user' else cleanerName end,
    cleanerPhoto=case when cleanerId=p_user_id then null else cleanerPhoto end,
    cleanerPhone=case when cleanerId=p_user_id then null else cleanerPhone end,
    description=case when customerId=p_user_id then '' else description end,
    updatedAt=now() where customerId=p_user_id or cleanerId=p_user_id;
  update public.users set email='',displayName='Deleted user',photoURL='',phone=null,address=null,serviceArea=null,location=null,expoPushToken=null,
    verificationStatus='NOT_STARTED',verificationLevel=1,serviceCategories='{}',serviceRadiusKm=null,experienceYears=null,
    hasAgreedToTerms=false,cleanerAgreementAccepted=false,cleanerOnboardingComplete=false,accountDeletedAt=now(),updatedAt=now(),metadata='{}'::jsonb
    where id=p_user_id;
  return true;
end;
$$;
revoke all on function public.close_account(uuid) from public, anon, authenticated;
grant execute on function public.close_account(uuid) to service_role;

alter publication supabase_realtime add table public.supportCases;
