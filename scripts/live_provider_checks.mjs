import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const runId = String(process.env.GITHUB_RUN_ID || 'local').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
async function requestStatus(url, init = {}) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  } catch {
    return null;
  }
}

async function check(label, operation) {
  let passed = false;
  try {
    passed = await operation();
  } catch {
    passed = false;
  }
  console.log(`${label}: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

function configured(...names) {
  return names.every((name) => Boolean(secretValue(name)));
}

function secretValue(name) {
  const aliases = { DIDIT_API_KEY: 'DIDIT_KYC_SECRET_KEY', RESEND_API_KEY: 'EXPO_RESEND_API_KEY' };
  return process.env[name]?.trim() || process.env[aliases[name]]?.trim() || '';
}

async function supabaseChecks() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY;
  const authPassed = await check('SUPABASE_AUTH', async () => {
    if (!configured('SUPABASE_URL', 'SUPABASE_ANON_KEY')) return false;
    const response = await requestStatus(`${base}/auth/v1/health`, { headers: { apikey: anon } });
    return Boolean(response?.ok);
  });
  const restPassed = await check('SUPABASE_REST', async () => {
    if (!configured('SUPABASE_URL', 'SUPABASE_ANON_KEY')) return false;
    // Supabase publishable keys (sb_publishable_...) are API keys, not JWTs.
    // Send them as `apikey`; placing one in Authorization makes PostgREST
    // reject it as an invalid bearer token.
    const response = await requestStatus(`${base}/rest/v1/`, { headers: { apikey: anon } });
    console.log(`SUPABASE_REST_HTTP: ${response?.status ?? 'NETWORK'}`);
    return Boolean(response?.ok);
  });
  const functionPassed = await check('MARKETPLACE_READ_SMOKE', async () => {
    if (!configured('SUPABASE_URL', 'SUPABASE_ANON_KEY')) return false;
    const response = await requestStatus(`${base}/functions/v1/marketplace-api`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'getBetaConfig', data: {} }),
    });
    console.log(`MARKETPLACE_READ_HTTP: ${response?.status ?? 'NETWORK'}`);
    return Boolean(response?.ok);
  });
  return authPassed && restPassed && functionPassed;
}

async function twilioAccountCheck() {
  return check('TWILIO_ACCOUNT_API', async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!configured('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN') || !/^AC[\da-f]{32}$/i.test(sid)) return false;
    const authorization = Buffer.from(`${sid}:${token}`).toString('base64');
    const response = await requestStatus(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, {
      headers: { authorization: `Basic ${authorization}` },
    });
    return Boolean(response?.ok);
  });
}

async function resendAccountCheck() {
  return check('RESEND_ACCOUNT_API', async () => {
    const key = secretValue('RESEND_API_KEY');
    if (!key) return false;
    const response = await requestStatus('https://api.resend.com/domains', {
      headers: { authorization: `Bearer ${key}` },
    });
    console.log(`RESEND_DOMAINS_HTTP: ${response?.status ?? 'NETWORK'}`);
    if (!response?.ok) return false;
    const result = await response.json().catch(() => ({}));
    const domainReady = Array.isArray(result?.data) && result.data.some((domain) => domain.name === 'detailapp.co.zw');
    console.log(`RESEND_SENDER_DOMAIN: ${domainReady ? 'FOUND' : 'MISSING'}`);
    return domainReady;
  });
}

async function mapboxCheck() {
  return check('MAPBOX_STYLE_API', async () => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN;
    if (!token) return false;
    const url = new URL('https://api.mapbox.com/styles/v1/mapbox/streets-v12');
    url.searchParams.set('access_token', token);
    const response = await requestStatus(url);
    console.log(`MAPBOX_STYLE_HTTP: ${response?.status ?? 'NETWORK'}`);
    return Boolean(response?.ok);
  });
}

async function paynowE2E() {
  return check('PAYNOW_CHECKOUT_INIT', async () => {
    const id = process.env.PAYNOW_INTEGRATION_ID;
    const key = process.env.PAYNOW_INTEGRATION_KEY;
    const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
    if (!configured('PAYNOW_INTEGRATION_ID', 'PAYNOW_INTEGRATION_KEY', 'SUPABASE_URL')) return false;

    const { Paynow } = require('paynow');
    require('axios').defaults.timeout = 15000;
    const client = new Paynow(id, key, `${base}/functions/v1/paynow-webhook`, `${base}/functions/v1/paynow-return`);
    const payment = client.createPayment(`DETAIL-E2E-${runId}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`, `e2e-${runId}@example.com`);
    payment.add('Detail automated E2E test - do not pay', 1.00);

    const originalLog = console.log;
    console.log = () => {};
    let result;
    try {
      result = await client.send(payment);
    } finally {
      console.log = originalLog;
    }
    if (!result?.success || !result?.pollUrl || !result?.redirectUrl) return false;
    const pollUrl = new URL(String(result.pollUrl));
    const redirectUrl = new URL(String(result.redirectUrl));
    return pollUrl.protocol === 'https:' && ['paynow.co.zw', 'www.paynow.co.zw'].includes(pollUrl.hostname)
      && redirectUrl.protocol === 'https:' && ['paynow.co.zw', 'www.paynow.co.zw'].includes(redirectUrl.hostname);
  });
}

async function diditE2E() {
  return check('DIDIT_SESSION_CREATE', async () => {
    const key = secretValue('DIDIT_API_KEY');
    const workflow = process.env.DIDIT_WORKFLOW_ID;
    if (!configured('DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID')) return false;
    const response = await requestStatus('https://verification.didit.me/v2/session/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ workflow_id: workflow, vendor_data: `detail-e2e-${runId}-${randomUUID()}` }),
    });
    if (!response?.ok) return false;
    const result = await response.json().catch(() => ({}));
    const sessionUrl = result.session_url ?? result.url;
    try {
      const parsed = new URL(sessionUrl);
      return Boolean(result.session_id) && parsed.protocol === 'https:'
        && (parsed.hostname === 'didit.me' || parsed.hostname.endsWith('.didit.me'));
    } catch {
      return false;
    }
  });
}

async function resendEmailE2E() {
  return check('RESEND_TEST_EMAIL', async () => {
    const key = secretValue('RESEND_API_KEY');
    const recipient = process.env.LIVE_E2E_EMAIL_TO;
    if (!configured('RESEND_API_KEY', 'LIVE_E2E_EMAIL_TO') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return false;
    const response = await requestStatus('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: 'Detail E2E <hello@detailapp.co.zw>',
        to: [recipient],
        subject: 'Detail live delivery test',
        text: 'This is an automated Detail delivery test. No action is required.',
      }),
    });
    if (!response?.ok) return false;
    const created = await response.json().catch(() => ({}));
    if (typeof created.id !== 'string' || !created.id) return false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const statusResponse = await requestStatus(`https://api.resend.com/emails/${encodeURIComponent(created.id)}`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (statusResponse?.ok) {
        const status = await statusResponse.json().catch(() => ({}));
        if (status.last_event === 'delivered') return true;
        if (['bounced', 'complained'].includes(status.last_event)) return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return false;
  });
}

