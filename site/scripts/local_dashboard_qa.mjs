import { chromium } from 'playwright';

const baseUrl = process.env.LOCAL_DASHBOARD_URL || 'http://127.0.0.1:4173';
const supabaseUrl = process.env.SUPABASE_TEST_URL?.replace(/\/+$/, '');
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const elevatedEmail = process.env.QA_ADMIN_ELEVATED_EMAIL;
const elevatedPassword = process.env.QA_ADMIN_ELEVATED_PASSWORD;
const restrictedEmail = process.env.QA_ADMIN_BOOKINGS_ONLY_EMAIL;
const restrictedPassword = process.env.QA_ADMIN_BOOKINGS_ONLY_PASSWORD;
const runId = (process.env.QA_RUN_ID || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48);
if (!supabaseUrl || !anonKey || !serviceKey || !elevatedEmail || !elevatedPassword || !restrictedEmail || !restrictedPassword || !runId) {
  throw new Error('Local dashboard QA requires the isolated Supabase fixture pool.');
}

async function rest(table, query) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) throw new Error(`Local dashboard persistence check failed (HTTP ${response.status}).`);
  return response.json();
}

async function signIn(page, email, password) {
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Admin sign in', exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  try {
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  } catch {
    const message = await page.locator('main').innerText().catch(() => 'No dashboard content rendered.');
    const redacted = message.replace(/\S+@\S+/g, '[email]').replace(/\b\d{6,}\b/g, '[redacted number]').slice(0, 500);
    throw new Error(`Admin sign-in did not reach Overview. Visible page: ${redacted}`);
  }
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const runtimeErrors = [];
page.on('pageerror', error => runtimeErrors.push(error.message));

try {
  await signIn(page, elevatedEmail, elevatedPassword);
  console.log('PASS local admin sign-in and Overview');

  const routes = [
    ['Overview', 'Overview'], ['Bookings', 'Bookings'], ['Customers', 'Customers'],
    ['Cleaners', 'Cleaners / Staff'], ['Payments / Refunds', 'Payments / Refunds'],
    ['Products', 'After-sales Products'], ['Analytics', 'Analytics'], ['Support Cases', 'Support Cases'],
    ['Waitlist & Email', 'Waitlist & Email'], ['Blog & GEO', 'Blog & GEO'],
    ['Admins & Security', 'Admins & Security'], ['Settings', 'Settings'],
  ];
  for (const [label, heading] of routes) {
    await page.locator('aside nav button').filter({ hasText: label }).click();
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    if (label === 'Bookings') {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    }
    const errors = await page.locator('.inline-error, .admin-state.error').count();
    if (errors) throw new Error(`The local ${label} module showed an API error.`);
    console.log(`PASS local dashboard module ${label}`);
  }

  await page.locator('aside nav button').filter({ hasText: 'Admins & Security' }).click();
  const inviteEmail = `detail-qa-invite-${runId}@example.invalid`;
  await page.getByLabel('Invite email').fill(inviteEmail);
  await page.getByRole('button', { name: 'Create invite link' }).click();
  await page.getByText('It expires in seven days and is restricted to the entered email.').waitFor({ state: 'visible', timeout: 10000 });
  let inviteRows = await rest('admininvites', new URLSearchParams({ select: 'id,email,status,permissions', email: `eq.${inviteEmail}` }).toString());
  if (inviteRows.length !== 1 || inviteRows[0].status !== 'PENDING') throw new Error('Invite creation did not persist a pending invitation.');
  const inviteId = inviteRows[0].id;
  const inviteRow = page.locator('tr').filter({ hasText: inviteEmail });
  page.once('dialog', dialog => dialog.accept());
  await inviteRow.getByRole('button', { name: 'Cancel invite' }).click();
  for (let attempt = 0; attempt < 12; attempt++) {
    inviteRows = await rest('admininvites', new URLSearchParams({ select: 'id,status', id: `eq.${inviteId}` }).toString());
    if (inviteRows[0]?.status === 'REVOKED') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (inviteRows[0]?.status !== 'REVOKED') throw new Error('Invite cancellation did not persist a revoked status.');
  const audit = await rest('adminauditevents', new URLSearchParams({ select: 'id,action,targetid', targetid: `eq.${inviteId}` }).toString());
  if (!audit.some(event => event.action === 'admin_invite_revoked')) throw new Error('Invite cancellation did not persist an audit event.');
  console.log('PASS invite creation, cancellation and persisted audit event');

  await page.locator('aside footer button').filter({ hasText: 'Sign out' }).click();
  await page.getByRole('heading', { name: 'Admin sign in', exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await signIn(page, restrictedEmail, restrictedPassword);
  await page.goto(`${baseUrl}/admin/admins`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  if (await page.locator('aside nav button').filter({ hasText: 'Admins & Security' }).count()) {
    throw new Error('Bookings-only administrator can see the Admins & Security module.');
  }

  const session = await page.evaluate(() => Object.entries(localStorage)
    .filter(([key]) => key.includes('auth-token'))
    .map(([, value]) => { try { return JSON.parse(value); } catch { return null; } })
    .find(value => value?.access_token));
  if (!session?.access_token) throw new Error('Restricted fixture administrator session was not restored in the browser.');
  const denied = await fetch(`${supabaseUrl}/functions/v1/marketplace-api`, {
    method: 'POST',
    headers: { apikey: anonKey, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'createAdminInvite', data: { email: `detail-qa-denied-${runId}@example.invalid`, permissions: [] } }),
  });
  const deniedBody = await denied.json().catch(() => ({}));
  if (denied.status !== 403 || !String(deniedBody.error ?? '').toLowerCase().includes('permission')) {
    throw new Error('Bookings-only administrator was not rejected from the invite action.');
  }
  const unauthorizedRows = await rest('admininvites', new URLSearchParams({ select: 'id', email: `eq.detail-qa-denied-${runId}@example.invalid` }).toString());
  if (unauthorizedRows.length) throw new Error('Denied invite action left a partial backend record.');
  console.log('PASS restricted admin route and invite action denial; no partial record');

  if (runtimeErrors.length) throw new Error(`Browser runtime errors: ${runtimeErrors.slice(0, 3).join(' | ')}`);
  console.log('LOCAL_DASHBOARD_QA_PASSED');
} finally {
  await browser.close();
}
