// Mobile backend: Firebase Auth identity, Cloudflare D1/R2 application data.
const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const timestamp = () => new Date().toISOString();
const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), c => c.charCodeAt(0));
const pem = (value) => decode(value.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s/g, '').replace(/\+/g, '-').replace(/\//g, '_')).buffer;

let certs, certsUntil = 0;
async function firebaseCerts() {
  if (certs && certsUntil > Date.now()) return certs;
  const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!response.ok) throw new Error('Could not verify Firebase session.');
  certs = await response.json();
  certsUntil = Date.now() + (Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]) || 3600) * 1000;
  return certs;
}

async function userFrom(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const [header64, payload64, signature64] = token?.split('.') ?? [];
  if (!header64 || !payload64 || !signature64) throw new Response('Sign in is required.', { status: 401 });
  const header = JSON.parse(new TextDecoder().decode(decode(header64)));
  const payload = JSON.parse(new TextDecoder().decode(decode(payload64)));
  if (header.alg !== 'RS256' || payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` || payload.exp * 1000 <= Date.now()) throw new Response('Invalid sign-in session.', { status: 401 });
  const certificate = (await firebaseCerts())[header.kid];
  if (!certificate) throw new Response('Firebase signing key changed. Retry this request.', { status: 401 });
  const key = await crypto.subtle.importKey('spki', pem(certificate), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(signature64), new TextEncoder().encode(`${header64}.${payload64}`))) throw new Response('Invalid sign-in session.', { status: 401 });
  return { id: payload.sub, email: payload.email ?? null, phone: payload.phone_number ?? null };
}

async function ensureUser(env, user) {
  await env.DB.prepare(`INSERT INTO users (id,email,phone,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=COALESCE(excluded.email,email),phone=COALESCE(excluded.phone,phone),updated_at=excluded.updated_at`)
    .bind(user.id, user.email, user.phone, timestamp(), timestamp()).run();
}
const getJob = (env, id) => env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(id).first();
const job = (row) => row && ({ id: row.id, customerId: row.customer_id, cleanerId: row.cleaner_id, status: row.status, service: row.service, scheduledAt: row.scheduled_at, address: JSON.parse(row.address_json), notes: row.notes, budget: Number(row.budget), currency: row.currency, photoUrls: JSON.parse(row.photo_urls_json), createdAt: row.created_at, updatedAt: row.updated_at });

async function operation(name, data, user, env) {
  await ensureUser(env, user);
  if (name === 'getBetaConfig') return { enabled: false };
  if (name === 'upsertProfile') {
    await env.DB.prepare('UPDATE users SET display_name=?,role=?,profile_json=?,updated_at=? WHERE id=?').bind(text(data.displayName, 120), text(data.role, 32), JSON.stringify(data.profile ?? {}), timestamp(), user.id).run();
    return { ok: true };
  }
  if (name === 'createBooking') {
    const amount = Number(data.budget); if (!text(data.service, 80) || !Number.isFinite(amount) || amount <= 0) throw new Response('A service and valid budget are required.', { status: 400 });
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO jobs (id,customer_id,status,service,scheduled_at,address_json,notes,budget,currency,photo_urls_json,created_at,updated_at) VALUES (?,?,'OPEN',?,?,?,?,?,?,?,?,?)`).bind(id,user.id,text(data.service,80),text(data.scheduledAt,80)||null,JSON.stringify(data.address??{}),text(data.notes,4000),amount,text(data.currency,8)||'USD',JSON.stringify(data.photoUrls??[]),timestamp(),timestamp()).run();
    return { job: job(await getJob(env, id)) };
  }
  if (name === 'listMyJobs' || name === 'listOpenJobs') {
    const statement = name === 'listMyJobs' ? 'SELECT * FROM jobs WHERE customer_id=? OR cleaner_id=? ORDER BY created_at DESC LIMIT 100' : "SELECT * FROM jobs WHERE status='OPEN' AND customer_id<>? ORDER BY created_at DESC LIMIT 100";
    const result = name === 'listMyJobs' ? await env.DB.prepare(statement).bind(user.id,user.id).all() : await env.DB.prepare(statement).bind(user.id).all();
    return { jobs: result.results.map(job) };
  }
  if (name === 'submitBid') {
    const booking = await getJob(env, text(data.jobId,80)), amount = Number(data.amount);
    if (!booking || booking.status !== 'OPEN' || !Number.isFinite(amount) || amount <= 0) throw new Response('This job cannot accept that bid.', { status: 400 });
    await env.DB.prepare("INSERT INTO bids (id,job_id,cleaner_id,amount,message,status,created_at,updated_at) VALUES (?,?,?,?,?,'PENDING',?,?) ON CONFLICT(job_id,cleaner_id) DO UPDATE SET amount=excluded.amount,message=excluded.message,status='PENDING',updated_at=excluded.updated_at").bind(crypto.randomUUID(),booking.id,user.id,amount,text(data.message,1500),timestamp(),timestamp()).run();
    return { ok: true };
  }
  if (name === 'acceptBid') {
    const bid = await env.DB.prepare('SELECT b.*,j.customer_id,j.status job_status FROM bids b JOIN jobs j ON j.id=b.job_id WHERE b.id=?').bind(text(data.bidId,80)).first();
    if (!bid || bid.customer_id !== user.id || bid.job_status !== 'OPEN') throw new Response('Bid cannot be accepted.', { status: 403 });
    await env.DB.batch([env.DB.prepare("UPDATE bids SET status=CASE WHEN id=? THEN 'ACCEPTED' ELSE 'REJECTED' END,updated_at=? WHERE job_id=?").bind(bid.id,timestamp(),bid.job_id),env.DB.prepare("UPDATE jobs SET cleaner_id=?,status='ACCEPTED',updated_at=? WHERE id=?").bind(bid.cleaner_id,timestamp(),bid.job_id)]);
    return { ok: true, jobId: bid.job_id };
  }
  if (['transitionBooking','cancelBooking','completeBooking','reportNoShow'].includes(name)) {
    const booking = await getJob(env, text(data.jobId,80)); if (!booking || (booking.customer_id !== user.id && booking.cleaner_id !== user.id)) throw new Response('Booking not found.', { status: 404 });
    const status = name === 'cancelBooking' ? 'CANCELLED' : name === 'completeBooking' ? 'COMPLETED' : name === 'reportNoShow' ? 'NO_SHOW' : text(data.status,30);
    if (!status) throw new Response('Booking status is required.', { status: 400 });
    await env.DB.prepare('UPDATE jobs SET status=?,updated_at=? WHERE id=?').bind(status,timestamp(),booking.id).run(); return { job: job(await getJob(env, booking.id)) };
  }
  if (name === 'registerPushToken') { await env.DB.prepare('INSERT INTO push_tokens (token,user_id,platform,updated_at) VALUES (?,?,?,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,updated_at=excluded.updated_at').bind(text(data.token,300),user.id,text(data.platform,20),timestamp()).run(); return { ok: true }; }
  if (name === 'createPesePayPayment') {
    if (!env.PESEPAY_INTEGRATION_KEY || !env.PESEPAY_ENCRYPTION_KEY) throw new Response('PesePay is not configured.', { status: 503 });
    // Do not manufacture a payment record. Add the merchant's documented
    // PesePay checkout exchange here, then persist the provider reference.
    throw new Response('PesePay checkout has not been configured with this merchant account yet.', { status: 503 });
  }
  throw new Response(`Unsupported API operation: ${name}`, { status: 404 });
}

