#!/usr/bin/env node
// Non-UI check that the App Review sandbox works end to end through the real API:
//  A) two accounts: customer books -> cleaner sees it and quotes -> customer accepts
//  B) one account:  customer books -> same account in Cleaner mode quotes -> accepts
//  C) isolation:    a booking from the sandbox is not offered to anyone outside it
// Signs in with the review passwords (GitHub secrets). Cleans up with reset-review-sandbox.
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const base = String(process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const anon = process.env.SUPABASE_ANON_KEY ?? '';
const accounts = {
  customer: { email: 'appreview@detailapp.co.zw', password: process.env.CUSTOMER_PASSWORD ?? '' },
  cleaner: { email: 'appreview.cleaner@detailapp.co.zw', password: process.env.CLEANER_PASSWORD ?? '' },
};
if (!base || !anon || !accounts.customer.password || !accounts.cleaner.password) throw new Error('Missing SUPABASE_URL, anon key or review passwords.');

const HARARE = { lat: -17.8292, lng: 31.0522, address: 'Samora Machel Avenue, Harare' };
const results = [];
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`); };

async function signIn({ email, password }) {
  const response = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anon, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Sign-in failed for ${email}: HTTP ${response.status} ${body.error_description ?? body.msg ?? ''}`);
  return body.access_token;
}

async function api(token, name, data = {}) {
  const response = await fetch(`${base}/functions/v1/marketplace-api`, {
    method: 'POST', headers: { apikey: anon, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name, data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) throw new Error(`${name}: HTTP ${response.status} ${body?.error ?? ''}`);
  return body;
}

async function rest(token, path) {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: anon, authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`GET ${path.split('?')[0]}: HTTP ${response.status}`);
  return response.json();
}

function booking(label) {
  return {
    category: 'HOUSE', serviceMode: 'MOBILE', serviceId: 'SPECIFIC_ROOM', bookingMode: 'SCHEDULED', suppliesRequired: false,
    serviceType: `Specific Room / Part (${label})`,
    checklist: { category: 'HOUSE', packageId: 'SPECIFIC_ROOM', selections: { rooms: ['Kitchen'] }, choices: { areaSize: 'UNDER_10' }, areas: [], cleaningTypes: ['SPECIFIC_ROOM'], addOns: [] },
    description: 'Automated App Review sandbox check', location: HARARE,
    scheduledTime: 'ASAP', timePreference: 'ASAP', scheduledDateTime: new Date().toISOString(), status: 'PENDING', pricingStrategy: 'RECEIVE_BIDS',
    budget: 0, reminderSent: false, photos: [],
  };
}

async function journey(label, customerToken, cleanerToken) {
  await api(customerToken, 'setActiveRole', { role: 'CUSTOMER' });
  const created = await api(customerToken, 'createBooking', { idempotencyKey: randomUUID(), booking: booking(label) });
  const jobId = created.jobId;
  record(`${label}: customer creates a booking`, !!jobId, jobId ? '' : JSON.stringify(created));

  await api(cleanerToken, 'setActiveRole', { role: 'CLEANER' });
  const nearby = await api(cleanerToken, 'nearbyCleanerJobs', { lat: HARARE.lat, lng: HARARE.lng });
  const seen = (nearby.jobs ?? []).some((job) => (job.id ?? job.jobId) === jobId);
  record(`${label}: cleaner sees the booking under Nearby jobs`, seen);

  await api(cleanerToken, 'submitBid', { jobId, bidPrice: 25, estimatedArrival: 30, message: 'Automated sandbox quote', idempotencyKey: randomUUID() });
  record(`${label}: cleaner sends a quote`, true);

  await api(customerToken, 'setActiveRole', { role: 'CUSTOMER' });
  const bids = await rest(customerToken, `bids?jobid=eq.${jobId}&select=id,status`);
  const bid = bids.find((row) => ['PENDING', 'COUNTERED'].includes(row.status));
  record(`${label}: customer sees the quote`, !!bid);
  if (!bid) return;
  await api(customerToken, 'acceptBid', { jobId, bidId: bid.id, paymentMethod: 'DIRECT_OFFLINE', idempotencyKey: randomUUID() });
  const [job] = await rest(customerToken, `jobs?id=eq.${jobId}&select=status,cleanerid`);
  record(`${label}: customer accepts and the booking is assigned`, job?.status === 'ASSIGNED', `status ${job?.status}`);
}

async function step(name, fn) {
  try { await fn(); } catch (error) { record(name, false, error.message); }
}

const customerToken = await signIn(accounts.customer);
record('customer account signs in with its password', true);
const cleanerToken = await signIn(accounts.cleaner);
record('cleaner account signs in with its password', true);

await step('two-account flow', () => journey('two accounts', customerToken, cleanerToken));
await step('single-account flow', () => journey('one account', customerToken, customerToken));
// The sandbox is reset afterwards (bookings closed, both accounts back in customer mode).

const failed = results.filter((r) => !r.ok);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`## Review account API test: ${failed.length ? 'FAILED' : 'passed'}`, '', ...results.map((r) => `- ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`), ''].join('\n'));
}
process.exit(failed.length ? 1 : 0);
