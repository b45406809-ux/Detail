#!/usr/bin/env node
// Read-only: lists marketplace-api requests that failed (HTTP >= 400) and the function's
// own error logs in a time window, from the Supabase Management API.
// Env: SUPABASE_ACCESS_TOKEN, SUPABASE_URL, FROM, TO (ISO timestamps)
import { appendFileSync } from 'node:fs';
const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const from = process.env.FROM, to = process.env.TO;
async function logs(sql) {
  const url = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs`);
  url.searchParams.set('iso_timestamp_start', from); url.searchParams.set('iso_timestamp_end', to); url.searchParams.set('sql', sql);
  const response = await fetch(url, { headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(`HTTP ${response.status} ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  return body.result ?? [];
}
const lines = [`## Edge function errors ${from} → ${to}`, ''];
const ts = (t) => { const n = Number(t); return Number.isFinite(n) ? new Date(n > 1e14 ? n / 1000 : n).toISOString() : String(t); };
try {
  const sources = await logs(`SELECT source, count() AS n FROM logs GROUP BY source`);
  lines.push(`Sources: ${sources.map((r) => `${r.source}=${r.n}`).join(', ')}`, '');
  const rows = [];
  for (const src of ['function_edge_logs', 'function_logs']) {
    rows.push(...(await logs(`SELECT timestamp, source, event_message, log_attributes FROM logs WHERE source = '${src}' ORDER BY timestamp ASC LIMIT 200`)).map((r) => ({ ...r, source: src })));
  }
  const interesting = rows.filter((r) => {
    const a = r.log_attributes ?? {};
    const status = Number(a['response.status_code'] ?? a['status_code'] ?? a['response.status'] ?? (String(r.event_message).match(/\| (\d{3}) \|/) ?? [])[1]);
    r.status = status;
    return true;
  });
  lines.push(`### Rows (${interesting.length} of ${rows.length})`, '');
  for (const r of interesting.slice(0, 80)) lines.push(`- ${ts(r.timestamp)} [${r.source}] ${Number.isFinite(r.status) ? r.status : ''} ${String(r.event_message).slice(0, 220)}`);
  if (rows[0]) lines.push('', 'Attribute keys: ' + Object.keys(rows[0].log_attributes ?? {}).join(', '));
} catch (error) { lines.push(`Could not read logs (${error.message})`); }
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
