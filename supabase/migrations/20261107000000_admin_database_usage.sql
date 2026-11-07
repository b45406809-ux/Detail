-- Expose sizes only through the existing, elevated-admin checked API.
create or replace function public.admin_database_usage()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'databaseBytes', (select sum(pg_database_size(oid)) from pg_database),
    'chatTableBytes', pg_total_relation_size('public.messages'::regclass)
  );
$$;
revoke all on function public.admin_database_usage() from public, anon, authenticated;
grant execute on function public.admin_database_usage() to service_role;
