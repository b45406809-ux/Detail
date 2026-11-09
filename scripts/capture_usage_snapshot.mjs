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

let twilio = { status: 'not connected', note: 'Twilio reporting credentials are not configured.' };
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const credentials = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Usage/Records/LastMonth.json`, {
      headers: { authorization: `Basic ${credentials}` },
    });
    if (!response.ok) {
      twilio = { status: 'unavailable', note: `Twilio Usage API returned HTTP ${response.status}.` };
    } else {
      const payload = await response.json();
      const records = (payload.usage_records ?? []).filter(record => String(record.category ?? '').toLowerCase().includes('sms'));
      twilio = {
        status: 'measured', interval: 'previous calendar month', currency: 'USD',
        records: records.map(record => ({
          category: record.category, count: Number(record.count ?? 0), countUnit: record.count_unit,
          usage: Number(record.usage ?? 0), usageUnit: record.usage_unit,
          price: Number(record.price ?? 0), priceUnit: record.price_unit,
        })),
        note: 'Twilio usage records are provider reported; totals may exclude taxes or pending adjustments.',
      };
    }
  } catch {
    twilio = { status: 'unavailable', note: 'Twilio Usage API request failed.' };
  }
}
providerMeters.twilio = twilio;

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
  `Twilio SMS usage: ${providerMeters.twilio.status}`,
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
console.log(`Usage provider status: Supabase requests=${providerMeters.supabaseApiRequests.status} (${providerMeters.supabaseApiRequests.note}); Twilio SMS=${providerMeters.twilio.status}.`);
console.log('Daily aggregate usage snapshot saved.');
