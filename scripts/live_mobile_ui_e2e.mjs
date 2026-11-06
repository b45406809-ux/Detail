import { randomBytes } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
const usersPath = join(process.env.RUNNER_TEMP || '/tmp', 'detail-live-ui-users.json');

function requireBackend() {
  if (!baseUrl || !serviceKey) throw new Error('Live UI test requires SUPABASE_URL and SUPABASE_SECRET_KEY.');
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      'content-type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* status alone is enough for this operation */ }
  if (!response.ok) throw new Error(`Live Supabase operation failed (HTTP ${response.status}).`);
  return body;
}

async function preflight() {
  requireBackend();
  const settings = await request('/rest/v1/configuration?select=value&key=eq.beta');
  const bookingEnabled = settings?.[0]?.value?.bookingEnabled === true;
  console.log(`LIVE_BOOKING_PREFLIGHT: ${bookingEnabled ? 'OPEN' : 'CLOSED'} (UI journey will not submit a real booking)`);
}

async function writeAccounts(users) {
  await writeFile(usersPath, JSON.stringify(users), { mode: 0o600 });
  const envPath = process.env.GITHUB_ENV;
  if (!envPath) return;
  const client = users.find((user) => user.role === 'customer');
  const cleaner = users.find((user) => user.role === 'cleaner');
  for (const value of [client.email, client.password, cleaner.email, cleaner.password]) {
    console.log(`::add-mask::${value}`);
  }
  await appendFile(envPath, [
    `E2E_CUSTOMER_EMAIL=${client.email}`,
    `E2E_CUSTOMER_PASSWORD=${client.password}`,
    `E2E_CLEANER_EMAIL=${cleaner.email}`,
    `E2E_CLEANER_PASSWORD=${cleaner.password}`,
  ].join('\n') + '\n');
}

async function createAccounts() {
  requireBackend();
  const run = (process.env.GITHUB_RUN_ID || `local-${Date.now()}`).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
  const users = [];
  await writeFile(usersPath, '[]', { mode: 0o600 });
  for (const role of ['customer', 'cleaner']) {
    const email = `detail-live-ui-${run}-${role}@example.com`;
    const password = `Aa1!${randomBytes(24).toString('hex')}`;
    const user = await request('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName: `E2E Live ${role}` },
      }),
    });
    if (!user?.id) throw new Error(`Could not create the temporary ${role} account.`);
    users.push({ id: user.id, email, password, role });
    await writeFile(usersPath, JSON.stringify(users), { mode: 0o600 });
  }
  await writeAccounts(users);
  console.log('LIVE_UI_TEST_ACCOUNTS: CREATED');
}

async function cleanupAccounts() {
  let users = [];
  try { users = JSON.parse(await readFile(usersPath, 'utf8')); } catch { return; }
  let failed = false;
  for (const user of users) {
    let phase = 'privacy close';
    try {
      const closed = await request('/rest/v1/rpc/close_account', {
        method: 'POST',
        body: JSON.stringify({ p_user_id: user.id }),
      });
      if (closed !== true) throw new Error('Account privacy close did not confirm.');
      phase = 'legal acceptance removal';
      await request(`/rest/v1/legaldocumentacceptances?userid=eq.${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      phase = 'auth user removal';
      await request(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      phase = 'privacy cleanup verification';
      const [profile, legal, jobs, bids] = await Promise.all([
        request(`/rest/v1/users?select=id,email,displayname,accountdeletedat&id=eq.${encodeURIComponent(user.id)}`),
        request(`/rest/v1/legaldocumentacceptances?select=userid&userid=eq.${encodeURIComponent(user.id)}`),
        request(`/rest/v1/jobs?select=id&customerid=eq.${encodeURIComponent(user.id)}`),
        request(`/rest/v1/bids?select=id&cleanerid=eq.${encodeURIComponent(user.id)}`),
      ]);
      const profileIsSanitized = profile.length === 0 || (profile[0].email === '' && profile[0].displayname === 'Deleted user' && !!profile[0].accountdeletedat);
      if (!profileIsSanitized
        || legal?.length || jobs?.length || bids?.length) throw new Error('Test account cleanup verification failed.');
      const authResponse = await fetch(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
        headers: { apikey: serviceKey }, signal: AbortSignal.timeout(20000),
      });
      phase = 'login removal verification';
      if (authResponse.status !== 404) throw new Error('Deleted test login is still present.');
    } catch (error) {
      failed = true;
      console.error(`LIVE_UI_TEST_CLEANUP_FAILED: ${user.role} at ${phase} (${error instanceof Error ? error.message : 'unknown error'})`);
    }
  }
  if (failed) throw new Error('Temporary live UI test data was not fully cleaned up.');
  console.log(`LIVE_UI_TEST_ACCOUNTS_CLEANED: ${users.length}`);
}

async function verifyProfileState(expectedRole) {
  requireBackend();
  const users = JSON.parse(await readFile(usersPath, 'utf8'));
  const user = users.find(candidate => candidate.role === expectedRole);
  if (!user) throw new Error(`Missing disposable ${expectedRole} account manifest entry.`);
  const [profiles, jobs, payments] = await Promise.all([
    request(`/rest/v1/users?select=id,role,displayname,hascompletedprofile,hasagreedtoterms,hassetuppermissions,verificationstatus,cleaneragreementaccepted,cleaneronboardingcomplete&id=eq.${encodeURIComponent(user.id)}`),
    request(`/rest/v1/jobs?select=id&or=(customerid.eq.${encodeURIComponent(user.id)},cleanerid.eq.${encodeURIComponent(user.id)})`),
    request(`/rest/v1/payments?select=id&or=(customerid.eq.${encodeURIComponent(user.id)},cleanerid.eq.${encodeURIComponent(user.id)})`),
  ]);
  const profile = profiles[0];
  const expectedName = expectedRole === 'customer' ? 'E2E Live Customer' : 'E2E Live Cleaner';
  if (profiles.length !== 1 || profile.displayname !== expectedName
    || profile.role !== 'CUSTOMER' || profile.hascompletedprofile !== true
    || profile.hasagreedtoterms !== true || profile.hassetuppermissions !== true
    || jobs.length || payments.length) {
    throw new Error(`Persisted ${expectedRole} onboarding state did not match the expected test state.`);
  }
  if (expectedRole === 'cleaner' && (profile.verificationstatus !== 'NOT_STARTED'
    || profile.cleaneragreementaccepted === true || profile.cleaneronboardingcomplete === true)) {
    throw new Error('Cleaner gate state changed before verified identity and cleaner agreement.');
  }
  console.log(`LIVE_UI_TEST_${expectedRole.toUpperCase()}_PERSISTED_STATE_VERIFIED`);
}

const mode = process.argv[2];
if (mode === 'preflight') await preflight();
else if (mode === 'create') await createAccounts();
else if (mode === 'cleanup') await cleanupAccounts();
else if (mode === 'verify-customer') await verifyProfileState('customer');
else if (mode === 'verify-cleaner') await verifyProfileState('cleaner');
else throw new Error('Use preflight, create, or cleanup.');
