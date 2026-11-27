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
try {
  const edge = await logs(`select timestamp, response.status_code as status, request.method as method, m.function_id as fn, m.execution_time_ms as ms, event_message
    from function_edge_logs cross join unnest(metadata) as m cross join unnest(m.response) as response cross join unnest(m.request) as request
    where response.status_code >= 400 order by timestamp asc limit 100`);
  lines.push(`### Failed requests (${edge.length})`, '', ...edge.map((r) => `- ${new Date(Number(r.timestamp) / 1000).toISOString()} ${r.status} ${r.method} ${r.ms ?? ''}ms ${String(r.event_message).slice(0, 160)}`), '');
} catch (error) { lines.push(`Failed requests: could not read (${error.message})`, ''); }
try {
  const fn = await logs(`select timestamp, event_message, m.level as level from function_logs cross join unnest(metadata) as m
    where m.level in ('error','warning') order by timestamp asc limit 100`);
  lines.push(`### Function error logs (${fn.length})`, '', ...fn.map((r) => `- ${new Date(Number(r.timestamp) / 1000).toISOString()} ${r.level}: ${String(r.event_message).slice(0, 300)}`), '');
} catch (error) { lines.push(`Function logs: could not read (${error.message})`, ''); }
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
