const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const allowedOrigins = env => new Set((env.ALLOWED_ORIGINS || 'https://detailapp.co.zw,https://www.detailapp.co.zw,https://dashboard.detailapp.co.zw,https://blog.detailapp.co.zw').split(',').map(value => value.trim()));

function response(body, status = 200, origin = '') {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, 'access-control-allow-origin': origin, vary: 'Origin' } });
}

function clean(value, maximum = 200) { return String(value ?? '').trim().slice(0, maximum); }
const hex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2,'0')).join('');
const randomToken = () => { const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); };
const sha256 = async value => hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:50000},key,256));}
async function requireAdmin(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Response('Sign in to the dashboard.', { status: 401 });
  const row=await env.DB.prepare("SELECT a.* FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>? AND a.disabled=0").bind(await sha256(token),new Date().toISOString()).first();
  if(!row)throw new Response('Your dashboard session expired. Sign in again.',{status:401});
  return {id:row.id,email:row.email,elevated:!!row.elevated,permissions:JSON.parse(row.permissions_json||'[]'),mustChangePassword:!!row.must_change_password};
}

async function auth(request,env,origin,path){
  if(path==='/api/auth/accept-invite'){const input=await request.json(),email=clean(input.email,254).toLowerCase(),password=String(input.password||''),tokenHash=await sha256(String(input.token||''));if(password.length<10)return response({error:'Use at least 10 characters.'},400,origin);const invite=await env.DB.prepare("SELECT * FROM admin_invites WHERE email=? AND token_hash=? AND status='PENDING' AND expires_at>?").bind(email,tokenHash,new Date().toISOString()).first();if(!invite)return response({error:'This invitation is invalid or expired.'},400,origin);const salt=randomToken(),hash=await passwordHash(password,salt),id=crypto.randomUUID(),now=new Date().toISOString();await env.DB.batch([env.DB.prepare("INSERT INTO admins(id,email,password_hash,password_salt,elevated,permissions_json,must_change_password,created_at) VALUES(?,?,?,?,0,?,0,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,password_salt=excluded.password_salt,permissions_json=excluded.permissions_json,disabled=0").bind(id,email,hash,salt,invite.permissions_json,now),env.DB.prepare("UPDATE admin_invites SET status='ACCEPTED' WHERE id=?").bind(invite.id)]);return response({ok:true},200,origin)}
  if(path==='/api/auth/login'){
    const input=await request.json(),email=clean(input.email,254).toLowerCase(),password=String(input.password||'');const row=await env.DB.prepare('SELECT * FROM admins WHERE email=? AND disabled=0').bind(email).first();
    if(!row||await passwordHash(password,row.password_salt)!==row.password_hash)return response({error:'Invalid email or password.'},401,origin);
    const token=randomToken(),now=new Date(),expires=new Date(now.getTime()+12*60*60*1000).toISOString();await env.DB.batch([env.DB.prepare('INSERT INTO admin_sessions(token_hash,admin_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await sha256(token),row.id,expires,now.toISOString()),env.DB.prepare('UPDATE admins SET last_sign_in_at=? WHERE id=?').bind(now.toISOString(),row.id)]);
    return response({token,admin:{id:row.id,email:row.email,elevated:!!row.elevated,permissions:JSON.parse(row.permissions_json||'[]'),mustChangePassword:!!row.must_change_password}},200,origin);
  }
  const admin=await requireAdmin(request,env);
  if(path==='/api/auth/me')return response(admin,200,origin);
  if(path==='/api/auth/logout'){const token=request.headers.get('authorization').replace(/^Bearer\s+/i,'');await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await sha256(token)).run();return response({ok:true},200,origin);}
  if(path==='/api/auth/password'){const input=await request.json(),row=await env.DB.prepare('SELECT password_hash,password_salt FROM admins WHERE id=?').bind(admin.id).first();if(await passwordHash(String(input.currentPassword||''),row.password_salt)!==row.password_hash)return response({error:'Current password is incorrect.'},403,origin);if(String(input.password||'').length<10)return response({error:'Use at least 10 characters.'},400,origin);const salt=randomToken(),hash=await passwordHash(String(input.password),salt);await env.DB.batch([env.DB.prepare('UPDATE admins SET password_hash=?,password_salt=?,must_change_password=0 WHERE id=?').bind(hash,salt,admin.id),env.DB.prepare('DELETE FROM admin_sessions WHERE admin_id=?').bind(admin.id)]);return response({ok:true},200,origin);}
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
  await env.DB.prepare('INSERT INTO marketing_campaigns (id,actor_uid,subject,recipient_count,filters_json,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),claims.id,subject,emails.length,JSON.stringify(filters),idempotencyKey,new Date().toISOString()).run();
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

const blogPost = row => ({id:row.id,slug:row.slug,title:row.title,excerpt:row.excerpt,content:row.content,keywords:row.keywords,status:row.status,publishedAt:row.published_at,createdAt:row.created_at,updatedAt:row.updated_at});
async function publicBlog(request,env,origin){
  const slug=clean(new URL(request.url).searchParams.get('slug'),90);
  if(slug){const row=await env.DB.prepare("SELECT * FROM blog_posts WHERE slug=? AND status='PUBLISHED'").bind(slug).first();return row?response({post:blogPost(row)},200,origin):response({error:'Article not found.'},404,origin)}
  const {results}=await env.DB.prepare("SELECT * FROM blog_posts WHERE status='PUBLISHED' ORDER BY published_at DESC").all();return response({posts:results.map(blogPost)},200,origin);
}

async function dashboardRpc(request,env,origin){const admin=await requireAdmin(request,env),input=await request.json(),name=clean(input.name,80),data=input.data||{};
 if(name==='blogList'){const {results}=await env.DB.prepare('SELECT * FROM blog_posts ORDER BY updated_at DESC').all();return response({posts:results.map(blogPost)},200,origin)}
 if(name==='blogSave'){const id=clean(data.id,80)||crypto.randomUUID(),slug=clean(data.slug,90).toLowerCase(),title=clean(data.title,180),excerpt=clean(data.excerpt,300),content=clean(data.content,30000),keywords=clean(data.keywords,500),status=data.status==='PUBLISHED'?'PUBLISHED':'DRAFT',now=new Date().toISOString();if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!title||!excerpt||!content)return response({error:'A valid slug, title, excerpt and article are required.'},400,origin);const existing=await env.DB.prepare('SELECT created_at,published_at FROM blog_posts WHERE id=?').bind(id).first();const publishedAt=status==='PUBLISHED'?(existing?.published_at||now):null;try{await env.DB.prepare(`INSERT INTO blog_posts(id,slug,title,excerpt,content,keywords,status,author_id,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,excerpt=excluded.excerpt,content=excluded.content,keywords=excluded.keywords,status=excluded.status,author_id=excluded.author_id,updated_at=excluded.updated_at,published_at=excluded.published_at`).bind(id,slug,title,excerpt,content,keywords,status,admin.id,existing?.created_at||now,now,publishedAt).run()}catch{return response({error:'That URL slug is already used by another article.'},409,origin)}const row=await env.DB.prepare('SELECT * FROM blog_posts WHERE id=?').bind(id).first();return response({post:blogPost(row)},200,origin)}
 if(name==='adminOverview'){const labels=['Total bookings today','Upcoming bookings','Completed jobs','Cancelled jobs','Revenue today','Revenue this week','Revenue this month','Active cleaners','New customers','Pending payments'];return response({asOf:new Date().toISOString(),timezone:'Africa/Harare',currency:'USD',metrics:labels.map(label=>({label,value:0,format:label.startsWith('Revenue')?'money':'number'})),revenue:[],attention:[]},200,origin)}
 if(name==='adminQuery'){if(data.module==='settings'){const {results}=await env.DB.prepare('SELECT key,value_json FROM dashboard_settings').all();const values=Object.fromEntries(results.map(row=>[row.key,JSON.parse(row.value_json)]));return response({switches:values.switches||{},supportCopy:values.supportCopy||''},200,origin)}return response({rows:[],nextCursor:null},200,origin)}
 if(name==='adminMutation'){await env.DB.prepare('INSERT INTO admin_audit(id,actor_id,action,payload_json,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),admin.id,clean(data.action,100),JSON.stringify(data),new Date().toISOString()).run();return response({ok:true,auditId:crypto.randomUUID()},200,origin)}
 if(name==='adminDirectory'){const {results:admins}=await env.DB.prepare('SELECT id,email,disabled,elevated,permissions_json,last_sign_in_at FROM admins ORDER BY created_at').all();const {results:invites}=await env.DB.prepare('SELECT id,email,status,permissions_json,created_at,expires_at FROM admin_invites ORDER BY created_at DESC').all();return response({admins:admins.map(a=>({uid:a.id,email:a.email,disabled:!!a.disabled,elevated:!!a.elevated,permissions:JSON.parse(a.permissions_json),lastSignInAt:a.last_sign_in_at})),invites:invites.map(i=>({id:i.id,email:i.email,status:i.status,permissions:JSON.parse(i.permissions_json),createdAt:i.created_at,expiresAt:i.expires_at}))},200,origin)}
 if(name==='createAdminInvite'){if(!admin.elevated&&!admin.permissions.includes('admins.manage'))return response({error:'Admin management permission required.'},403,origin);const token=randomToken(),now=new Date(),expires=new Date(now.getTime()+7*86400000).toISOString();await env.DB.prepare("INSERT INTO admin_invites(id,email,token_hash,permissions_json,expires_at,status,created_by,created_at) VALUES(?,?,?,?,?,'PENDING',?,?) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,permissions_json=excluded.permissions_json,expires_at=excluded.expires_at,status='PENDING',created_by=excluded.created_by,created_at=excluded.created_at").bind(crypto.randomUUID(),clean(data.email,254).toLowerCase(),await sha256(token),JSON.stringify(data.permissions||[]),expires,admin.id,now.toISOString()).run();
                                const baseDomain = origin || 'https://dashboard.detailapp.co.zw';
  return response({inviteUrl:`${baseDomain}/admin/accept-invite?token=${encodeURIComponent(token)}`},200,origin)
                               }
 return response({error:'Unknown dashboard operation.'},404,origin)}

export default { async fetch(request, env) {
  const origin = request.headers.get('origin') || ''; const allowed = allowedOrigins(env); const corsOrigin = allowed.has(origin) ? origin : '';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': corsOrigin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', vary:'Origin' } });
  if (origin && !corsOrigin) return response({ error: 'Origin not allowed.' }, 403, 'null');
  try {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/auth/') && ['GET','POST'].includes(request.method)) return await auth(request,env,corsOrigin,path);
    if (path === '/api/admin/rpc' && request.method === 'POST') return await dashboardRpc(request,env,corsOrigin);
    if (path === '/api/blog' && request.method === 'GET') return await publicBlog(request,env,corsOrigin);
    if (path === '/api/waitlist' && request.method === 'POST') return await joinWaitlist(request, env, corsOrigin);
    if (path === '/api/admin/waitlist' && request.method === 'GET') return await listWaitlist(request, env, corsOrigin);
    if (path === '/api/admin/campaign' && request.method === 'POST') return await sendCampaign(request, env, corsOrigin);
    if (path === '/api/unsubscribe' && request.method === 'GET') return await unsubscribe(request, env, corsOrigin);
    if (path === '/health') {
      await env.DB.prepare('SELECT 1 AS healthy').first();
      return response({ ok: true, storage: 'cloudflare-d1', service: 'detail-site-api' }, 200, corsOrigin);
    }
    return response({ error: 'Not found.' }, 404, corsOrigin);
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: { ...JSON_HEADERS, 'access-control-allow-origin': corsOrigin, vary:'Origin' } });
    console.error(error); return response({ error: 'Service temporarily unavailable. Please try again.' }, 503, corsOrigin);
  }
} };
