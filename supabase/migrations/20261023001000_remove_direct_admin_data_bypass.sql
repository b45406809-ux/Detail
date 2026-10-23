-- Staff reads must pass through marketplace-api, which checks the specific
-- permission and MFA assurance level. A generic is_admin() RLS exception lets
-- every admin role read raw customer, payment, KYC and payout rows over REST.

drop policy if exists "Users read own profile or admin" on public.users;
create policy "Users read own profile" on public.users for select to authenticated
using (id = auth.uid());
drop policy if exists "Users update own safe fields" on public.users;
create policy "Users update own safe fields" on public.users for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Organization readers" on public.organizations;
create policy "Organization readers" on public.organizations for select to authenticated
using (ownerId = auth.uid() or public.is_organization_member(id));
drop policy if exists "Organization owners manage" on public.organizations;
create policy "Organization owners manage" on public.organizations for all to authenticated
using (ownerId = auth.uid()) with check (ownerId = auth.uid());
drop policy if exists "Organization memberships readers" on public.organizationMembers;
create policy "Organization memberships readers" on public.organizationMembers for select to authenticated
using (userId = auth.uid() or public.owns_organization(organizationId));

drop policy if exists "Booking participants read jobs" on public.jobs;
create policy "Booking participants read jobs" on public.jobs for select to authenticated
using (customerId = auth.uid() or cleanerId = auth.uid());
drop policy if exists "Participants update jobs" on public.jobs;
create policy "Participants update jobs" on public.jobs for update to authenticated
using (customerId = auth.uid() or cleanerId = auth.uid())
with check (customerId = auth.uid() or cleanerId = auth.uid());

drop policy if exists "Verified cleaners read sanitized open feed" on public.openJobs;
create policy "Verified cleaners read sanitized open feed" on public.openJobs for select to authenticated
using (
  customerId = auth.uid() or
  (status = 'PENDING' and exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'CLEANER'
      and u.verificationStatus = 'VERIFIED' and u.cleanerAgreementAccepted
      and not u.isSuspended and not u.isBanned
  ))
);

drop policy if exists "Bid parties read bids" on public.bids;
create policy "Bid parties read bids" on public.bids for select to authenticated
using (cleanerId = auth.uid() or exists (select 1 from public.jobs j where j.id = jobId and j.customerId = auth.uid()));
drop policy if exists "Job participants read events" on public.jobEvents;
create policy "Job participants read events" on public.jobEvents for select to authenticated
using (public.is_job_participant(jobId));
drop policy if exists "Job participants read messages" on public.messages;
create policy "Job participants read messages" on public.messages for select to authenticated
using (public.is_job_participant(jobId));
drop policy if exists "Users read notifications" on public.notifications;
create policy "Users read notifications" on public.notifications for select to authenticated
using (userId = auth.uid());
drop policy if exists "Users manage own favorites" on public.favorites;
create policy "Users manage own favorites" on public.favorites for all to authenticated
using (customerId = auth.uid()) with check (customerId = auth.uid());

drop policy if exists "Reviews visible to parties and cleaner search" on public.reviews;
create policy "Reviews visible to parties and cleaner search" on public.reviews for select to authenticated
using (customerId = auth.uid() or cleanerId = auth.uid() or exists (
  select 1 from public.users u where u.id = cleanerId and u.verificationStatus = 'VERIFIED'
));
drop policy if exists "Disputes visible to parties" on public.disputes;
create policy "Disputes visible to parties" on public.disputes for select to authenticated
using (customerId = auth.uid() or cleanerId = auth.uid());
drop policy if exists "Payout requests visible to cleaner and admin" on public.payoutRequests;
create policy "Payout requests visible to cleaner" on public.payoutRequests for select to authenticated
using (cleanerId = auth.uid());
drop policy if exists "Wallet ledger visible to owner and admin" on public.walletTransactions;
create policy "Wallet ledger visible to owner" on public.walletTransactions for select to authenticated
using (userId = auth.uid());
drop policy if exists "Payment status visible to parties" on public.payments;
create policy "Payment status visible to parties" on public.payments for select to authenticated
using (customerId = auth.uid() or cleanerId = auth.uid());

drop policy if exists "Admin roles visible to admins" on public.adminRoles;
create policy "Admins read own role" on public.adminRoles for select to authenticated
using (userId = auth.uid());
drop policy if exists "Admin invites protected" on public.adminInvites;
drop policy if exists "Admin audits protected" on public.adminAuditEvents;
revoke all privileges on table public.adminroles, public.admininvites, public.adminauditevents from anon, authenticated;

drop policy if exists "Configuration available to signed-in clients" on public.configuration;
drop policy if exists "Public beta configuration" on public.configuration;
create policy "Public beta configuration" on public.configuration for select to anon, authenticated
using (key = 'beta');
drop policy if exists "Waitlist protected" on public.betaWaitlist;
drop policy if exists "Campaigns protected" on public.marketingCampaigns;
revoke all privileges on table public.betawaitlist, public.marketingcampaigns from anon, authenticated;

drop policy if exists "Private KYC visible to subject and admin" on public.privateKyc;
create policy "Private KYC visible to subject" on public.privateKyc for select to authenticated
using (userId = auth.uid());
revoke all privileges on table public.paymentfailures, public.productsales, public.reportingaggregates from anon, authenticated;

drop policy if exists "Admin financial and support records" on public.paymentFailures;
drop policy if exists "Admin product records" on public.productSales;
drop policy if exists "Admin report records" on public.reportingAggregates;
drop policy if exists "Support parties and admins read cases" on public.supportCases;
create policy "Support parties read cases" on public.supportCases for select to authenticated
using (customerId = auth.uid() or cleanerId = auth.uid());

drop policy if exists "Cleaners read own availability blocks" on public.cleanerAvailabilityBlocks;
create policy "Cleaners read own availability blocks" on public.cleanerAvailabilityBlocks for select to authenticated
using (cleanerId = auth.uid());
drop policy if exists "Offer parties read instant offers" on public.instantOffers;
create policy "Offer parties read instant offers" on public.instantOffers for select to authenticated
using (cleanerId = auth.uid() or exists (select 1 from public.jobs j where j.id = jobId and j.customerId = auth.uid()));
drop policy if exists "Wallet reconciliation visible to owner and admin" on public.walletReconciliations;
create policy "Wallet reconciliation visible to owner" on public.walletReconciliations for select to authenticated
using (userId = auth.uid());

drop policy if exists "Users read own media" on storage.objects;
create policy "Users read own media" on storage.objects for select to authenticated
using (bucket_id = 'detail-media' and (storage.foldername(name))[2] = auth.uid()::text);
