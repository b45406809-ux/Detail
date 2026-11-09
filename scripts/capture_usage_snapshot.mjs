import { appendFileSync } from 'node:fs';

const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key || !process.env.SUPABASE_PROJECT_REF) throw new Error('Missing required Supabase usage-snapshot configuration.');

const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
const rpc = await fetch(`${base}/rest/v1/rpc/admin_database_usage`, { method: 'POST', headers, body: '{}' });
if (!rpc.ok) throw new Error(`Supabase aggregate usage RPC failed (HTTP ${rpc.status}).`);
const metrics = await rpc.json();

let providerMeters = { supabaseApiRequests: { status: 'not connected', note: 'Supabase Management API token is not configured.' } };
if (process.env.SUPABASE_ACCESS_TOKEN) {
  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(process.env.SUPABASE_PROJECT_REF)}/analytics/endpoints/usage.api-counts?interval=1d`;
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
    if (!response.ok) {
      providerMeters.supabaseApiRequests = { status: 'not connected', note: `Management API returned HTTP ${response.status}; analytics permission may be unavailable.` };
    } else {
      const payload = await response.json();
      const data = Array.isArray(payload) ? payload : (payload.result ?? payload.data ?? []);
      const now = Date.now();
      const day = data.filter(item => !item.timestamp || now - Date.parse(item.timestamp) < 24 * 60 * 60 * 1000);
      const counts = Object.fromEntries(['auth', 'realtime', 'rest', 'storage'].map(kind => [kind, day.reduce((sum, item) => sum + Number(item[`total_${kind}_requests`] ?? 0), 0)]));
      providerMeters.supabaseApiRequests = { status: 'measured', interval: 'last 24 hours', asOf: new Date().toISOString(), counts, note: 'Request counts are telemetry, not Supabase billing meters.' };
    }
  } catch {
    providerMeters.supabaseApiRequests = { status: 'unavailable', note: 'Management API request failed; aggregate database metrics were still captured.' };
  }
}

const capturedAt = new Date().toISOString();
const snapshot = { captured_date: capturedAt.slice(0, 10), captured_at: capturedAt, metrics, provider_meters: providerMeters };
const upsert = await fetch(`${base}/rest/v1/usage_snapshots?on_conflict=captured_date`, {
  method: 'POST', headers: { ...headers, prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(snapshot),
});
if (!upsert.ok) throw new Error(`Snapshot storage failed (HTTP ${upsert.status}); apply the usage_snapshots migration first.`);

const summary = [
  '## Daily usage snapshot', '', `Captured at: ${capturedAt} (UTC)`,
  `Database: ${Number(metrics.databaseBytes ?? 0)} bytes`,
  `Supabase Storage objects: ${Number(metrics.fileCount ?? 0)} (${Number(metrics.fileStorageBytes ?? 0)} bytes)`,
  `Active user sign-in estimate (30d): ${Number(metrics.activeUsers30d ?? 0)}`,
  `Chat messages (30d): ${Number(metrics.messages30d ?? 0)}`,
  `Supabase API request telemetry: ${providerMeters.supabaseApiRequests.status}`,
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
console.log('Daily aggregate usage snapshot saved.');
