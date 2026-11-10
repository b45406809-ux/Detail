import { createClient } from 'npm:@supabase/supabase-js@2.80.0';
import { createTwilioVoiceToken, voiceCallLimitSeconds } from '../_shared/twilio_voice.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' },
});
const activeStatuses = new Set(['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);
const validUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' } });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (!url || !anonKey || !admin) return reply({ error: 'Voice calling is not configured.' }, 503);

  try {
    const authorization = request.headers.get('authorization') ?? '';
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!bearer) return reply({ error: 'Sign in required.' }, 401);
    const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await auth.auth.getUser(bearer);
    if (authError || !user) return reply({ error: 'Sign in required.' }, 401);

    if (Number(request.headers.get('content-length') ?? 0) > 1024) return reply({ error: 'Request body is too large.' }, 413);
    const rawBody = await request.text();
    if (rawBody.length > 1024) return reply({ error: 'Request body is too large.' }, 413);
    let body: Record<string, unknown> | null = null;
    try { body = JSON.parse(rawBody); } catch { return reply({ error: 'A valid booking is required.' }, 400); }
    const jobId = body?.jobId;
    const platform = body?.platform;
    if (!validUuid(jobId)) return reply({ error: 'A valid booking is required.' }, 400);
    if (platform !== 'android' && platform !== 'ios') return reply({ error: 'Voice calling is available on Android and iOS devices.' }, 400);

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
    const apiKeySid = Deno.env.get('TWILIO_API_KEY_SID') ?? '';
    const apiKeySecret = Deno.env.get('TWILIO_API_KEY_SECRET') ?? '';
    const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID') ?? '';
    const pushCredentialSid = Deno.env.get(platform === 'android' ? 'TWILIO_VOICE_PUSH_CREDENTIAL_SID_ANDROID' : 'TWILIO_VOICE_PUSH_CREDENTIAL_SID_IOS') ?? '';
    if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid || !pushCredentialSid) return reply({ error: 'Voice calling and incoming-call delivery are not fully configured yet.' }, 503);

    const limitKey = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`voice-token:${user.id}`)))).map(value => value.toString(16).padStart(2, '0')).join('');
    const { data: permitted, error: rateError } = await admin.rpc('consume_rate_limit', { p_key: limitKey, p_max: 12, p_window_seconds: 300 });
    if (rateError) throw rateError;
    if (permitted !== true) return reply({ error: 'Too many call attempts. Wait a few minutes and try again.' }, 429);

    const { data: job, error: jobError } = await admin.from('jobs').select('customerid,cleanerid,status').eq('id', jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job || ![job.customerid, job.cleanerid].includes(user.id)) return reply({ error: 'This booking is not available for calls.' }, 403);
    if (!job.cleanerid || !activeStatuses.has(String(job.status).toUpperCase())) return reply({ error: 'Calls are available only while a cleaner is assigned to an active booking.' }, 409);

    const { data: profile, error: profileError } = await admin.from('users').select('isbanned,issuspended,accountdeletedat').eq('id', user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.isbanned || profile.issuspended || profile.accountdeletedat) return reply({ error: 'This account cannot start a call.' }, 403);

    const { data: operations, error: operationsError } = await admin.from('configuration').select('value').eq('key', 'operations').maybeSingle();
    if (operationsError) throw operationsError;
    const maxCallDurationSeconds = voiceCallLimitSeconds(operations?.value?.voiceCallLimitSeconds);
    const token = await createTwilioVoiceToken({ accountSid, apiKeySid, apiKeySecret, twimlAppSid, identity: user.id, pushCredentialSid });
    return reply({ token, incomingEnabled: true, expiresIn: 3600, maxCallDurationSeconds });
  } catch (error) {
    console.error('Twilio Voice token request failed', error instanceof Error ? error.message : 'unknown error');
    return reply({ error: 'Could not prepare this call. Please try again shortly.' }, 503);
  }
});
