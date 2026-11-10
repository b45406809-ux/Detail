import { appendFileSync } from 'node:fs';
import { twilioUsageRecords } from './provider_usage_helpers.mjs';

const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key || !process.env.SUPABASE_PROJECT_REF) throw new Error('Missing required Supabase usage-snapshot configuration.');

const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
const rpc = await fetch(`${base}/rest/v1/rpc/admin_database_usage`, { method: 'POST', headers, body: '{}' });
if (!rpc.ok) throw new Error(`Supabase aggregate usage RPC failed (HTTP ${rpc.status}).`);
const metrics = await rpc.json();

let providerMeters = { supabaseApiRequests: { status: 'not connected', note: 'Supabase Management API token is not configured.' } };
if (process.env.SUPABASE_ACCESS_TOKEN) {
  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(process.env.SUPABASE_PROJECT_REF)}/analytics/endpoints/usage.api-counts?interval=1day`;
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
    if (!response.ok) {
      providerMeters.supabaseApiRequests = { status: 'not connected', note: `Management API returned HTTP ${response.status}.` };
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
let twilioVoice = { status: 'not connected', note: 'Twilio reporting credentials are not configured.' };
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const credentials = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Usage/Records/LastMonth.json`, {
      headers: { authorization: `Basic ${credentials}` },
    });
    if (!response.ok) {
      twilio = { status: 'unavailable', note: `Twilio Usage API returned HTTP ${response.status}.` };
      twilioVoice = { status: 'unavailable', note: `Twilio Usage API returned HTTP ${response.status}.` };
    } else {
      const payload = await response.json();
      const usageRecords = payload.usage_records ?? [];
      twilio = {
        status: 'measured', interval: 'previous calendar month', currency: 'USD',
        records: twilioUsageRecords(usageRecords, 'sms'),
        note: 'Twilio usage records are provider reported; totals may exclude taxes or pending adjustments.',
      };
      twilioVoice = {
        status: 'measured', interval: 'previous calendar month', currency: 'USD',
        records: twilioUsageRecords(usageRecords, 'voice'),
        note: 'Account-wide Twilio calls/voice usage from provider records. It is not attributable to Detail app calls and may exclude taxes or pending adjustments.',
      };
    }
  } catch {
    twilio = { status: 'unavailable', note: 'Twilio Usage API request failed.' };
    twilioVoice = { status: 'unavailable', note: 'Twilio Usage API request failed.' };
  }
}
providerMeters.twilio = twilio;
providerMeters.twilioVoice = twilioVoice;

// SMSPoP's campaign listing is a read-only reporting endpoint. Do not call
// POST /campaigns here: that endpoint immediately sends real, billable SMS.
let smspop = { status: 'not connected', note: 'SMSPoP reporting token is not configured.' };
if (process.env.SMSPOP_API_KEY || process.env.SMSPOP_API_TOKEN) {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const totals = { campaigns: 0, recipients: 0, sent: 0, failed: 0, delivered: 0, undelivered: 0 };
    let page = 1;
    let reachedCutoff = false;
    let lastPage = 1;
    let reportedLastPage = 1;
    // Bound API calls if an account has an unexpectedly long history. At
    // 15 campaigns/page this reads at most 1,500 campaign summaries.
    while (page <= 100 && page <= lastPage && !reachedCutoff) {
      const response = await fetch(`https://smspop.co.zw/api/campaigns?page=${page}`, {
        headers: { authorization: `Bearer ${process.env.SMSPOP_API_KEY || process.env.SMSPOP_API_TOKEN}`, accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        smspop = { status: 'unavailable', note: `SMSPoP reporting API returned HTTP ${response.status}.` };
        break;
      }
      const payload = await response.json();
      const campaigns = payload?.data?.campaigns;
      if (payload?.success !== true || !Array.isArray(campaigns)) {
        smspop = { status: 'unavailable', note: 'SMSPoP did not return campaign usage records.' };
        break;
      }
      reportedLastPage = Math.max(1, Number(payload.data?.meta?.last_page) || 1);
      lastPage = Math.min(100, reportedLastPage);
      for (const campaign of campaigns) {
        const createdAt = Date.parse(campaign.created_at);
        if (Number.isFinite(createdAt) && createdAt < cutoff) { reachedCutoff = true; continue; }
        if (!Number.isFinite(createdAt)) continue;
        totals.campaigns++;
        totals.recipients += Number(campaign.total_contacts) || 0;
        totals.sent += Number(campaign.sent) || 0;
        totals.failed += Number(campaign.failed) || 0;
        totals.delivered += Number(campaign.delivered) || 0;
        totals.undelivered += Number(campaign.undelivered) || 0;
      }
      page++;
    }
    if (smspop.status === 'not connected') {
      smspop = {
        status: 'measured', interval: 'last 30 days', asOf: new Date().toISOString(), ...totals,
        truncated: page > 100 && !reachedCutoff && reportedLastPage > 100,
        note: 'SMSPoP campaign report counts only. Campaign listing does not report SMS-part credits or account balance; long messages may consume multiple credits per recipient.',
      };
    }
  } catch {
    smspop = { status: 'unavailable', note: 'SMSPoP campaign reporting request failed.' };
  }
}
providerMeters.smspop = smspop;

let posthog = { status: 'not connected', note: 'PostHog read-only query credentials are not configured.' };
if (process.env.POSTHOG_PERSONAL_API_KEY && /^\d+$/.test(process.env.POSTHOG_PROJECT_ID ?? '')) {
  try {
    const host = (process.env.POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
    const response = await fetch(`${host}/api/projects/${encodeURIComponent(process.env.POSTHOG_PROJECT_ID)}/query/`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: 'SELECT count() AS events FROM events WHERE timestamp >= now() - INTERVAL 30 DAY' } }),
      redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      posthog = { status: 'unavailable', note: `PostHog query API returned HTTP ${response.status}.` };
    } else {
      const payload = await response.json();
      const eventCount = Number(payload?.results?.[0]?.[0]);
      posthog = Number.isFinite(eventCount)
        ? { status: 'measured', interval: 'last 30 days', asOf: new Date().toISOString(), eventCount, note: 'HogQL event count is usage telemetry; verify billable event totals and plan quota in PostHog billing.' }
        : { status: 'unavailable', note: 'PostHog query API returned no event count.' };
    }
  } catch {
    posthog = { status: 'unavailable', note: 'PostHog usage query failed.' };
  }
}
providerMeters.posthog = posthog;

