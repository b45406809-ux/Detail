-- Admin invitations carry roles and permissions and must only be managed by
-- the service-authorized marketplace API. RLS is not a substitute for table
-- grants: an existing table-level grant can permit writes even when a column
-- grant looks restrictive.
revoke all privileges on table public.admininvites from public, anon, authenticated;

-- The edge function uses the service role for invite reads and writes. Keep
-- this assertion explicit so future migrations cannot re-open client access.
do $$
begin
  if has_table_privilege('anon', 'public.admininvites', 'INSERT')
     or has_table_privilege('anon', 'public.admininvites', 'UPDATE')
     or has_table_privilege('anon', 'public.admininvites', 'DELETE')
     or has_table_privilege('authenticated', 'public.admininvites', 'INSERT')
     or has_table_privilege('authenticated', 'public.admininvites', 'UPDATE')
     or has_table_privilege('authenticated', 'public.admininvites', 'DELETE') then
    raise exception 'admininvites must not be writable by anon or authenticated';
  end if;
end;
$$;
