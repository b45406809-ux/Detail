const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const allowedOrigins = env => new Set((env.ALLOWED_ORIGINS || 'https://detail.co.zw,https://www.detail.co.zw,https://dashboard.detail.co.zw').split(',').map(value => value.trim()));

function response(body, status = 200, origin = '') {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, 'access-control-allow-origin': origin, vary: 'Origin' } });
}

function clean(value, maximum = 200) { return String(value ?? '').trim().slice(0, maximum); }
function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')), character => character.charCodeAt(0));
}

let keysCache;
async function requireAdmin(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Response('Missing administrator token.', { status: 401 });
  const parts = token.split('.');
  if (parts.length !== 3) throw new Response('Invalid administrator token.', { status: 401 });
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  const project = env.FIREBASE_PROJECT_ID;
  if (header.alg !== 'RS256' || claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}` || claims.exp * 1000 <= Date.now() || claims.admin !== true) throw new Response('Administrator claim required.', { status: 403 });
  if (!keysCache || keysCache.expires < Date.now()) {
    const keysResponse = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    if (!keysResponse.ok) throw new Response('Unable to verify administrator token.', { status: 503 });
    keysCache = { keys: await keysResponse.json(), expires: Date.now() + 60 * 60 * 1000 };
  }
  const jwk = keysCache.keys.keys.find(key => key.kid === header.kid);
  if (!jwk) { keysCache = undefined; throw new Response('Unknown administrator signing key.', { status: 401 }); }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!verified) throw new Response('Invalid administrator signature.', { status: 401 });
  return claims;
}

async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET) return;
  const form = new FormData(); form.set('secret', env.TURNSTILE_SECRET); form.set('response', token); form.set('remoteip', request.headers.get('cf-connecting-ip') || '');
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form }).then(value => value.json());
  if (!result.success) throw new Response('Security check failed. Please refresh and try again.', { status: 400 });
}

async function joinWaitlist(request, env, origin) {
  const input = await request.json();
  if (clean(input.website)) return response({ ok: true }, 200, origin);
  await verifyTurnstile(request, env, clean(input.turnstileToken, 2048));
  const row = {
    id: crypto.randomUUID(), participantType: clean(input.participantType, 20), fullName: clean(input.fullName), phone: clean(input.phone, 40),
    email: clean(input.email, 254).toLowerCase(), country: clean(input.country, 100), city: clean(input.city, 100), area: clean(input.area, 120),
    preferredLanguage: clean(input.preferredLanguage, 60), serviceInterest: clean(input.serviceInterest, 20), marketingEmailPermission: clean(input.marketingEmailPermission, 3),
    campaign: JSON.stringify(input.campaign || {}), now: new Date().toISOString(), privacyAccepted: input.privacyAccepted === true ? 1 : 0, unsubscribeToken: crypto.randomUUID(),
  };
  if (!['CUSTOMER', 'CLEANER'].includes(row.participantType) || !row.fullName || !row.phone || !/^\S+@\S+\.\S+$/.test(row.email) || !row.country || !row.city || !row.area || !row.preferredLanguage || !['HOUSE', 'CAR', 'BOTH'].includes(row.serviceInterest) || !['YES', 'NO'].includes(row.marketingEmailPermission) || !row.privacyAccepted) return response({ error: 'Please complete every required field.' }, 400, origin);
  await env.DB.prepare(`INSERT INTO waitlist (id,participant_type,full_name,phone,email,country,city,area,preferred_language,service_interest,marketing_email_permission,privacy_accepted,campaign_json,unsubscribe_token,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?) ON CONFLICT(email) DO UPDATE SET participant_type=excluded.participant_type,full_name=excluded.full_name,phone=excluded.phone,country=excluded.country,city=excluded.city,area=excluded.area,preferred_language=excluded.preferred_language,service_interest=excluded.service_interest,marketing_email_permission=excluded.marketing_email_permission,privacy_accepted=excluded.privacy_accepted,campaign_json=excluded.campaign_json,updated_at=excluded.updated_at`)
    .bind(row.id,row.participantType,row.fullName,row.phone,row.email,row.country,row.city,row.area,row.preferredLanguage,row.serviceInterest,row.marketingEmailPermission,row.privacyAccepted,row.campaign,row.unsubscribeToken,row.now,row.now).run();
  return response({ ok: true }, 201, origin);
}

async function sendCampaign(request, env, origin) {
  const claims = await requireAdmin(request, env); const input = await request.json();
  if (claims.elevated !== true && !(Array.isArray(claims.permissions) && claims.permissions.includes('marketing.send'))) return response({ error: 'Marketing send permission required.' }, 403, origin);
  const subject = clean(input.subject, 140), message = clean(input.message, 5000), idempotencyKey = clean(input.idempotencyKey, 100), filters = input.filters || {};
  if (!subject || !message || !idempotencyKey) return response({ error: 'Subject, message and idempotency key are required.' }, 400, origin);
  if (!env.RESEND_API_KEY) return response({ error: 'Email delivery is not configured.' }, 503, origin);
  const existing = await env.DB.prepare('SELECT recipient_count FROM marketing_campaigns WHERE idempotency_key=?').bind(idempotencyKey).first();
  if (existing) return response({ recipientCount: existing.recipient_count, duplicate: true }, 200, origin);
  const conditions = ["marketing_email_permission='YES'", "status='ACTIVE'"]; const values = [];
  for (const [field,column] of [['country','country'],['city','city'],['serviceInterest','service_interest'],['preferredLanguage','preferred_language']]) if (clean(filters[field])) { conditions.push(`${column}=?`); values.push(clean(filters[field])); }
  const { results } = await env.DB.prepare(`SELECT email,full_name,unsubscribe_token FROM waitlist WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 100`).bind(...values).all();
  const base = new URL(request.url).origin; const emails = results.map(row => ({ from: env.MARKETING_FROM || 'Detail <updates@detail.co.zw>', to:[row.email], subject, text:`Hi ${row.full_name.split(' ')[0]},\n\n${message}\n\nUnsubscribe: ${base}/api/unsubscribe?token=${encodeURIComponent(row.unsubscribe_token)}` }));
  if (emails.length) {
    const sent = await fetch('https://api.resend.com/emails/batch', { method:'POST', headers:{ authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json' }, body:JSON.stringify(emails) });
    if (!sent.ok) return response({ error:'Email provider rejected the campaign.' }, 502, origin);
  }
  await env.DB.prepare('INSERT INTO marketing_campaigns (id,actor_uid,subject,recipient_count,filters_json,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),claims.user_id || claims.sub,subject,emails.length,JSON.stringify(filters),idempotencyKey,new Date().toISOString()).run();
  return response({ recipientCount: emails.length }, 200, origin);
}

async function unsubscribe(request, env, origin) {
  const token = clean(new URL(request.url).searchParams.get('token'), 100); if (!token) return response({ error:'Invalid unsubscribe link.' }, 400, origin);
  await env.DB.prepare("UPDATE waitlist SET marketing_email_permission='NO',updated_at=? WHERE unsubscribe_token=?").bind(new Date().toISOString(),token).run();
  return new Response('You have been unsubscribed from Detail marketing email.', { headers:{'content-type':'text/plain; charset=utf-8','access-control-allow-origin':origin} });
}

async function listWaitlist(request, env, origin) {
  await requireAdmin(request, env); const url = new URL(request.url); const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100); const cursor = clean(url.searchParams.get('cursor'), 40);
  const query = cursor ? env.DB.prepare('SELECT * FROM waitlist WHERE created_at < ? ORDER BY created_at DESC LIMIT ?').bind(cursor, limit + 1) : env.DB.prepare('SELECT * FROM waitlist ORDER BY created_at DESC LIMIT ?').bind(limit + 1);
  const { results } = await query.all(); const page = results.slice(0, limit); const rows = page.map(row => ({ id:row.id,participantType:row.participant_type,fullName:row.full_name,phone:row.phone,email:row.email,country:row.country,city:row.city,area:row.area,preferredLanguage:row.preferred_language,serviceInterest:row.service_interest,marketingEmailPermission:row.marketing_email_permission,status:row.status,createdAt:row.created_at }));
  return response({ rows, nextCursor: results.length > limit ? page.at(-1).created_at : null }, 200, origin);
}

export default { async fetch(request, env) {
  const origin = request.headers.get('origin') || ''; const allowed = allowedOrigins(env); const corsOrigin = allowed.has(origin) ? origin : '';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': corsOrigin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', vary:'Origin' } });
  if (origin && !corsOrigin) return response({ error: 'Origin not allowed.' }, 403, 'null');
  try {
    const path = new URL(request.url).pathname;
    if (path === '/api/waitlist' && request.method === 'POST') return await joinWaitlist(request, env, corsOrigin);
    if (path === '/api/admin/waitlist' && request.method === 'GET') return await listWaitlist(request, env, corsOrigin);
    if (path === '/api/admin/campaign' && request.method === 'POST') return await sendCampaign(request, env, corsOrigin);
    if (path === '/api/unsubscribe' && request.method === 'GET') return await unsubscribe(request, env, corsOrigin);
    if (path === '/health') return response({ ok: true, storage: 'cloudflare-d1' }, 200, corsOrigin);
    return response({ error: 'Not found.' }, 404, corsOrigin);
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: { ...JSON_HEADERS, 'access-control-allow-origin': corsOrigin, vary:'Origin' } });
    console.error(error); return response({ error: 'Service temporarily unavailable. Please try again.' }, 503, corsOrigin);
  }
} };
