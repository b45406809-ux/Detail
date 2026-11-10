import { createClient } from 'npm:@supabase/supabase-js@2.80.0';
import { twimlForClient, validateTwilioWebhookSignature, voiceCallLimitSeconds, voiceClientIdentity } from '../_shared/twilio_voice.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const admin = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const xml = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/xml; charset=utf-8', 'cache-control': 'no-store' } });
const validUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const unavailable = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>This Detail call is no longer available.</Say></Response>';
const activeStatuses = new Set(['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);

Deno.serve(async request => {
  if (request.method !== 'POST') return xml(unavailable, 405);
  if (!admin || !authToken) return xml(unavailable, 503);
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 16_384) return xml(unavailable, 413);
    const rawBody = await request.text();
    if (rawBody.length > 16_384) return xml(unavailable, 413);
    const form = new URLSearchParams(rawBody);
    const signature = request.headers.get('x-twilio-signature') ?? '';
    if (!await validateTwilioWebhookSignature(request.url, form, signature, authToken)) return xml(unavailable, 403);

    const caller = voiceClientIdentity(form.get('From') ?? form.get('from') ?? '');
    const target = voiceClientIdentity(form.get('To') ?? form.get('to') ?? '');
    const jobId = form.get('jobId') ?? form.get('JobId') ?? '';
    if (!caller || !target || !validUuid(jobId) || caller === target) return xml(unavailable, 400);

    const { data: job, error } = await admin.from('jobs').select('customerid,cleanerid,status').eq('id', jobId).maybeSingle();
    if (error) throw error;
    const participants = [job?.customerid, job?.cleanerid];
    if (!job || !job.cleanerid || !activeStatuses.has(String(job.status).toUpperCase()) || !participants.includes(caller) || !participants.includes(target)) {
      return xml(unavailable, 403);
    }
    const { data: operations, error: settingsError } = await admin.from('configuration').select('value').eq('key', 'operations').maybeSingle();
    if (settingsError) throw settingsError;
    const maxCallDurationSeconds = voiceCallLimitSeconds(operations?.value?.voiceCallLimitSeconds);
    return xml(twimlForClient(target, jobId, maxCallDurationSeconds));
  } catch (error) {
    console.error('Twilio Voice webhook rejected', error instanceof Error ? error.message : 'unknown error');
    return xml(unavailable, 400);
  }
});
