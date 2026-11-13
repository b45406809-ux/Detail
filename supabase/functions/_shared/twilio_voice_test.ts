import { createTwilioVoiceToken, twimlForClient, validateTwilioWebhookSignature, voiceCallLimitSeconds, voiceClientIdentity } from './twilio_voice.ts';

const sample = {
  accountSid: `AC${'a'.repeat(32)}`,
  apiKeySid: `SK${'b'.repeat(32)}`,
  apiKeySecret: 'local-test-secret-only',
  twimlAppSid: `AP${'c'.repeat(32)}`,
  identity: 'c2d96c7d-9201-4b66-9bf1-e772aa456199',
  nowSeconds: 1_800_000_000,
};

function decodeJwtPart(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return JSON.parse(atob(base64));
}

Deno.test('Twilio Voice JWT is short-lived and scoped to the client identity and app', async () => {
  const token = await createTwilioVoiceToken(sample);
  const [headerText, payloadText, signatureText] = token.split('.');
  const header = decodeJwtPart(headerText);
  const payload = decodeJwtPart(payloadText);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sample.apiKeySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(atob(signatureText.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(signatureText.length / 4) * 4, '=')), char => char.charCodeAt(0));
  if (!await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(`${headerText}.${payloadText}`))) throw new Error('JWT signature did not verify.');
  if (header.cty !== 'twilio-fpa;v=1' || header.alg !== 'HS256') throw new Error('Unexpected Twilio JWT header.');
  if (payload.exp - payload.iat !== 3600 || payload.grants.identity !== sample.identity) throw new Error('Unexpected JWT lifetime or identity.');
  if (payload.grants.voice.outgoing.application_sid !== sample.twimlAppSid || payload.grants.voice.incoming !== undefined) throw new Error('Unexpected call grants.');
});

Deno.test('incoming Voice JWT grants require a valid platform push credential', async () => {
  const token = await createTwilioVoiceToken({ ...sample, pushCredentialSid: `CR${'d'.repeat(32)}` });
  const payload = decodeJwtPart(token.split('.')[1]);
  if (payload.grants.voice.incoming.allow !== true || payload.grants.voice.push_credential_sid !== `CR${'d'.repeat(32)}`) throw new Error('Incoming call grant was not scoped to the configured push credential.');
  let rejected = false;
  try { await createTwilioVoiceToken({ ...sample, pushCredentialSid: 'not-a-twilio-sid' }); } catch { rejected = true; }
  if (!rejected) throw new Error('Malformed push credential was accepted.');
});

Deno.test('Twilio webhook signature validation matches sorted form fields and rejects tampering', async () => {
  const url = 'https://example.supabase.co/functions/v1/twilio-voice-twiml';
  const form = new URLSearchParams();
  form.append('To', sample.identity);
  form.append('CallSid', 'CA-test');
  form.append('Tag', 'z');
  form.append('Tag', 'a');
  const authToken = 'local-webhook-test-token';
  const canonical = `${url}CallSidCA-testTagaTagzTo${sample.identity}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)))));
  if (!await validateTwilioWebhookSignature(url, form, signature, authToken)) throw new Error('Valid webhook signature was rejected.');
  form.set('To', 'another-client');
  if (await validateTwilioWebhookSignature(url, form, signature, authToken)) throw new Error('Tampered webhook body was accepted.');
});

Deno.test('TwiML enforces the configured call limit and validates UUID identities', () => {
  const twiml = twimlForClient(`client:${sample.identity}`, 'a7e4f515-8b73-4f8e-b278-61db9b3fdfac');
  if (!twiml.includes('<Dial timeLimit="120" answerOnBridge="true">') || !twiml.includes(`<Identity>${sample.identity}</Identity>`) || !twiml.includes('<Parameter name="maxDurationSeconds" value="120"/>')) throw new Error('TwiML did not enforce the default call limit or target identity.');
  const extended = twimlForClient(sample.identity, 'a7e4f515-8b73-4f8e-b278-61db9b3fdfac', 1200);
  if (!extended.includes('<Dial timeLimit="1200" answerOnBridge="true">') || !extended.includes('<Parameter name="maxDurationSeconds" value="1200"/>')) throw new Error('TwiML did not apply the configured call limit.');
  if (voiceCallLimitSeconds(60) !== 60 || voiceCallLimitSeconds(3600) !== 3600 || voiceCallLimitSeconds(3599) !== 3599) throw new Error('A valid configured call limit was not accepted.');
  if (voiceCallLimitSeconds(59) !== 120 || voiceCallLimitSeconds(3601) !== 120 || voiceCallLimitSeconds(300.5) !== 120) throw new Error('An invalid call limit did not fall back to the safe default.');
  if (voiceClientIdentity('client:not-a-uuid') !== null) throw new Error('Malformed identity was accepted.');
  let rejected = false;
  try { twimlForClient('client:not-a-uuid', 'job'); } catch { rejected = true; }
  if (!rejected) throw new Error('Malformed TwiML target was accepted.');
});
