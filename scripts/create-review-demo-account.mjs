#!/usr/bin/env node
// Creates (or repairs and resets the password of) the Apple App Review demo account.
// Uses the Supabase service role key via fetch only. The password is masked in the
// log and written only to $GITHUB_STEP_SUMMARY.
import { randomInt } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const EMAIL = process.env.DEMO_EMAIL || 'appreview@detailapp.co.zw';
const PHONE = process.env.DEMO_PHONE || '+263770000123';
const COMMISSION_FLOOR = 10;
const CUSTOMER_VERSION = 'customer-2026-10-23';
const CLEANER_VERSION = 'cleaner-2026-11-25-wallet-direct-payments-v2';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDEooor7g+RCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP//Z';

const base = String(process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)) throw new Error('SUPABASE_URL is missing or not a Supabase project URL.');
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
const digits = (value) => String(value ?? '').replace(/\D/g, '');

async function call(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const detail = data?.msg || data?.message || data?.error_description || data?.error || '';
    throw new Error(`${method} ${path.split('?')[0]} failed with HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 200)}` : ''}`);
  }
  return data;
}

function makePassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const chars = [letters[randomInt(letters.length)], letters[randomInt(letters.length)], numbers[randomInt(numbers.length)], numbers[randomInt(numbers.length)]];
  const all = letters + numbers;
  while (chars.length < 16) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

async function findAuthUsers() {
  const matches = [];
  for (let page = 1; page <= 100; page++) {
    const data = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = data?.users ?? [];
    for (const user of users) {
      if (String(user.email ?? '').toLowerCase() === EMAIL || (user.phone && digits(user.phone) === digits(PHONE))) matches.push(user);
    }
    if (users.length < 200) break;
  }
  return matches;
}

const password = makePassword();
console.log(`::add-mask::${password}`);

// 1. Auth user (create or update), email and phone confirmed.
const matches = await findAuthUsers();
const foreign = matches.find((user) => String(user.email ?? '').toLowerCase() !== EMAIL);
if (foreign) throw new Error('The demo phone number is already attached to a different auth user; refusing to modify it.');
let authUser = matches[0];
if (authUser) {
  authUser = await call(`/auth/v1/admin/users/${authUser.id}`, { method: 'PUT', body: { email: EMAIL, password, email_confirm: true, phone: PHONE, phone_confirm: true, user_metadata: { displayName: 'Apple Review', termsAccepted: 'true' } } });
  console.log('Existing demo auth user updated and password reset.');
} else {
  authUser = await call('/auth/v1/admin/users', { method: 'POST', body: { email: EMAIL, password, email_confirm: true, phone: PHONE, phone_confirm: true, user_metadata: { displayName: 'Apple Review', termsAccepted: 'true' } } });
  console.log('Demo auth user created.');
}
const userId = authUser.id;
if (!authUser.phone_confirmed_at || !authUser.email_confirmed_at) throw new Error('Auth user phone or email is not confirmed after the admin write.');

// 2. Public profile row (normally created by the auth trigger).
const rows = await call(`/rest/v1/users?id=eq.${userId}&select=id`);
if (!rows?.length) await call('/rest/v1/users', { method: 'POST', body: { id: userId, email: EMAIL }, headers: { prefer: 'return=minimal' } });

// 3. Selfie object at the app's cleaner selfie path in the detail-media bucket.
const selfieObject = `profile-photos/${userId}/avatar.jpg`;
await call(`/storage/v1/object/detail-media/${selfieObject}`, { method: 'POST', raw: true, body: Buffer.from(JPEG_BASE64, 'base64'), headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=3600' } });
console.log('Selfie uploaded to storage bucket detail-media.');

// 4. Profile fields. cleanerselfieat can only be set by service_role (guard trigger).
const now = new Date().toISOString();
await call(`/rest/v1/users?id=eq.${userId}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: {
  email: EMAIL, phone: PHONE, displayname: process.env.DEMO_NAME || 'Apple Review',
  hasagreedtoterms: true, hascompletedprofile: true, hassetuppermissions: true,
  cleaneronboardingcomplete: true, verificationstatus: 'VERIFIED', verificationlevel: 2,
  issuspended: false, isbanned: false, accountdeletedat: null,
  servicearea: 'Harare', servicecategories: ['HOUSE', 'CAR'], serviceradiuskm: 25,
  photourl: `detail-media/${selfieObject}`, cleanerselfieat: now, updatedat: now,
} });