export default { async fetch(request, env) {
  const cors = { 'access-control-allow-origin': request.headers.get('origin') ?? '*', 'access-control-allow-headers':'authorization,content-type', 'access-control-allow-methods':'POST,OPTIONS', vary:'Origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });
  try {
    const path = new URL(request.url).pathname;
    if (path === '/health') return reply({ ok:true, auth:'firebase', database:'d1', storage:'r2' },200,cors);
    if (path === '/v1/payments/pesepay/webhook' && request.method === 'POST') {
      if (!env.PESEPAY_WEBHOOK_SECRET || request.headers.get('x-detail-webhook-secret') !== env.PESEPAY_WEBHOOK_SECRET) return new Response('Unauthorized',{status:401});
      const payload = await request.json(); await env.DB.prepare('UPDATE payments SET status=?,provider_payload_json=?,updated_at=? WHERE provider_reference=?').bind(text(payload.status,30).toUpperCase(),JSON.stringify(payload),timestamp(),text(payload.reference ?? payload.merchantReference,120)).run(); return reply({ok:true},200,cors);
    }
    const user = await userFrom(request, env);
    if (path === '/v1/rpc' && request.method === 'POST') { const input=await request.json(); return reply(await operation(text(input.name,80),input.data??{},user,env),200,cors); }
    if (path === '/v1/uploads' && request.method === 'POST') {
      const kind = text(new URL(request.url).searchParams.get('kind'),40) || 'photos';
      const filename = text(new URL(request.url).searchParams.get('filename'),100) || 'upload.jpg';
      const key = `users/${user.id}/${kind}/${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await env.PHOTOS.put(key, request.body, { httpMetadata: { contentType: request.headers.get('content-type') || 'image/jpeg' } });
      return reply({ key, url: `${new URL(request.url).origin}/v1/photos/${encodeURIComponent(key)}` },201,cors);
    }
    if (path.startsWith('/v1/photos/') && request.method === 'GET') {
      const key = decodeURIComponent(path.slice('/v1/photos/'.length));
      if (!key.startsWith(`users/${user.id}/`)) return reply({error:'Photo not found.'},404,cors);
      const object = await env.PHOTOS.get(key); if (!object) return reply({error:'Photo not found.'},404,cors);
      return new Response(object.body,{headers:{...cors,'content-type':object.httpMetadata?.contentType || 'application/octet-stream','cache-control':'private, max-age=3600'}});
    }
    return reply({error:'Not found.'},404,cors);
  } catch (error) { if (error instanceof Response) return new Response(error.body,{status:error.status,headers:cors}); console.error(error); return reply({error:'Service temporarily unavailable.'},503,cors); }
} };