async function twilioSmsE2E() {
  return check('TWILIO_TEST_SMS', async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const from = process.env.TWILIO_FROM_NUMBER;
    const recipient = process.env.LIVE_E2E_SMS_TO;
    if (!configured('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'LIVE_E2E_SMS_TO')
      || (!service && !from) || !/^\+[1-9]\d{7,14}$/.test(recipient)) return false;

    const form = new URLSearchParams({ To: recipient, Body: 'Detail automated live delivery test. No action is required.' });
    if (service) form.set('MessagingServiceSid', service);
    else form.set('From', from);
    const authorization = Buffer.from(`${sid}:${token}`).toString('base64');
    const messagesUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const response = await requestStatus(messagesUrl, {
      method: 'POST',
      headers: { authorization: `Basic ${authorization}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (response?.status !== 201) return false;
    const created = await response.json().catch(() => ({}));
    if (typeof created.sid !== 'string' || !/^SM[\da-f]{32}$/i.test(created.sid)) return false;
    const statusUrl = `${messagesUrl}/${encodeURIComponent(created.sid)}.json`;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const statusResponse = await requestStatus(statusUrl, { headers: { authorization: `Basic ${authorization}` } });
      if (statusResponse?.ok) {
        const status = await statusResponse.json().catch(() => ({}));
        if (status.status === 'delivered') return true;
        if (['failed', 'undelivered', 'canceled'].includes(status.status)) return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return false;
  });
}

const tests = {
  supabase: supabaseChecks,
  twilio: twilioAccountCheck,
  resend: resendAccountCheck,
  mapbox: mapboxCheck,
  paynow: paynowE2E,
  didit: diditE2E,
  email: resendEmailE2E,
  sms: twilioSmsE2E,
};

const task = process.argv[2];
const selected = task === 'readiness'
  ? ['supabase', 'twilio', 'resend', 'mapbox']
  : task === 'all-e2e'
    ? Object.keys(tests)
    : (tests[task]
      ? [task]
      : ({ 'paynow-e2e': ['paynow'], 'didit-e2e': ['didit'], 'email-e2e': ['email'], 'sms-e2e': ['sms'] })[task]);

if (!selected) {
  console.log('LIVE_CHECK: FAIL');
  process.exit(2);
}

let passed = true;
for (const name of selected) {
  if (!await tests[name]()) passed = false;
}
process.exit(passed ? 0 : 1);
