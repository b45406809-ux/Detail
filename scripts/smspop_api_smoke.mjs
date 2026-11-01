const apiKey = process.env.SMSPOP_API_KEY;
const recipient = process.env.LIVE_E2E_SMS_TO;
const senderId = process.env.SMSPOP_SENDER_ID || 'SMSPoP';

function fail(message) {
  console.error(`SMSPOP_API_TEST: FAIL (${message})`);
  process.exit(1);
}

if (process.env.CONFIRM_SIDE_EFFECTS !== 'true') fail('explicit confirmation required');
if (!apiKey) fail('SMSPOP_API_KEY is not configured');
if (!recipient || !/^\+[1-9]\d{7,14}$/.test(recipient)) fail('LIVE_E2E_SMS_TO is missing or invalid');
if (!/^[A-Za-z0-9]{3,13}$/.test(senderId)) fail('SMSPOP_SENDER_ID is invalid');

const requestBody = {
  name: `Detail shared-sender API test ${process.env.GITHUB_RUN_ID || Date.now()}`,
  message: 'Detail SMS API test. No action is required.',
  sender_id: senderId,
  contact_import_method: 'manual',
  manual_contacts: recipient,
};

let response;
try {
  response = await fetch('https://smspop.co.zw/api/campaigns', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
} catch (error) {
  fail(error instanceof Error ? error.name : 'network error');
}

if (!response.ok) fail(`provider HTTP ${response.status}`);

let result;
try {
  result = await response.json();
} catch {
  fail('provider returned invalid JSON');
}

const contact = Array.isArray(result?.data?.contacts) ? result.data.contacts[0] : null;
const status = typeof contact?.status === 'string' ? contact.status.toLowerCase() : 'unknown';
const reason = typeof contact?.reason === 'string'
  ? contact.reason.replace(/[\r\n\t]/g, ' ').replaceAll(recipient, '[recipient]').replaceAll(recipient.replace(/\D/g, ''), '[recipient]').slice(0, 160)
  : '';
console.log(`SMSPOP_API_CONTACT_STATUS: ${status}`);
if (reason) console.log(`SMSPOP_API_REASON: ${reason}`);
if (Number.isFinite(Number(result?.data?.summary?.credits_used))) {
  console.log(`SMSPOP_CREDITS_USED: ${Number(result.data.summary.credits_used)}`);
}

if (result?.success !== true || status !== 'sent') fail('the shared sender was not accepted by the API');
console.log('SMSPOP_API_TEST: PASS (message accepted; carrier delivery is not confirmed by this response)');
