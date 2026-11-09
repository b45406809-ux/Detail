create or replace function public.admin_database_usage()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'databaseBytes', (select sum(pg_database_size(oid)) from pg_database),
    'chatTableBytes', pg_total_relation_size('public.messages'::regclass),
    'fileStorageBytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects where bucket_id='detail-media'),0),
    'fileCount', (select count(*) from storage.objects where bucket_id='detail-media'),
    'activeUsers30d', (select count(*) from auth.users where last_sign_in_at >= now()-interval '30 days'),
    'messages30d', (select count(*) from public.messages where createdAt >= now()-interval '30 days')
  );
$$;
revoke all on function public.admin_database_usage() from public, anon, authenticated;
grant execute on function public.admin_database_usage() to service_role;
