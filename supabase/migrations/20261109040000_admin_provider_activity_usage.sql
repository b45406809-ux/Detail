-- Add privacy-safe provider activity telemetry from existing operational rows.
-- These values are not provider invoices or exact billing meters.
create or replace function public.admin_database_usage()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, auth
as $$
  select jsonb_build_object(
    'databaseBytes', (select sum(pg_database_size(oid)) from pg_database),
    'chatTableBytes', pg_total_relation_size('public.messages'::regclass),
    'fileStorageBytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects where bucket_id='detail-media'),0),
    'fileCount', (select count(*) from storage.objects where bucket_id='detail-media'),
    'activeUsers30d', (select count(*) from auth.users where last_sign_in_at >= now()-interval '30 days'),
    'messages30d', (select count(*) from public.messages where createdAt >= now()-interval '30 days'),
    'providerActivity', jsonb_build_object(
      'diditSessionRecords30d', (select count(*) from public.privateKyc where provider='didit' and sessionId is not null and updatedAt >= now()-interval '30 days'),
      'paynowTransactions30d', (select count(*) from public.payments where provider='PAYNOW' and createdAt >= now()-interval '30 days'),
      'paynowAmount30d', (select coalesce(sum(amount),0) from public.payments where provider='PAYNOW' and createdAt >= now()-interval '30 days'),
      'expoPush30d', jsonb_build_object(
        'attempts', (select count(*) from public.notificationDeliveries where provider='EXPO' and createdAt >= now()-interval '30 days'),
        'accepted', (select count(*) from public.notificationDeliveries where provider='EXPO' and status in ('ACCEPTED','DELIVERED') and createdAt >= now()-interval '30 days'),
        'delivered', (select count(*) from public.notificationDeliveries where provider='EXPO' and status='DELIVERED' and createdAt >= now()-interval '30 days'),
        'failed', (select count(*) from public.notificationDeliveries where provider='EXPO' and status='FAILED' and createdAt >= now()-interval '30 days')
      ),
      'turnstileVerifiedWaitlistSubmissions30d', (select count(*) from public.betaWaitlist where createdAt >= now()-interval '30 days'),
      'googleActiveAccounts30d', (select count(*) from auth.users where last_sign_in_at >= now()-interval '30 days' and (coalesce(raw_app_meta_data->'providers','[]'::jsonb) ? 'google' or raw_app_meta_data->>'provider'='google')),
      'appleActiveAccounts30d', (select count(*) from auth.users where last_sign_in_at >= now()-interval '30 days' and (coalesce(raw_app_meta_data->'providers','[]'::jsonb) ? 'apple' or raw_app_meta_data->>'provider'='apple'))
    )
  );
$$;
revoke all on function public.admin_database_usage() from public, anon, authenticated;
grant execute on function public.admin_database_usage() to service_role;
