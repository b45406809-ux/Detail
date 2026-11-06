import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const backendUrl = process.env.SUPABASE_TEST_URL?.replace(/\/+$/, '');
const productionUrl = process.env.SUPABASE_PRODUCTION_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || '';
const runId = (process.env.QA_RUN_ID || process.env.GITHUB_RUN_ID || `local-${Date.now()}`)
  .replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48);
const manifestPath = process.env.QA_FIXTURE_MANIFEST || join(process.env.RUNNER_TEMP || '/tmp', `detail-qa-fixtures-${runId}.json`);

const allAdminPermissions = [
  'marketing.read', 'marketing.send', 'finance.read', 'finance.write', 'bookings.manage',
  'users.manage', 'support.manage', 'audit.read', 'admins.manage',
];

export const fixtureDefinitions = [
  ...Array.from({ length: 6 }, (_, index) => ({
    key: `customer${String(index + 1).padStart(2, '0')}`,
    role: 'CUSTOMER',
    displayName: index === 5 ? 'QA Customer With an Intentionally Long Name for Layout and Wrapping Coverage' : `QA Customer ${String(index + 1).padStart(2, '0')}`,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    key: `cleaner${String(index + 1).padStart(2, '0')}`,
    role: 'CLEANER',
    displayName: `QA Cleaner ${String(index + 1).padStart(2, '0')}`,
    verificationScenario: 'sandbox-verification-required',
    serviceCategories: index % 2 === 0 ? ['HOUSE'] : ['HOUSE', 'CAR'],
  })),
  {
    key: 'cleanerUnverified', role: 'CLEANER', displayName: 'QA Cleaner Unverified',
    verificationScenario: 'unverified', serviceCategories: ['HOUSE'],
  },
  {
    key: 'adminElevated', role: 'ADMIN', displayName: 'QA Admin Elevated',
    elevated: true, permissions: allAdminPermissions,
  },
  {
    key: 'adminBookingsOnly', role: 'ADMIN', displayName: 'QA Admin Bookings Only',
    elevated: false, permissions: ['bookings.manage'],
  },
];

export function assertIsolatedBackend({ testUrl, realUrl, kind, allowLocal = false }) {
  if (!testUrl || !realUrl) throw new Error('Both QA and production backend URLs are required.');
  if (!['local', 'staging'].includes(kind)) throw new Error('QA_TEST_BACKEND_KIND must be local or staging.');
  const test = new URL(testUrl);
  const production = new URL(realUrl);
  const normalize = (url) => `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}`;
  if (normalize(test) === normalize(production)) throw new Error('QA writes are blocked because the test backend is the production project.');
  if (kind === 'local') {
    if (!allowLocal || !['localhost', '127.0.0.1', '::1'].includes(test.hostname)) {
      throw new Error('Local QA fixtures require QA_ALLOW_LOCAL=true and a loopback backend.');
    }
    return true;
  }
  if (test.protocol !== 'https:' || !test.hostname.endsWith('.supabase.co')) {
    throw new Error('Staging QA fixtures require an HTTPS Supabase project URL.');
  }
  if (test.hostname === production.hostname) throw new Error('QA project and production project must use different Supabase hosts.');
  return true;
}

function requireSafeTarget() {
  assertIsolatedBackend({
    testUrl: backendUrl,
    realUrl: productionUrl,
    kind: process.env.QA_TEST_BACKEND_KIND,
    allowLocal: process.env.QA_ALLOW_LOCAL === 'true',
  });
  if (!serviceKey) throw new Error('SUPABASE_TEST_SERVICE_ROLE_KEY is required for the isolated fixture backend.');
  if (process.env.QA_TEST_BACKEND_KIND === 'staging') {
    const expectedRef = process.env.QA_STAGING_PROJECT_REF;
    const actualRef = new URL(backendUrl).hostname.split('.')[0];
    const productionRef = process.env.SUPABASE_PRODUCTION_PROJECT_REF;
    if (!expectedRef || expectedRef !== actualRef || !productionRef || expectedRef === productionRef) {
      throw new Error('Staging project reference did not match the explicitly selected isolated project.');
    }
  }
}

async function request(path, init = {}) {
  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  const bodyText = await response.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { /* only status is useful to this fixture setup */ }
  if (!response.ok) throw new Error(`QA fixture backend request failed (HTTP ${response.status}) at ${path}.`);
  return body;
}

