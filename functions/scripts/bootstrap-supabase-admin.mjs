import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const confirmed = process.env.BOOTSTRAP_ADMIN_CONFIRM === 'YES';
if (!url || !serviceRoleKey || !email || !confirmed) {
  throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, and BOOTSTRAP_ADMIN_CONFIRM=YES in a protected shell.');
}

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
let found = null;
for (let page = 1; !found; page++) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  found = data.users.find(user => user.email?.toLowerCase() === email) ?? null;
  if (found || data.users.length < 1000) break;
}
if (!found) throw new Error(`No Supabase Auth account exists for ${email}. Create and verify that account first.`);

const { error } = await client.from('adminroles').upsert({
  userid: found.id,
  elevated: true,
  permissions: ['admins.manage', 'marketing.read', 'marketing.send', 'finance.read', 'audit.read'],
}, { onConflict: 'userid' });
if (error) throw error;
console.log(`Granted the initial elevated administrator role to ${email} (${found.id}). Sign in and create restricted admin invitations from the dashboard.`);
