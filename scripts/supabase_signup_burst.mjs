import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { appendFile } from 'node:fs/promises';

const base = new URL(process.env.SUPABASE_TEST_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || base.port !== '54321') {
  throw new Error('Refusing to run the signup burst against a hosted Supabase project.');
}
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const runId = String(process.env.RUN_ID ?? 'local').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
const accountTotal = 20;
if (!anon || !service || !runId) throw new Error('Local signup benchmark configuration is incomplete.');

const users = [];
const latencies = [];
const failures = [];
const sortedPercentile = percentile => {
  const values = [...latencies].sort((a, b) => a - b);
  return values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * percentile) - 1)] : 0;
};

try {
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: accountTotal }, async (_, index) => {
    const email = `detail-signup-${runId}-${index + 1}@example.invalid`;
    const password = `Aa1!${randomBytes(24).toString('hex')}`;
    const requestStarted = performance.now();
    try {
      const response = await fetch(new URL('/auth/v1/signup', base), {
        method: 'POST',
        headers: { apikey: anon, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, data: { displayName: `Synthetic Signup ${index + 1}`, signupBurstRun: runId } }),
        signal: AbortSignal.timeout(30000),
      });
      const body = await response.json().catch(() => null);
      const userId = body?.user?.id ?? body?.id;
      if (!response.ok || !userId) {
        failures.push({ index, status: response.status, message: String(body?.msg ?? body?.message ?? body?.error_description ?? `signup response keys: ${Object.keys(body ?? {}).join(',')}`).slice(0, 140) });
        return null;
      }
      const user = { id: userId, email };
      users.push(user);
      latencies.push(performance.now() - requestStarted);
      return user;
    } catch (error) {
      failures.push({ index, status: 0, message: error instanceof Error ? error.name : 'network error' });
      return null;
    }
  }));
  const created = results.filter(Boolean);
  const ids = created.map(user => user.id);
  const verification = await fetch(new URL(`/rest/v1/users?select=id&id=in.(${ids.join(',')})`, base), {
    headers: { apikey: service, authorization: `Bearer ${service}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!verification.ok) throw new Error(`Could not verify local signup profiles (HTTP ${verification.status}).`);
  const profiles = await verification.json();
  const elapsedMs = performance.now() - started;
  const summary = {
    target: 'local Supabase Auth and profile creation',
    backend: 'loopback only; no hosted users or provider messages',
    requestedRegistrations: accountTotal,
    concurrency: accountTotal,
    successfulRegistrations: created.length,
    failedRegistrations: failures.length,
    persistedProfiles: profiles.length,
    elapsedSeconds: Number((elapsedMs / 1000).toFixed(2)),
    registrationsPerSecond: Number((created.length / (elapsedMs / 1000)).toFixed(1)),
    latencyMs: {
      p50: Number(sortedPercentile(0.5).toFixed(1)),
      p95: Number(sortedPercentile(0.95).toFixed(1)),
      p99: Number(sortedPercentile(0.99).toFixed(1)),
    },
  };
  console.log(JSON.stringify(summary));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '## Local 20-account registration burst', '',
      `- Registrations accepted: ${created.length}/${accountTotal}`,
      `- Profiles persisted: ${profiles.length}/${accountTotal}`,
      `- Throughput: ${summary.registrationsPerSecond}/sec`,
      `- Registration latency: p50 ${summary.latencyMs.p50} ms, p95 ${summary.latencyMs.p95} ms, p99 ${summary.latencyMs.p99} ms`,
      '- Target: disposable local Supabase only; no production data or external email/SMS providers.',
    ].join('\n') + '\n');
  }
  if (created.length !== accountTotal || profiles.length !== accountTotal || failures.length) {
    if (failures.length) console.error(`First signup failure: ${JSON.stringify(failures[0])}`);
    throw new Error('Twenty concurrent signups did not all create persisted profiles.');
  }
} finally {
  const cleanupFailures = [];
  for (const user of users) {
    const response = await fetch(new URL(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, base), {
      method: 'DELETE',
      headers: { apikey: service, authorization: `Bearer ${service}` },
      signal: AbortSignal.timeout(30000),
    }).catch(() => null);
    if (!response?.ok) cleanupFailures.push(user.id);
  }
  if (cleanupFailures.length) throw new Error(`Could not remove ${cleanupFailures.length} disposable local benchmark accounts.`);
  console.log(`LOCAL_SIGNUP_BURST_CLEANUP: ${users.length}/${accountTotal} accounts deleted`);
}