// 5. Legal acceptances through the service-only RPCs (record the current document versions).
await call('/rest/v1/rpc/accept_customer_agreement', { method: 'POST', body: { p_user_id: userId } });
await call('/rest/v1/rpc/accept_cleaner_agreement', { method: 'POST', body: { p_user_id: userId } }); // also sets role=CLEANER and cleanerAgreementAccepted

// 6. Prepaid commission credit through the wallet ledger (tops up to the floor only).
const wallet = (await call(`/rest/v1/users?id=eq.${userId}&select=balance,commissionbalance,commissionowed`))[0];
const currentCommission = Number(wallet.commissionbalance) || 0;
let credited = 0;
if (currentCommission < COMMISSION_FLOOR) {
  credited = Math.round((COMMISSION_FLOOR - currentCommission) * 100) / 100;
  await call('/rest/v1/rpc/record_wallet_transaction', { method: 'POST', body: {
    p_user_id: userId, p_type: 'CREDIT', p_amount: credited, p_balance_type: 'COMMISSION',
    p_description: 'App Review demo prepaid commission credit', p_idempotency_key: `review-demo-commission-${userId}-${Date.now()}`,
  } });
}

// 7. Start in customer mode, offline, no stored location, no commission debt.
await call(`/rest/v1/users?id=eq.${userId}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: {
  role: 'CUSTOMER', status: 'OFFLINE', location: {}, locationpoint: null, locationupdatedat: null,
  commissionowed: 0, cleaneragreementaccepted: true, updatedat: new Date().toISOString(),
} });

// 8. Verify every server check a cleaner hits.
const profile = (await call(`/rest/v1/users?id=eq.${userId}&select=*`))[0];
const acceptances = await call(`/rest/v1/legaldocumentacceptances?userid=eq.${userId}&select=documenttype,documentversion`);
const checks = {
  'phone confirmed on auth user': !!authUser.phone_confirmed_at && digits(authUser.phone) === digits(PHONE),
  'users.phone matches auth phone': digits(profile.phone) === digits(authUser.phone),
  'verification VERIFIED': profile.verificationstatus === 'VERIFIED',
  'cleaner agreement accepted': profile.cleaneragreementaccepted === true,
  'cleaner onboarding complete': profile.cleaneronboardingcomplete === true,
  'selfie path and marker': profile.photourl === `detail-media/profile-photos/${userId}/avatar.jpg` && !!profile.cleanerselfieat,
  'balance non-negative': Number(profile.balance) >= 0,
  'commission prepaid >= 10 and nothing owed': Number(profile.commissionbalance) >= COMMISSION_FLOOR && Number(profile.commissionowed) === 0,
  'not suspended/banned/deleted': !profile.issuspended && !profile.isbanned && !profile.accountdeletedat,
  'role CUSTOMER, status OFFLINE': profile.role === 'CUSTOMER' && profile.status === 'OFFLINE',
  'customer agreement recorded': acceptances.some((a) => a.documenttype === 'CUSTOMER' && a.documentversion === CUSTOMER_VERSION) && profile.hasagreedtoterms === true,
  'cleaner agreement recorded': acceptances.some((a) => a.documenttype === 'CLEANER' && a.documentversion === CLEANER_VERSION),
};
let failed = 0;
for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`); if (!ok) failed++; }
if (failed) throw new Error(`${failed} account check(s) failed.`);
console.log(`Commission credited this run: ${credited.toFixed(2)} (balance now ${Number(profile.commissionbalance).toFixed(2)}).`);

// 9. Credentials go only to the step summary.
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`## Apple App Review demo account (${EMAIL})`, '', `- Email: \`${EMAIL}\``, `- Password: \`${password}\``, `- Phone (pre-verified): \`${PHONE}\``, '- Modes: customer and verified cleaner (switch in-app). Prepaid commission credit: at least $10.', ''].join('\n'));
  console.log('Credentials written to the job step summary.');
} else {
  console.log('GITHUB_STEP_SUMMARY is not set; credentials were not written anywhere.');
}