let resend = { status: 'not connected', note: 'Resend email reporting key is not configured.' };
if (process.env.RESEND_API_KEY) {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const totals = { emails: 0 };
    let after;
    let pages = 0;
    let hasMore = true;
    let reachedCutoff = false;
    while (hasMore && pages < 20 && !reachedCutoff) {
      const url = new URL('https://api.resend.com/emails');
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        resend = { status: 'unavailable', note: `Resend email reporting API returned HTTP ${response.status}.` };
        break;
      }
      const payload = await response.json();
      const emails = payload?.data;
      if (!Array.isArray(emails)) {
        resend = { status: 'unavailable', note: 'Resend did not return email log records.' };
        break;
      }
      pages++;
      for (const email of emails) {
        const createdAt = Date.parse(email.created_at);
        if (Number.isFinite(createdAt) && createdAt < cutoff) { reachedCutoff = true; continue; }
        if (!Number.isFinite(createdAt)) continue;
        totals.emails++;
      }
      hasMore = payload.has_more === true && emails.length > 0;
      after = emails.at(-1)?.id;
      if (!after) hasMore = false;
    }
    if (resend.status === 'not connected') {
      resend = {
        status: 'measured', interval: 'last 30 days', asOf: new Date().toISOString(), ...totals,
        truncated: hasMore && !reachedCutoff,
        note: 'Resend email-log count is telemetry, not an invoice total; recipient-level billing and account quota are shown in Resend billing.',
      };
    }
  } catch {
    resend = { status: 'unavailable', note: 'Resend email reporting request failed.' };
  }
}
providerMeters.resend = resend;

let cloudflareR2 = { status: 'not connected', note: 'Cloudflare R2 account metrics credentials are not configured.' };
if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_R2_API_TOKEN) {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/r2/metrics`;
    const response = await fetch(url, { headers: { authorization: `Bearer ${process.env.CLOUDFLARE_R2_API_TOKEN}` } });
    if (!response.ok) {
      cloudflareR2 = { status: 'unavailable', note: `Cloudflare R2 metrics API returned HTTP ${response.status}.` };
    } else {
      const payload = await response.json();
      if (!payload.success || !payload.result) {
        cloudflareR2 = { status: 'unavailable', note: 'Cloudflare did not return account-level R2 metrics.' };
      } else {
        const published = ['standard', 'infrequentAccess'].map(name => payload.result[name]?.published ?? {});
        cloudflareR2 = {
          status: 'measured', interval: 'current account metrics', scope: 'all buckets',
          storageBytes: published.reduce((sum, item) => sum + Number(item.payloadSize ?? 0), 0),
          objectCount: published.reduce((sum, item) => sum + Number(item.objects ?? 0), 0),
          freeStorageBytes: 10_000_000_000,
          note: 'Account-level published object metrics; may lag recent changes. Includes all buckets in this Cloudflare account.',
        };
      }
    }
  } catch {
    cloudflareR2 = { status: 'unavailable', note: 'Cloudflare R2 metrics API request failed.' };
  }
}
providerMeters.cloudflareR2 = cloudflareR2;

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
  `SMSPoP campaign usage: ${providerMeters.smspop.status}`,
  `PostHog event usage: ${providerMeters.posthog.status}`,
  `Resend email usage: ${providerMeters.resend.status}`,
  `Cloudflare R2 usage: ${providerMeters.cloudflareR2.status}`,
].join('\n');
const smsPopSummary = providerMeters.smspop.status === 'measured'
  ? `\nSMSPoP accepted recipients (30d): ${providerMeters.smspop.sent}; delivered: ${providerMeters.smspop.delivered}; campaigns: ${providerMeters.smspop.campaigns}. Credits/balance are not available from the campaign list.`
  : '';
const posthogSummary = providerMeters.posthog.status === 'measured' ? `\nPostHog events (30d): ${providerMeters.posthog.eventCount}.` : '';
const resendSummary = providerMeters.resend.status === 'measured' ? `\nResend email logs (30d): ${providerMeters.resend.emails}.${providerMeters.resend.truncated ? ' History capped at 2,000 emails.' : ''}` : '';
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + smsPopSummary + posthogSummary + resendSummary + '\n');
console.log(`Usage provider status: Supabase requests=${providerMeters.supabaseApiRequests.status} (${providerMeters.supabaseApiRequests.note}); Twilio SMS=${providerMeters.twilio.status}; SMSPoP=${providerMeters.smspop.status}; PostHog=${providerMeters.posthog.status}; Resend=${providerMeters.resend.status}; Cloudflare R2=${providerMeters.cloudflareR2.status} (${providerMeters.cloudflareR2.note}).`);
console.log('Daily aggregate usage snapshot saved.');