async function writeProfile(user, fixture) {
  const profile = {
    role: fixture.role,
    displayname: fixture.displayName,
    hascompletedprofile: false,
    hasagreedtoterms: false,
    metadata: {
      qaRunId: runId,
      qaFixture: true,
      identityProviderReview: fixture.role === 'CLEANER' ? 'NOT_PERFORMED' : undefined,
      syntheticVerificationFixture: false,
    },
  };
  if (fixture.role === 'CLEANER') {
    Object.assign(profile, {
      cleaneragreementaccepted: false,
      cleaneronboardingcomplete: false,
      verificationstatus: 'NOT_STARTED',
      servicecategories: fixture.serviceCategories,
      serviceradiuskm: 15,
      experienceyears: 2,
      servicearea: 'QA Test Zone',
      address: 'QA Fixture Location',
      status: 'OFFLINE',
      location: { lat: -17.8292, lng: 31.0522 },
    });
  }
  await request(`/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(profile),
  });
  if (fixture.role === 'ADMIN') {
    await request('/rest/v1/adminroles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ userid: user.id, elevated: fixture.elevated, permissions: fixture.permissions }),
    });
  }
}

async function setGitHubEnv(users) {
  const envFile = process.env.GITHUB_ENV;
  if (!envFile) return;
  const rows = [];
  for (const user of users) {
    const name = `QA_${user.key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
    for (const value of [user.email, user.password]) console.log(`::add-mask::${value}`);
    rows.push(`${name}_EMAIL=${user.email}`, `${name}_PASSWORD=${user.password}`, `${name}_ID=${user.id}`);
  }
  await appendFile(envFile, rows.join('\n') + '\n');
}

async function create() {
  requireSafeTarget();
  await mkdir(dirname(manifestPath), { recursive: true });
  const manifest = { runId, backendRef: new URL(backendUrl).hostname.split('.')[0], created: [] };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  const created = [];
  try {
    for (const fixture of fixtureDefinitions) {
      const email = `detail-qa-${runId}-${fixture.key.toLowerCase()}@example.invalid`;
      const password = `Aa1!${randomBytes(24).toString('hex')}`;
      const user = await request('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { displayName: fixture.displayName, qaRunId: runId, qaFixture: true },
        }),
      });
      if (!user?.id) throw new Error(`Could not create QA fixture ${fixture.key}.`);
      const entry = { id: user.id, role: fixture.role, key: fixture.key };
      manifest.created.push(entry);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
      created.push({ ...entry, email, password });
      await writeProfile(user, fixture);
    }
    const ids = created.map(user => user.id);
    const profiles = await request(`/rest/v1/users?select=id,role,verificationstatus,cleaneragreementaccepted,cleaneronboardingcomplete,hasagreedtoterms&id=in.(${ids.join(',')})`);
    const roles = await request(`/rest/v1/adminroles?select=userid,elevated,permissions&userid=in.(${ids.join(',')})`);
    if (profiles.length !== fixtureDefinitions.length
      || profiles.filter(user => user.role === 'CUSTOMER').length !== 6
      || profiles.filter(user => user.role === 'CLEANER' && user.verificationstatus === 'NOT_STARTED').length !== 5
      || profiles.some(user => user.role === 'CLEANER' && (user.cleaneragreementaccepted || user.cleaneronboardingcomplete))
      || profiles.some(user => user.hasagreedtoterms)
      || roles.length !== 2
      || roles.filter(role => role.elevated === true && role.permissions.length === allAdminPermissions.length).length !== 1
      || roles.filter(role => role.elevated === false && role.permissions.join(',') === 'bookings.manage').length !== 1) {
      throw new Error('QA fixture backend state does not match the approved customer, cleaner, and administrator pool.');
    }
    await setGitHubEnv(created);
    console.log(`QA_FIXTURE_POOL_CREATED_AND_VERIFIED: ${created.length} synthetic users in isolated project ${manifest.backendRef}.`);
  } catch (error) {
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await cleanup();
    throw error;
  }
}

async function cleanup() {
  requireSafeTarget();
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { return; }
  if (manifest.backendRef !== new URL(backendUrl).hostname.split('.')[0]) {
    throw new Error('Fixture cleanup manifest does not match the explicitly selected backend.');
  }
  const outcomes = [];
  let failed = false;
  for (const fixture of manifest.created ?? []) {
    try {
      const jobs = await request(`/rest/v1/jobs?select=id&id=not.is.null&or=(customerid.eq.${fixture.id},cleanerid.eq.${fixture.id})`);
      const payments = await request(`/rest/v1/payments?select=id&or=(customerid.eq.${fixture.id},cleanerid.eq.${fixture.id})`);
      const closed = await request('/rest/v1/rpc/close_account', {
        method: 'POST', body: JSON.stringify({ p_user_id: fixture.id }),
      });
      if (closed !== true) throw new Error('Account anonymization did not confirm.');
      if (jobs.length || payments.length) {
        await request(`/auth/v1/admin/users/${encodeURIComponent(fixture.id)}`, {
          method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }),
        });
        outcomes.push({ id: fixture.id, role: fixture.role, result: 'ANONYMIZED_LOGIN_DISABLED_HISTORY_PRESERVED' });
      } else {
        await request(`/auth/v1/admin/users/${encodeURIComponent(fixture.id)}`, { method: 'DELETE' });
        outcomes.push({ id: fixture.id, role: fixture.role, result: 'ANONYMIZED_AND_LOGIN_REMOVED' });
      }
    } catch (error) {
      failed = true;
      outcomes.push({ id: fixture.id, role: fixture.role, result: 'CLEANUP_FAILED' });
      console.error(`QA_FIXTURE_CLEANUP_FAILED: ${fixture.key} (${error instanceof Error ? error.message : 'unknown error'})`);
      try {
        await request(`/auth/v1/admin/users/${encodeURIComponent(fixture.id)}`, {
          method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }),
        });
      } catch { /* retain all records and surface the cleanup failure */ }
    }
  }
  const redactedResult = { runId: manifest.runId, backendRef: manifest.backendRef, outcomes };
  const resultPath = manifestPath.replace(/\.json$/, '-cleanup.json');
  await writeFile(resultPath, JSON.stringify(redactedResult, null, 2), { mode: 0o600 });
  console.log(`QA_FIXTURE_CLEANUP_SUMMARY: ${outcomes.map(item => `${item.role}:${item.result}`).join(', ') || 'no accounts to clean'}`);
  if (failed) throw new Error(`QA fixture cleanup left failures. Manifest: ${resultPath}`);
}

const command = process.argv[2];
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (command === 'create') await create();
  else if (command === 'cleanup') await cleanup();
  else throw new Error('Use create or cleanup.');
}
