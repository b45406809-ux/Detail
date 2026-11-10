const encoder = new TextEncoder();

export const DEFAULT_VOICE_CALL_LIMIT_SECONDS = 300;
export const MIN_VOICE_CALL_LIMIT_SECONDS = 60;
export const MAX_VOICE_CALL_LIMIT_SECONDS = 3600;

export function voiceCallLimitSeconds(value: unknown): number {
  const seconds = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(seconds)
    && seconds >= MIN_VOICE_CALL_LIMIT_SECONDS
    && seconds <= MAX_VOICE_CALL_LIMIT_SECONDS
    ? seconds
    : DEFAULT_VOICE_CALL_LIMIT_SECONDS;
}

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
  .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

export interface TwilioVoiceTokenOptions {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  pushCredentialSid?: string;
  identity: string;
  nowSeconds?: number;
  ttlSeconds?: number;
}

/** Mint a short-lived Twilio Voice JWT. The API key secret never leaves the edge function. */
export async function createTwilioVoiceToken(options: TwilioVoiceTokenOptions): Promise<string> {
  const { accountSid, apiKeySid, apiKeySecret, twimlAppSid, identity } = options;
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || !/^SK[0-9a-f]{32}$/i.test(apiKeySid)
    || !/^AP[0-9a-f]{32}$/i.test(twimlAppSid) || !apiKeySecret || !/^[a-zA-Z0-9_-]{1,121}$/.test(identity)) {
    throw new Error('Twilio Voice credentials or identity are invalid.');
  }
  if (options.pushCredentialSid && !/^CR[0-9a-f]{32}$/i.test(options.pushCredentialSid)) {
    throw new Error('Twilio Voice push credential is invalid.');
  }
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(3600, Math.max(60, options.ttlSeconds ?? 3600));
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' })));
  const voice: Record<string, unknown> = {
    outgoing: { application_sid: twimlAppSid },
  };
  if (options.pushCredentialSid) {
    voice.incoming = { allow: true };
    voice.push_credential_sid = options.pushCredentialSid;
  }
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    jti: `${apiKeySid}-${now}`,
    iss: apiKeySid,
    sub: accountSid,
    iat: now,
    nbf: now,
    exp: now + ttl,
    grants: { identity, voice },
  })));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(apiKeySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput)));
  return `${signingInput}.${toBase64Url(signature)}`;
}

/** Twilio signs the complete webhook URL followed by sorted form fields. */
export async function validateTwilioWebhookSignature(
  url: string,
  form: URLSearchParams,
  signature: string,
  authToken: string,
): Promise<boolean> {
  if (!signature || !authToken) return false;
  const canonical = `${url}${[...new Set(form.keys())].sort().map(key =>
    form.getAll(key).sort().map(value => `${key}${value}`).join(''),
  ).join('')}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const expected = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(canonical)))));
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

export function voiceClientIdentity(value: string): string | null {
  const identity = value.startsWith('client:') ? value.slice(7) : value;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity) ? identity.toLowerCase() : null;
}

export function twimlForClient(identity: string, jobId: string, maxDurationSeconds = DEFAULT_VOICE_CALL_LIMIT_SECONDS): string {
  if (!voiceClientIdentity(identity) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) throw new Error('Invalid client call target.');
  const duration = voiceCallLimitSeconds(maxDurationSeconds);
  const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeLimit="${duration}" answerOnBridge="true"><Client><Identity>${xml(voiceClientIdentity(identity)!)}</Identity><Parameter name="jobId" value="${xml(jobId)}"/><Parameter name="maxDurationSeconds" value="${duration}"/></Client></Dial></Response>`;
}
