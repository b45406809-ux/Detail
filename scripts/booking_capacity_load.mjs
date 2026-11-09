import { appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const base = new URL(process.env.SUPABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || base.port !== '54321') {
  throw new Error('Refusing to run load against a non-local Supabase API.');
}
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runId = process.env.RUN_ID;
const bookingTotal = Number(process.env.BOOKING_TOTAL ?? 10_000);
const concurrency = Number(process.env.BOOKING_CONCURRENCY ?? 100);
if (!key || !/^[A-Za-z0-9_-]{8,120}$/.test(runId ?? '') || !Number.isInteger(bookingTotal) || bookingTotal !== 10_000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) {
  throw new Error('Invalid local benchmark configuration.');
}

const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
async function rpc(name, body) {
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

const durations = new Array(bookingTotal);
const failures = [];
let next = 0;
let notifiedCleaners = 0;
const startedAt = performance.now();
async function worker() {
  while (true) {
    const index = next++;
    if (index >= bookingTotal) return;
    const userSequence = index + 1;
    const actorId = `00000000-0000-0000-0000-${userSequence.toString(16).padStart(12, '0')}`;
    const requestStarted = performance.now();
    try {
      const bookingId = await rpc('create_booking', {
        p_actor_id: actorId,
        p_idempotency_key: `capacity_${runId}_${userSequence}`,
        p_booking: {
          category: 'HOUSE', serviceType: 'Capacity benchmark clean', bookingMode: 'SCHEDULED',
          timePreference: 'CUSTOM', scheduledDateTime: new Date(Date.now() + 86_400_000).toISOString(), budget: 30,
          location: { address: 'Synthetic Test Location', lat: -17.8, lng: 31 },
          checklist: { rooms: 2 }, capacityTestRun: runId,
        },
      });
      const id = Array.isArray(bookingId) ? bookingId[0] : bookingId;
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('create_booking returned no booking ID');
      notifiedCleaners += Number(await rpc('notify_scheduled_job_cleaners', { p_job_id: id, p_customer_id: actorId, p_limit: 20 })) || 0;
      durations[index] = performance.now() - requestStarted;
    } catch (error) {
      failures.push({ index, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsedMs = performance.now() - startedAt;
const completed = durations.filter(Number.isFinite).length;
const sorted = durations.filter(Number.isFinite).sort((a, b) => a - b);
const percentile = value => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] : 0;
const jobsFilter = new URL('/rest/v1/jobs', base);
jobsFilter.searchParams.set('select', 'id');
jobsFilter.searchParams.set('data->>capacityTestRun', `eq.${runId}`);
const countResponse = await fetch(jobsFilter, { method: 'HEAD', headers: { ...headers, prefer: 'count=exact', range: '0-0' } });
if (!countResponse.ok) throw new Error(`Could not verify persisted synthetic bookings (HTTP ${countResponse.status}).`);
const persistedBookings = Number(countResponse.headers.get('content-range')?.split('/')[1] ?? NaN);
const result = {
  runId, target: 'local Supabase PostgREST and booking SQL RPCs',
  requestedBookings: bookingTotal, concurrency, completedBookings: completed,
  failedBookings: failures.length, nearbyCleanerNotifications: notifiedCleaners,
  persistedBookings,
  elapsedSeconds: Number((elapsedMs / 1000).toFixed(2)),
  bookingsPerSecond: Number((completed / (elapsedMs / 1000)).toFixed(1)),
  bookingLatencyMs: { p50: Number(percentile(.50).toFixed(1)), p95: Number(percentile(.95).toFixed(1)), p99: Number(percentile(.99).toFixed(1)) },
};
console.log(JSON.stringify(result));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '## Local synthetic booking capacity test', '',
    `- Requests completed: ${completed}/${bookingTotal}`,
    `- Persisted bookings verified: ${persistedBookings}/${bookingTotal}`,
    `- Concurrent booking tasks: ${concurrency}`,
    `- Booking throughput: ${result.bookingsPerSecond}/sec`,
    `- End-to-end DB path latency: p50 ${result.bookingLatencyMs.p50} ms, p95 ${result.bookingLatencyMs.p95} ms, p99 ${result.bookingLatencyMs.p99} ms`,
    `- Nearby cleaner notifications created: ${notifiedCleaners}`,
    '- Target: local Supabase only; this does not measure hosted plan or Edge Function limits.',
  ].join('\n') + '\n');
}
if (failures.length || persistedBookings !== bookingTotal || notifiedCleaners !== bookingTotal * 20) {
  if (failures.length) console.error(`${failures.length} synthetic booking tasks failed. First failure: ${failures[0].error}`);
  if (persistedBookings !== bookingTotal) console.error(`Expected ${bookingTotal} persisted bookings, found ${persistedBookings}.`);
  if (notifiedCleaners !== bookingTotal * 20) console.error(`Expected ${bookingTotal * 20} cleaner notifications, found ${notifiedCleaners}.`);
  process.exitCode = 1;
}
