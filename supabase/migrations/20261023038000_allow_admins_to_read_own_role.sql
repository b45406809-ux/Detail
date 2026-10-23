-- The dashboard may inspect only its own permission snapshot. Keep all role
-- changes and invitation/audit access behind the service-backed API.
revoke all privileges on table public.adminRoles from anon,authenticated;
grant select on table public.adminRoles to authenticated;
