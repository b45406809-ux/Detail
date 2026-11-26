#!/usr/bin/env node
// Clears the App Review sandbox before a screenshot/review test run: closes any open
// bookings between the two review accounts and returns both to customer mode, offline.
// Touches only accounts flagged users.isReviewAccount; never real users.
const base = String(process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)) throw new Error('SUPABASE_URL is missing or not a Supabase project URL.');
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]} failed with HTTP ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const reviewUsers = await call('/rest/v1/users?isreviewaccount=eq.true&select=id,email');
if (reviewUsers.length !== 2) throw new Error(`Expected 2 review accounts, found ${reviewUsers.length}. Run create-review-demo-account first.`);
const ids = reviewUsers.map((user) => user.id);
const list = `(${ids.join(',')})`;

const open = await call(`/rest/v1/jobs?customerid=in.${list}&status=not.in.(COMPLETED,CANCELLED)&select=id`);
for (const job of open) {
  await call(`/rest/v1/openjobs?jobid=eq.${job.id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  await call(`/rest/v1/bids?jobid=eq.${job.id}&status=in.(PENDING,COUNTERED)`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: { status: 'REJECTED' } });
  await call(`/rest/v1/jobs?id=eq.${job.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: { status: 'CANCELLED', updatedat: new Date().toISOString() } });
}
await call(`/rest/v1/users?id=in.${list}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: { role: 'CUSTOMER', status: 'OFFLINE', commissionowed: 0 } });
console.log(`Review sandbox reset: closed ${open.length} open review booking(s); both accounts in customer mode.`);
