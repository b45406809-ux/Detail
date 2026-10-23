import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.80.0';
import { Paynow } from 'npm:paynow@2.2.2';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
if (!url || !anonKey || !serviceKey) throw new Error('Supabase function environment is incomplete.');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = new Set([
  'https://detail.co.zw', 'https://www.detail.co.zw', 'https://dashboard.detail.co.zw',
  'https://blog.detail.co.zw',
  'https://detailapp.co.zw', 'https://www.detailapp.co.zw', 'https://dashboard.detailapp.co.zw',
  'https://blog.detailapp.co.zw',
  'http://localhost:5173', 'http://localhost:8081',
]);

type Json = Record<string, any>;
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const reply = (body: unknown, status = 200, origin: string | null = null) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin ?? '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', 'vary': 'Origin' },
});
function fail(status: number, message: string): never { throw new ApiError(status, message); }
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const secret = (primary: string, alias: string) => Deno.env.get(primary) || Deno.env.get(alias) || '';
const round2 = (value: number) => Math.round(value * 100) / 100;
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(v => v.toString(16).padStart(2, '0')).join('');
const requireKey = (value: unknown) => { const key = text(value, 160); if (!/^[A-Za-z0-9_-]{8,160}$/.test(key)) fail(400, 'A valid idempotency key is required.'); return key; };
const MAX_REQUEST_BYTES=1024*1024;
async function readBoundedJson(request:Request):Promise<unknown>{
  const declared=request.headers.get('content-length');
  if(declared&&Number.isFinite(Number(declared))&&Number(declared)>MAX_REQUEST_BYTES)fail(413,'Request body is too large.');
  const reader=request.body?.getReader();if(!reader)fail(400,'A JSON request body is required.');
  const chunks:Uint8Array[]=[];let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;if(total>MAX_REQUEST_BYTES){await reader.cancel();fail(413,'Request body is too large.');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{fail(400,'Request body must be valid JSON.');}
}
async function enforceRateLimit(request: Request, actor: string, action: string, max: number, windowSeconds: number) {
  // Never trust x-real-ip or x-forwarded-for: callers can supply both. The
  // Cloudflare edge overwrites cf-connecting-ip; actor limits remain primary.
  const identities = [`actor:${actor}`];
  const trustedIp = text(request.headers.get('cf-connecting-ip'), 80);
  if (trustedIp) identities.push(`edge-ip:${trustedIp}`);
  for (const identity of identities) {
    const key = await hash(`${action}:${identity}`);
    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_key: key,
      p_max: identity.startsWith('edge-ip:') ? max * 10 : max,
      p_window_seconds: windowSeconds,
    });
    if (error) { console.error('rate-limit check failed', error.message); fail(503, 'This action is temporarily unavailable. Try again shortly.'); }
    if (data !== true) fail(429, 'Too many attempts. Please wait before trying again.');
  }
}
function tokenClaims(request:Request):Json{
  const token=(request.headers.get('authorization')??'').replace(/^Bearer /,'');
  try{const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));}catch{return {};}
}
function requireRecentMfa(request:Request){if(tokenClaims(request).aal!=='aal2')fail(403,'Complete admin authenticator verification before this action.');}
function payoutKey(){
  const encoded=Deno.env.get('PAYOUT_ENCRYPTION_KEY')??'';
  let raw:Uint8Array;try{raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}catch{raw=new Uint8Array();}
  if(raw.length!==32)fail(503,'Payout encryption is not configured.');return raw;
}
const encodeBase64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const arrayBuffer=(bytes:ArrayLike<number>)=>{const copy=new Uint8Array(bytes.length);copy.set(bytes);return copy.buffer;};
async function encryptPayoutAccount(accountNumber:string){
  const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey('raw',arrayBuffer(payoutKey()),'AES-GCM',false,['encrypt']);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(accountNumber)));
  return `${encodeBase64(iv)}.${encodeBase64(encrypted)}`;
}
async function decryptPayoutAccount(ciphertext:string){
  const [ivText,bodyText]=ciphertext.split('.');if(!ivText||!bodyText)fail(503,'Payout destination is unavailable.');
  const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',arrayBuffer(payoutKey()),'AES-GCM',false,['decrypt']);
  try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:arrayBuffer(decode(ivText))},key,arrayBuffer(decode(bodyText))));}catch{fail(503,'Payout destination could not be decrypted.');}
}

async function getUser(request: Request): Promise<User> {
  const bearer = request.headers.get('authorization') ?? '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!token) fail(401, 'Sign in required.');
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'Sign in required.');
  return data.user;
}
async function userRow(uid: string) {
  const { data, error } = await admin.from('users').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (!data) fail(404, 'Profile not found.');
  return data as Json;
}
async function requireActiveMarketplaceAccount(uid: string) {
  const profile = await userRow(uid);
  if (profile.isbanned || profile.issuspended || profile.accountdeletedat) {
    fail(403, 'This account cannot start new marketplace activity. Contact support for help with existing bookings.');
  }
  return profile;
}
async function adminRole(uid: string) {
  const { data, error } = await admin.from('adminroles').select('*').eq('userid', uid).maybeSingle();
  if (error) throw error;
  if (!data) fail(403, 'Verified administrator role required.');
  return data as Json;
}
async function requireAdmin(uid: string, permission?: string, elevated = false) {
  const role = await adminRole(uid);
  if (elevated && role.elevated !== true) fail(403, 'Elevated administrator permission required.');
  if (permission && role.elevated !== true && !(role.permissions ?? []).includes(permission)) fail(403, `Permission ${permission} is required.`);
  return role;
}
async function notify(userId: string, payload: Json) {
  const supportCaseId=text(payload.supportCaseId,100);
  const storedData={...(payload.data&&typeof payload.data==='object'?payload.data:{}),...(supportCaseId?{supportCaseId}:{})};
  const {data:result,error}=await admin.rpc('create_notification_outbox',{
    p_user_id:userId,p_title:text(payload.title,160),p_body:text(payload.body,1000),p_type:text(payload.type,50)||'SYSTEM',
    p_job_id:text(payload.jobId,80)||null,p_data:storedData,
  });
  if(error){console.error('notification and delivery enqueue failed',error.message);return;}
  if(result?.hasDeliveries){
    // Run the durable outbox immediately for low-latency booking and safety
    // alerts. The scheduled worker remains the retry/recovery path.
    const schedulerSecret=Deno.env.get('CRON_SECRET')??'';
    if(schedulerSecret){
      try{const dispatched=await fetch(`${url}/functions/v1/delivery-worker`,{method:'POST',headers:{'x-scheduler-secret':schedulerSecret,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});if(!dispatched.ok)console.warn('Immediate notification dispatch deferred to scheduler',dispatched.status);}
      catch(error){console.warn('Immediate notification dispatch deferred to scheduler',String(error));}
    }
  }
}
async function emailSupport(subject: string, message: string) {
  const apiKey=secret('RESEND_API_KEY','EXPO_RESEND_API_KEY');if(!apiKey)return;
  try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({from:'Detail Alerts <hello@detailapp.co.zw>',to:['support@detailapp.co.zw'],subject:subject.slice(0,180),text:message.slice(0,5000)})});if(!response.ok)console.error('support alert email failed',response.status,await response.text());}
  catch(error){console.error('support alert email could not be delivered',String(error));}
}
function paynowClient() {
  const id = Deno.env.get('PAYNOW_INTEGRATION_ID');
  const key = Deno.env.get('PAYNOW_INTEGRATION_KEY');
  if (!id || !key) fail(503, 'Paynow is not configured.');
  const client = new Paynow(id, key);
  client.resultUrl = `${url}/functions/v1/paynow-webhook`;
  client.returnUrl = Deno.env.get('PAYNOW_RETURN_URL') || `${url}/functions/v1/paynow-return`;
  return client;
}
async function startPaynowCheckout(jobId: string, email: string, details?: { reference?: string; amount?: number; cleanerName?: string; serviceType?: string; attemptKey?: string }) {
  const { data: payment, error } = await admin.from('payments').select('*').eq('id', `${jobId}_booking`).single();
  if (error) throw error;
  const { data: job, error: jobError } = await admin.from('jobs').select('*').eq('id', jobId).single();
  if (jobError) throw jobError;
  const reference = details?.reference ?? payment.reference;
  if (!reference) fail(409, 'Paynow reference is missing.');
  const client = paynowClient();
  const checkout = client.createPayment(String(reference), email);
  const price = Number(details?.amount ?? payment.amount);
  checkout.add(`Detail ${details?.serviceType ?? job.servicetype ?? 'cleaning'} with ${details?.cleanerName ?? job.cleanername ?? 'Cleaner'} (${jobId})`, price);
  const result = await client.send(checkout);
  if (!result?.success || !result.redirectUrl || !result.pollUrl) throw new Error(String(result?.error ?? 'Paynow did not return a checkout URL.'));
  const pollUrl = new URL(String(result.pollUrl));
  if (pollUrl.protocol !== 'https:' || !['paynow.co.zw', 'www.paynow.co.zw'].includes(pollUrl.hostname)) fail(502, 'Paynow returned an untrusted poll URL.');
  const paymentData=details?.attemptKey?{...(payment.data??{}),retryAttempt:{...(payment.data?.retryAttempt??{}),status:'PENDING',checkoutCreatedAt:new Date().toISOString()}}:payment.data;
  const {error:paymentUpdateError}=await admin.from('payments').update({ status: 'PENDING', redirecturl: String(result.redirectUrl), pollurl: String(result.pollUrl), ...(details?.attemptKey?{data:paymentData}:{}), updatedat: new Date().toISOString() }).eq('id', payment.id);
  if(paymentUpdateError)throw paymentUpdateError;
  const {error:jobUpdateError}=await admin.from('jobs').update({ paymentstatus: 'PENDING' }).eq('id', jobId);
  if(jobUpdateError)throw jobUpdateError;
  return String(result.redirectUrl);
}
async function applyPaynowStatus(reference: string, status: string, amount: string | number) {
  const { data, error } = await admin.rpc('apply_paynow_status', { p_reference: reference, p_status: status, p_amount: Number(amount) });
  if (error) throw error;
  if(data?.status==='REFUNDED'){
    const {data:payment}=await admin.from('payments').select('id,data').eq('reference',reference).maybeSingle();
    if(payment?.data?.refundRequest?.status==='PENDING')await admin.from('payments').update({data:{...payment.data,refundRequest:{...payment.data.refundRequest,status:'COMPLETED',completedAt:new Date().toISOString()}}}).eq('id',payment.id);
  }
  if (data?.cleanerId && data.status === 'ESCROWED') await notify(data.cleanerId, { type: 'PAYMENT_ESCROWED', title: 'Booking funded with BuySafe', body: 'Paynow is holding the customer payment. You can now start the booking.', jobId: data.jobId });
  return data as Json;
}

async function dispatch(name: string, input: Json, request: Request, user: User | null) {
  const uid = user?.id;
  const authed = (): string => { if (!uid) fail(401, 'Sign in required.'); return uid; };
  switch (name) {
    case 'blogPublicList': {
      const slug = text(input.slug, 100);
      if (slug) {
        const { data, error } = await admin.from('blogposts').select('id,slug,title,excerpt,content,keywords,status,publishedat,updatedat').eq('slug', slug).eq('status', 'PUBLISHED').maybeSingle();
        if (error) throw error;
        if (!data) fail(404, 'Article not found.');
        return { post: { id:data.id, slug:data.slug, title:data.title, excerpt:data.excerpt, content:data.content, keywords:data.keywords, publishedAt:data.publishedat, updatedAt:data.updatedat } };
      }
      const page = Math.max(1, Math.min(10000, Number(input.page) || 1));
      const pageSize = Math.max(1, Math.min(24, Number(input.limit) || 6));
      const { data, count, error } = await admin.from('blogposts').select('id,slug,title,excerpt,keywords,publishedat,updatedat', { count:'exact' }).eq('status','PUBLISHED').order('publishedat',{ascending:false}).range((page-1)*pageSize, page*pageSize-1);
      if (error) throw error;
      const total = count ?? 0;
      return { posts:(data??[]).map((p:Json)=>({id:p.id,slug:p.slug,title:p.title,excerpt:p.excerpt,keywords:p.keywords,publishedAt:p.publishedat,updatedAt:p.updatedat})), page, pageSize, total, totalPages:Math.ceil(total/pageSize) };
    }
    case 'blogList': {
      const actor=authed(); await requireAdmin(actor,'marketing.read');
      const {data,error}=await admin.from('blogposts').select('*').order('updatedat',{ascending:false}); if(error)throw error;
      return {posts:(data??[]).map((p:Json)=>({id:p.id,slug:p.slug,title:p.title,excerpt:p.excerpt,content:p.content,keywords:p.keywords,status:p.status,publishedAt:p.publishedat,updatedAt:p.updatedat}))};
    }
    case 'blogSave': {
      const actor=authed(); await requireAdmin(actor,'marketing.send');
      const title=text(input.title,180).trim(), slug=text(input.slug,90).toLowerCase().trim(), excerpt=text(input.excerpt,300).trim(), content=text(input.content,30000), keywords=text(input.keywords,500), status=input.status==='PUBLISHED'?'PUBLISHED':'DRAFT';
      if(!title||!slug||!excerpt||!content||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(400,'Enter a valid title, URL slug, excerpt and article.');
      const id=text(input.id,80)||crypto.randomUUID(), now=new Date().toISOString();
      const {data,error}=await admin.from('blogposts').upsert({id,slug,title,excerpt,content,keywords,status,publishedat:status==='PUBLISHED'?(input.publishedAt||now):null,updatedat:now,createdby:actor},{onConflict:'id'}).select('*').single();
      if(error){if(error.code==='23505')fail(409,'That URL slug is already in use.');throw error;}
      await admin.from('adminauditevents').upsert({id:`blog_save_${id}_${Date.now()}`,action:'blog_article_saved',actorid:actor,targetid:id,reason:`${status}: ${title}`,data:{slug,status},immutable:true});
      return {post:{id:data.id,slug:data.slug,title:data.title,excerpt:data.excerpt,content:data.content,keywords:data.keywords,status:data.status,publishedAt:data.publishedat,updatedAt:data.updatedat}};
    }
    case 'blogDelete': {
      const actor=authed(); await requireAdmin(actor,'marketing.send');
      const id=text(input.id,80); if(!id)fail(400,'Article id is required.');
      const {data,error}=await admin.from('blogposts').select('title,slug').eq('id',id).maybeSingle(); if(error)throw error; if(!data)fail(404,'Article not found.');
      const deleted=await admin.from('blogposts').delete().eq('id',id); if(deleted.error)throw deleted.error;
      await admin.from('adminauditevents').upsert({id:`blog_delete_${id}_${Date.now()}`,action:'blog_article_deleted',actorid:actor,targetid:id,reason:`Deleted ${data.title}`,data:{slug:data.slug},immutable:true});
      return {success:true};
    }
    case 'getBetaConfig': {
      const [{data:beta,error:betaError},{data:operations,error:operationsError}]=await Promise.all([
        admin.from('configuration').select('value').eq('key','beta').maybeSingle(),
        admin.from('configuration').select('value').eq('key','operations').maybeSingle(),
      ]);
      if(betaError)throw betaError;if(operationsError)throw operationsError;
      const settings=beta?.value??{},switches=operations?.value?.switches??{};
      const maintenanceMode=settings.maintenanceMode===true||switches.maintenance===true;
      const disableNewBookings=settings.disableNewBookings===true||switches.bookingCreation===true;
      return {
        suppliesFeeUsd:10,contactUrl:'https://wa.me/',...settings,
        bookingEnabled:settings.bookingEnabled===true&&!maintenanceMode&&!disableNewBookings,
        instantBookingEnabled:settings.instantBookingEnabled===true,
        waitlistEnabled:settings.waitlistEnabled!==false,
        maintenanceMode,
        disableNewBookings,
        disablePayments:settings.disablePayments===true||switches.payments===true,
      };
    }
    case 'registerPushDevice': {
      const actor=authed(),token=text(input.token,200);await requireActiveMarketplaceAccount(actor);
      if(!/^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token))fail(400,'Invalid device notification token.');
      await enforceRateLimit(request,actor,'push_device_register',30,3600);
      const {error}=await admin.rpc('register_push_device',{p_user_id:actor,p_expo_push_token:token});if(error)throw error;
      return {success:true};
    }
    case 'unregisterPushDevice': {
      const actor=authed(),token=text(input.token,200);
      if(!/^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token))fail(400,'Invalid device notification token.');
      const {error}=await admin.rpc('unregister_push_device',{p_user_id:actor,p_expo_push_token:token});if(error)throw error;
      return {success:true};
    }
    case 'startCleanerIdentityVerification': {
      const actor = authed();
      await enforceRateLimit(request, actor, 'didit_session', 5, 3600);
      if (input.consent !== true) fail(400, 'Consent to the Didit privacy notice is required.');
      const apiKey = secret('DIDIT_API_KEY','DIDIT_KYC_SECRET_KEY'); const workflow = Deno.env.get('DIDIT_WORKFLOW_ID');
      if (!apiKey || !workflow) fail(503, 'Identity verification is not configured.');
      const profile = await userRow(actor);
      if (profile.verificationstatus === 'VERIFIED') fail(409, 'Your identity is already verified.');
      const { data: existing } = await admin.from('privatekyc').select('*').eq('userid', actor).maybeSingle();
      if (existing?.sessionid && existing?.sessionurl && String(existing.status).toLowerCase() === 'pending') return { sessionUrl: existing.sessionurl, status: 'Pending' };
      const response = await fetch('https://verification.didit.me/v2/session/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ workflow_id: workflow, vendor_data: actor }) });
      const body = await response.json().catch(() => ({}));
      const sessionUrl = body.session_url ?? body.url;
      let valid = false; try { const parsed = new URL(sessionUrl); valid = parsed.protocol === 'https:' && (parsed.hostname === 'didit.me' || parsed.hostname.endsWith('.didit.me')); } catch { /* invalid provider URL */ }
      if (!response.ok || !body.session_id || !valid) fail(503, 'Could not start identity verification.');
      const now = new Date().toISOString();
      await admin.from('privatekyc').upsert({ userid: actor, provider: 'didit', sessionid: body.session_id, sessionurl: sessionUrl, status: 'Pending', consentedat: now, updatedat: now });
      await admin.from('users').update({ verificationstatus: 'PENDING', updatedat: now }).eq('id', actor);
      return { sessionUrl, status: 'Pending' };
    }
    case 'refreshCleanerIdentityVerification': {
      const actor = authed(); await enforceRateLimit(request,actor,'didit_status_refresh',10,3600); const key = secret('DIDIT_API_KEY','DIDIT_KYC_SECRET_KEY');
      if (!key) fail(503, 'Identity verification is not configured.');
      const { data: kyc } = await admin.from('privatekyc').select('*').eq('userid', actor).maybeSingle();
      if (!kyc?.sessionid) fail(409, 'Start identity verification first.');
      let response:Response;
      try { response=await fetch(`https://verification.didit.me/v2/session/${encodeURIComponent(kyc.sessionid)}/decision/`,{headers:{'x-api-key':key}}); }
      catch { fail(503,'Could not check verification yet.'); }
      const decision=await response.json().catch(()=>null);
      if(!response.ok||!decision||decision.session_id!==kyc.sessionid||typeof decision.status!=='string')fail(503,'Could not check verification yet.');
      const raw=decision.status.trim().toLowerCase();
      const accepted=['approved','verified'].includes(raw);
      const rejected=['declined','rejected','failed','expired','abandoned','cancelled','canceled'].includes(raw);
      const pending=['pending','in progress','in_progress','processing','review','reviewing'].includes(raw);
      if(!accepted&&!rejected&&!pending)fail(503,'Verification returned an unrecognized status. Try again later.');
      const profile=await userRow(actor);
      const status=accepted?'VERIFIED':rejected?'REJECTED':profile.verificationstatus==='VERIFIED'?'VERIFIED':'PENDING';
      const now = new Date().toISOString();
      const {error:userError}=await admin.from('users').update({verificationstatus:status,verificationlevel:status==='VERIFIED'?2:1,updatedat:now}).eq('id',actor);
      if(userError)throw userError;
      const {error:kycError}=await admin.from('privatekyc').update({status:decision.status,updatedat:now}).eq('userid',actor);
      if(kycError)throw kycError;
      return { status };
    }
    case 'acceptCleanerAgreement': {
      const actor = authed();
      const { error } = await admin.rpc('accept_cleaner_agreement',{p_user_id:actor});
      if (error) throw error;
      return { ok: true };
    }
    case 'acceptCustomerAgreement': {
      const actor=authed();
      const {error}=await admin.rpc('accept_customer_agreement',{p_user_id:actor});
      if(error)throw error;
      return {ok:true,version:'customer-2026-10-23'};
    }
    case 'submitCleanerApplication': {
      const actor = authed(); const profile = await userRow(actor);
      if (profile.verificationstatus !== 'VERIFIED' || !user?.email_confirmed_at) fail(409, 'Verify your identity and email before applying.');
      const inputName = text(input.fullName, 120), phone = text(input.phone, 40), address = text(input.address, 250), area = text(input.serviceArea, 120);
      const categories = Array.isArray(input.serviceCategories) ? [...new Set(input.serviceCategories.filter((x: unknown) => x === 'HOUSE' || x === 'CAR'))] : [];
      const radius = Number(input.serviceRadiusKm ?? 15), experience = Number(input.experienceYears ?? 0);
      if (inputName.length < 2 || phone.length < 7 || address.length < 5 || area.length < 2 || !categories.length || radius < 1 || radius > 100 || experience < 0 || experience > 60) fail(400, 'Complete all cleaner application fields with valid values.');
      const { error } = await admin.from('users').update({ displayname: inputName, phone, address, servicearea: area, servicecategories: categories, serviceradiuskm: radius, experienceyears: experience, cleaneronboardingcomplete: true, updatedat: new Date().toISOString() }).eq('id', actor);
      if (error) throw error;
      return { ok: true };
    }
    case 'setActiveRole': {
      const actor = authed(); const profile = await userRow(actor); const role = input.role;
      if (!['CUSTOMER','CLEANER'].includes(role)) fail(400, 'Invalid role.');
      if (profile.issuspended || profile.isbanned || profile.accountdeletedat) fail(403, 'This account cannot change marketplace roles. Contact support for help.');
      if (role === 'CLEANER' && (profile.verificationstatus !== 'VERIFIED' || !profile.cleaneragreementaccepted || !profile.cleaneronboardingcomplete || profile.issuspended || profile.isbanned)) fail(409, 'Complete cleaner verification and onboarding first.');
      if (role === 'CUSTOMER' && profile.role === 'CLEANER') {
        const { count, error } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('cleanerid', actor).in('status', ['ASSIGNED','EN_ROUTE','IN_PROGRESS']);
        if (error) throw error;
        if ((count ?? 0) > 0) fail(409, 'Finish or contact support about your active cleaner booking before changing roles.');
      }
      const { error } = await admin.from('users').update({ role, updatedat: new Date().toISOString() }).eq('id', actor);
      if (error) throw error;
      return { ok: true };
    }
    case 'updateCleanerPresence': {
      const actor = authed(); const profile = await userRow(actor);
      if (!['AVAILABLE','OFFLINE'].includes(input.status) || profile.role !== 'CLEANER' || profile.verificationstatus !== 'VERIFIED' || !profile.cleaneragreementaccepted || profile.issuspended || profile.isbanned) fail(403, 'Only an approved cleaner can change availability.');
      if(input.status==='OFFLINE'){
        const {count,error}=await admin.from('jobs').select('id',{count:'exact',head:true}).eq('cleanerid',actor).in('status',['ASSIGNED','EN_ROUTE','IN_PROGRESS']);
        if(error)throw error;
        if((count??0)>0)fail(409,'Finish or contact support about your active booking before going offline.');
      } else {
        const locationAt=Date.parse(String(profile.locationupdatedat??''));
        if(!profile.locationpoint||!Number.isFinite(locationAt)||Date.now()-locationAt>2*60*1000)fail(409,'Share a fresh location before going online.');
        const {count,error}=await admin.from('jobs').select('id',{count:'exact',head:true}).eq('cleanerid',actor).in('status',['ASSIGNED','EN_ROUTE','IN_PROGRESS']);
        if(error)throw error;
        if((count??0)>0)fail(409,'You have an active booking and cannot take new requests yet.');
      }
      const patch: Json = { status: input.status, updatedat: new Date().toISOString() };
      if (input.status === 'OFFLINE') { patch.locationpoint = null; patch.locationupdatedat = null; }
      const { error } = await admin.from('users').update(patch).eq('id', actor);
      if (error) throw error;
      return { ok: true };
    }
    case 'updateCleanerLocation': {
      const actor = authed(); const profile = await userRow(actor); const lat = Number(input.lat), lng = Number(input.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) fail(400,'Invalid coordinates.');
      if (profile.role !== 'CLEANER' || profile.verificationstatus !== 'VERIFIED' || !profile.cleaneragreementaccepted || profile.status !== 'AVAILABLE' || profile.issuspended || profile.isbanned) fail(403,'Only an approved online cleaner can share availability location.');
      const point = `SRID=4326;POINT(${lng} ${lat})`;
      const { error } = await admin.from('users').update({ location: { lat, lng }, locationpoint: point, locationupdatedat: new Date().toISOString(), updatedat: new Date().toISOString() }).eq('id', actor);
      if (error) throw error;
      await admin.from('jobs').update({cleanerlocation:{lat,lng},cleanerlocationupdatedat:new Date().toISOString()}).eq('cleanerid',actor).in('status',['ASSIGNED','EN_ROUTE','IN_PROGRESS']);
      return { ok: true };
    }
    case 'prepareCleanerLocation': {
      const actor=authed(),profile=await userRow(actor),lat=Number(input.lat),lng=Number(input.lng);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)fail(400,'Invalid coordinates.');
      if(profile.role!=='CLEANER'||profile.verificationstatus!=='VERIFIED'||!profile.cleaneragreementaccepted||profile.status!=='OFFLINE'||profile.issuspended||profile.isbanned)fail(403,'Only an approved offline cleaner can prepare an availability location.');
      const point=`SRID=4326;POINT(${lng} ${lat})`;
      const {error}=await admin.from('users').update({location:{lat,lng},locationpoint:point,locationupdatedat:new Date().toISOString(),updatedat:new Date().toISOString()}).eq('id',actor);
      if(error)throw error;
      return {ok:true};
    }
    case 'updateActiveJobLocation': {
      const actor = authed(); const jobId = text(input.jobId, 80); const lat = Number(input.lat), lng = Number(input.lng);
      if (!jobId || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) fail(400,'Invalid job location.');
      const { data: job } = await admin.from('jobs').select('*').eq('id',jobId).maybeSingle();
      if (!job || job.cleanerid !== actor || !['ASSIGNED','EN_ROUTE','IN_PROGRESS'].includes(job.status)) fail(403,'Only the assigned cleaner can share location during an active booking.');
      const { error } = await admin.from('jobs').update({ cleanerlocation: { lat, lng }, cleanerlocationupdatedat: new Date().toISOString() }).eq('id',jobId);
      if (error) throw error;
      return { ok: true };
    }
    case 'addCompletionPhoto': {
      const actor = authed(); const jobId = text(input.jobId, 80), path = text(input.url, 500);
      if (!path.startsWith(`detail-media/job-completion/${jobId}/${actor}/`)) fail(400,'A valid uploaded completion photo is required.');
      const { error } = await admin.rpc('add_completion_photo', { p_job_id: jobId, p_cleaner_id: actor, p_path: path });
      if (error) throw error;
      return { ok: true };
    }
    case 'createBooking': {
      const actor = authed(); await requireActiveMarketplaceAccount(actor); const key = requireKey(input.idempotencyKey); const booking = input.booking ?? {};
      await enforceRateLimit(request, actor, 'create_booking', 8, 3600);
      const [{data:config,error:configError},{data:operations,error:operationsError}]=await Promise.all([admin.from('configuration').select('value').eq('key','beta').maybeSingle(),admin.from('configuration').select('value').eq('key','operations').maybeSingle()]);
      if(configError)throw configError;if(operationsError)throw operationsError;
      if(config?.value?.bookingEnabled!==true)fail(503,'Bookings are not open in this area yet. Please join the waitlist for launch updates.');
      if (config?.value?.maintenanceMode || config?.value?.disableNewBookings || operations?.value?.switches?.maintenance===true || operations?.value?.switches?.bookingCreation===true) fail(503,'BOOKINGS_DISABLED');
      const photos = Array.isArray(booking.photos) ? booking.photos.slice(0,6).map((x: unknown) => text(x,500)) : [];
      if (photos.some((path: string) => !path.startsWith(`detail-media/job-photos/${actor}/`))) fail(400,'Invalid booking photo path.');
      if (JSON.stringify(booking.checklist ?? {}).length > 20000 || !booking.checklist || typeof booking.checklist !== 'object') fail(400,'A valid cleaning checklist is required.');
      const budget = Number(booking.budget ?? 0); if (!Number.isFinite(budget) || budget < 0 || budget > 10000) fail(400,'Budget must be between 0 and 10000.');
      const bookingMode = ['INSTANT','SCHEDULED'].includes(String(booking.bookingMode).toUpperCase()) ? String(booking.bookingMode).toUpperCase() : 'SCHEDULED';
      if(bookingMode==='INSTANT'&&config?.value?.instantBookingEnabled!==true)
        fail(503,'Book Now is temporarily unavailable while service pricing and duration are finalized. Schedule a booking to receive cleaner quotes.');
      if (bookingMode==='SCHEDULED' && booking.timePreference==='CUSTOM') {
        const scheduledAt=Date.parse(String(booking.scheduledDateTime??''));
        if(!Number.isFinite(scheduledAt)||scheduledAt<Date.now()+30*60*1000||scheduledAt>Date.now()+180*24*60*60*1000)fail(400,'Custom bookings must be at least 30 minutes from now and within the next 180 days.');
      }
      const suppliesRequired = booking.suppliesRequired === true;
      const configuredSuppliesFee=Number(config?.value?.suppliesFeeUsd ?? 10);
      const suppliesFee = suppliesRequired ? (Number.isFinite(configuredSuppliesFee)?Math.max(0,Math.min(100,configuredSuppliesFee)):10) : 0;
      const prices: Record<string,number> = { BASIC_HOUSE:10,SPECIFIC_ROOM:15,STANDARD_HOUSE:35,DEEP_HOUSE:80,EXTERIOR_WASH:3,FULL_CAR:12,DEEP_DETAIL:65 };
      const basePrice=prices[text(booking.serviceId,40)];
      if(bookingMode==='INSTANT'&&!basePrice)fail(400,'Choose a supported fixed-price service for Book Now.');
      const latitude=Number(booking.location?.lat),longitude=Number(booking.location?.lng);
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||(latitude===0&&longitude===0))
        fail(400,'A mappable job location is required. Use the location button or enter a more specific address.');
      const { data: jobId, error } = await admin.rpc('create_booking', { p_actor_id: actor, p_idempotency_key: key, p_booking: { ...booking, bookingMode, suppliesRequired, suppliesFee, price:bookingMode==='INSTANT'?basePrice+suppliesFee:null, budget:bookingMode==='INSTANT'?basePrice+suppliesFee:booking.budget, photos } });
      if (error) throw error;
      if (bookingMode === 'INSTANT') {
        const { data: candidates, error: matchError } = await admin.rpc('search_instant_cleaners', { p_job_id: jobId, p_actor_id: actor, p_limit: 20 });
        if (matchError) throw matchError;
        const cleanerIds = (candidates ?? []).map((candidate: Json) => candidate.cleaner_id);
        const distances = (candidates ?? []).map((candidate: Json) => Number(candidate.distance_meters)||0);
        const { error: offerError } = await admin.rpc('create_instant_offers', { p_job_id: jobId, p_actor_id: actor, p_cleaner_ids: cleanerIds, p_distances:distances, p_expires_at: new Date(Date.now()+3*60*1000).toISOString() });
        if (offerError) throw offerError;
        await Promise.all(cleanerIds.map((cleanerId: string) => notify(cleanerId, { type:'INSTANT_BOOKING_OFFER', title:'Nearby cleaning request', body:`A ${booking.serviceType || 'cleaning'} request is available nearby. Open Detail to respond.`, jobId })));
        return { success:true, jobId, matchedCleaners:cleanerIds.length };
      }
      const {data:scheduledNotices,error:noticeError}=await admin.rpc('notify_scheduled_job_cleaners',{p_job_id:jobId,p_customer_id:actor,p_limit:20});
      if(noticeError)throw noticeError;
      return { success: true, jobId, notifiedCleaners:Number(scheduledNotices??0) };
    }
    case 'refreshInstantMatching': {
      const actor=authed(),jobId=text(input.jobId,80);await requireActiveMarketplaceAccount(actor);await enforceRateLimit(request,actor,'instant_match_refresh',12,300);
      const {data:job,error:jobError}=await admin.from('jobs').select('id,category,bookingmode,status,matchexpiresat').eq('id',jobId).eq('customerid',actor).maybeSingle();
      if(jobError)throw jobError;if(!job||job.bookingmode!=='INSTANT'||job.status!=='PENDING')fail(409,'This instant request is no longer matching.');
      if(job.matchexpiresat&&Date.parse(job.matchexpiresat)<=Date.now())return {matchedCleaners:0,expired:true};
      const {data:existingBids,error:bidError}=await admin.from('bids').select('id').eq('jobid',jobId).in('status',['PENDING','COUNTERED','ACCEPTED']).limit(1);if(bidError)throw bidError;
      if(existingBids?.length)return {matchedCleaners:0,customerActionRequired:true};
      const {data:candidates,error}=await admin.rpc('search_instant_cleaners',{p_job_id:jobId,p_actor_id:actor,p_limit:20});if(error)throw error;
      const candidateIds=(candidates??[]).map((candidate:Json)=>candidate.cleaner_id);
      if(!candidateIds.length)return {matchedCleaners:0,expired:false};
      const {data:activeOffers,error:offerReadError}=await admin.from('instantoffers').select('cleanerid').eq('jobid',jobId).eq('status','OFFERED').gt('expiresat',new Date().toISOString()).in('cleanerid',candidateIds);if(offerReadError)throw offerReadError;
      const alreadyOffered=new Set((activeOffers??[]).map(item=>item.cleanerid));
      const fresh=(candidates??[]).filter((candidate:Json)=>!alreadyOffered.has(candidate.cleaner_id));
      if(fresh.length){
        const matchingExpiry=Date.parse(job.matchexpiresat||'');
        const offerExpiry=Math.min(Date.now()+3*60*1000,Number.isFinite(matchingExpiry)?matchingExpiry:Date.now()+3*60*1000);
        const {error:createError}=await admin.rpc('create_instant_offers',{p_job_id:jobId,p_actor_id:actor,p_cleaner_ids:fresh.map((item:Json)=>item.cleaner_id),p_distances:fresh.map((item:Json)=>Number(item.distance_meters)||0),p_expires_at:new Date(offerExpiry).toISOString()});if(createError)throw createError;
        await Promise.all(fresh.map((item:Json)=>notify(item.cleaner_id,{type:'INSTANT_BOOKING_OFFER',title:'Nearby cleaning request',body:`A ${job.category==='CAR'?'car':'house'} cleaning request is available nearby. Open Detail to respond.`,jobId})));
      }
      return {matchedCleaners:fresh.length,expired:false};
    }
    case 'listInstantOffers': {
      const actor=authed();
      const {data:offers,error}=await admin.from('instantoffers').select('*').eq('cleanerid',actor).eq('status','OFFERED').gt('expiresat',new Date().toISOString()).order('createdat',{ascending:false}).limit(20);
      if(error)throw error;
      const rows=await Promise.all((offers??[]).map(async offer=>{
        const {data:job}=await admin.from('jobs').select('id,category,servicetype,price,budget,estimatedduration,suppliesrequired,suppliesfee,checklist').eq('id',offer.jobid).maybeSingle();
        return job?{offerId:offer.id,jobId:job.id,category:job.category,serviceType:job.servicetype,price:Number(job.price??job.budget??0),estimatedPayout:Math.round(Number(job.price??job.budget??0)*0.9*100)/100,estimatedDuration:job.estimatedduration,suppliesRequired:job.suppliesrequired,suppliesFee:job.suppliesfee,distanceKm:offer.distancemeters===null?null:Math.round(offer.distancemeters/100)/10,expiresAt:offer.expiresat,checklist:job.checklist}:null;
      }));
      return {offers:rows.filter(Boolean)};
    }
    case 'transitionBooking': {
      const actor = authed(); const jobId = text(input.jobId,80); const state = text(input.newState,30); const key = requireKey(input.idempotencyKey);
      const { data: job } = await admin.from('jobs').select('*').eq('id',jobId).maybeSingle();
      if (!job) fail(404,'Booking not found.');
      if (!['EN_ROUTE','IN_PROGRESS'].includes(state) || job.cleanerid !== actor) fail(403,'Only the assigned cleaner can update this booking stage.');
      if (job.paymentmethod === 'PAYNOW' && !['ESCROWED','DELIVERED','PAID'].includes(job.paymentstatus)) fail(409,'Wait for Paynow to confirm BuySafe is holding the booking payment.');
      const { data, error } = await admin.rpc('transition_booking', { p_job_id: jobId, p_actor_id: actor, p_new_status: state, p_idempotency_key: key, p_reason: text(input.reason,500) || null });
      if (error) throw error;
      const recipient = job.customerid;
      if (recipient && recipient !== actor) await notify(recipient,{ type: state, title: `Booking ${state.toLowerCase().replace('_',' ')}`, body: 'Your booking has a new update.', jobId });
      return { success: true, state: data.status };
    }
    case 'respondInstantOffer': {
      const actor=authed(), offerId=text(input.offerId,80), accept=input.accept===true, key=requireKey(input.idempotencyKey);
      if (accept) await requireActiveMarketplaceAccount(actor);
      const {data,error}=await admin.rpc('respond_instant_offer',{p_offer_id:offerId,p_actor_id:actor,p_accept:accept,p_idempotency_key:key});
      if(error)throw error;
      if(data?.status==='CUSTOMER_ACTION_REQUIRED'&&data.customerId)await notify(data.customerId,{type:'INSTANT_BOOKING_ACCEPTED',title:'Cleaner accepted your request',body:'Review the fixed-price offer and choose your payment method to confirm the booking.',jobId:data.jobId});
      return data;
    }
    case 'markBookingArrived': {
      const actor=authed(),jobId=text(input.jobId,80),key=requireKey(input.idempotencyKey),latitude=Number(input.latitude),longitude=Number(input.longitude);
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)fail(400,'A current location is required to record arrival.');
      const {data,error}=await admin.rpc('mark_booking_arrived',{p_job_id:jobId,p_actor_id:actor,p_idempotency_key:key,p_latitude:latitude,p_longitude:longitude});
      if(error)throw error;
      const {data:job}=await admin.from('jobs').select('customerid').eq('id',jobId).maybeSingle();
      if(job?.customerid)await notify(job.customerid,{type:'CLEANER_ARRIVED',title:'Your cleaner has arrived',body:'Your cleaner recorded arrival at the booking location.',jobId});
      return {success:true,arrivalAt:data};
    }
    case 'respondToCompletion': {
      const actor=authed(), jobId=text(input.jobId,80), response=text(input.response,20).toUpperCase(), reason=text(input.reason,1000);
      if(response==='DISPUTED'&&reason.length<5)fail(400,'Please describe the issue so support can review it.');
      const {data,error}=await admin.rpc('complete_booking_customer_response',{p_job_id:jobId,p_actor_id:actor,p_response:response,p_reason:reason});
      if(error)throw error;
      const {data:job}=await admin.from('jobs').select('cleanerid').eq('id',jobId).maybeSingle();
      if(job?.cleanerid)await notify(job.cleanerid,{type:response==='DISPUTED'?'COMPLETION_DISPUTED':'COMPLETION_CONFIRMED',title:response==='DISPUTED'?'Completion needs review':'Customer confirmed completion',body:response==='DISPUTED'?'The customer reported an issue. Detail support will review it.':'The customer confirmed your completed booking.',jobId});
      return data;
    }
    case 'cancelBooking': {
      const actor = authed(); const jobId = text(input.jobId,80); const reason = text(input.reason,500); const key = requireKey(input.idempotencyKey);
      if (!reason) fail(400,'A cancellation reason is required.');
      const { data: job } = await admin.from('jobs').select('*').eq('id',jobId).maybeSingle();
      if (!job || ![job.customerid,job.cleanerid].includes(actor)) fail(403,'Not a booking participant.');
      if(job.paymentmethod==='PAYNOW'&&['PENDING','ESCROWED','DELIVERED','PAID','DISPUTED'].includes(job.paymentstatus)){
        const caseId=`cancel_request_${key}`;
        const {error:caseError}=await admin.from('supportcases').upsert({id:caseId,jobid:jobId,customerid:job.customerid,cleanerid:job.cleanerid,reason:`Cancellation and Paynow refund review requested: ${reason}`,status:'OPEN',data:{type:'CANCELLATION_REQUEST',reporterId:actor,paymentStatus:job.paymentstatus}},{onConflict:'id'});if(caseError)throw caseError;
        await notify(job.customerid,{type:'CANCELLATION_REVIEW',title:'Cancellation review opened',body:'Support will review the Paynow BuySafe payment before cancelling the booking.',jobId});
        return {success:true,refund:{status:'REVIEW_REQUIRED',caseId}};
      }
      const { data, error } = await admin.rpc('cancel_booking',{p_job_id:jobId,p_actor_id:actor,p_reason:reason,p_idempotency_key:key});
      if (error) throw error;
      return { success:true, refund:data };
    }
    case 'rescheduleBooking': {
      const actor=authed(),jobId=text(input.jobId,80),scheduledDateTime=text(input.scheduledDateTime,80),key=requireKey(input.idempotencyKey),nextAt=Date.parse(scheduledDateTime);
      if(!Number.isFinite(nextAt)||nextAt<Date.now()+2*60*60*1000||nextAt>Date.now()+180*24*60*60*1000)fail(400,'Choose a date at least two hours from now and within the next 180 days.');
      const {data:job,error}=await admin.from('jobs').select('*').eq('id',jobId).maybeSingle();if(error)throw error;
      if(!job||![job.customerid,job.cleanerid].includes(actor))fail(403,'Only a booking participant can reschedule.');
      if(!['PENDING','CONFIRMED','ASSIGNED'].includes(job.status)||Number.isFinite(Date.parse(job.scheduleddatetime??''))&&Date.parse(job.scheduleddatetime)<Date.now()+2*60*60*1000)fail(409,'This booking is too close to its start time or has already begun. Contact support for help.');
      const iso=new Date(nextAt).toISOString();const {data:proposal,error:proposalError}=await admin.rpc('propose_booking_reschedule',{p_job_id:jobId,p_actor_id:actor,p_scheduled_at:iso,p_idempotency_key:key});if(proposalError)throw proposalError;
      return {success:true,proposalId:proposal.id,proposedDateTime:proposal.proposedDateTime,expiresAt:proposal.expiresAt};
    }
    case 'respondRescheduleProposal': {
      const actor=authed(),jobId=text(input.jobId,80),key=requireKey(input.idempotencyKey);
      if(typeof input.accept!=='boolean')fail(400,'Choose whether to accept the proposed booking time.');
      const {data,error}=await admin.rpc('respond_booking_reschedule',{p_job_id:jobId,p_actor_id:actor,p_accept:input.accept,p_idempotency_key:key});
      if(error)throw error;
      return {success:true,...data};
    }
    case 'completeBooking': {
      const actor = authed(); const jobId = text(input.jobId,80); const key = requireKey(input.idempotencyKey);
      const { data: job } = await admin.from('jobs').select('*').eq('id',jobId).maybeSingle();
      if (!job || job.cleanerid !== actor) fail(403,'Only the assigned cleaner can complete this booking.');
      if (!Array.isArray(job.completionphotos) || job.completionphotos.length < 1) fail(409,'Add at least one completion photo before submitting the finished booking.');
      const { error } = await admin.rpc('transition_booking',{p_job_id:jobId,p_actor_id:actor,p_new_status:'COMPLETED',p_idempotency_key:key,p_reason:null});
      if (error) throw error;
      await notify(job.customerid,{type:'COMPLETED',title:'Booking completed',body:'Your cleaning is complete. Confirm delivery in Paynow BuySafe, then leave a rating.',jobId});
      return { success:true };
    }
    case 'submitBid': {
      const actor = authed(); const jobId = text(input.jobId,80); const bidPrice=round2(Number(input.bidPrice)); const eta=Number(input.estimatedArrival);
      await enforceRateLimit(request,actor,'submit_bid',20,3600);
      if (!jobId || !Number.isFinite(bidPrice) || bidPrice < 1 || bidPrice > 10000 || !Number.isInteger(eta) || eta < 1 || eta > 120) fail(400,'A valid job, bid amount and arrival estimate are required.');
      const [profileResult,jobResult] = await Promise.all([admin.from('users').select('*').eq('id',actor).single(),admin.from('jobs').select('*').eq('id',jobId).single()]);
      if (profileResult.error || jobResult.error) fail(404,'Job or cleaner not found.');
      const profile=profileResult.data, job=jobResult.data;
      if (profile.role!=='CLEANER' || profile.verificationstatus!=='VERIFIED' || !profile.cleaneragreementaccepted || !profile.cleaneronboardingcomplete || profile.issuspended || profile.isbanned || profile.accountdeletedat || Number(profile.balance)<0) fail(403,'Complete cleaner verification and resolve any outstanding commission before bidding.');
      const {data:operations}=await admin.from('configuration').select('value').eq('key','operations').maybeSingle();
      if(operations?.value?.switches?.maintenance===true||operations?.value?.switches?.bidAcceptance===true)fail(503,'Cleaner bidding is temporarily paused.');
      if (job.status!=='PENDING' || job.bookingmode==='INSTANT' || (job.biddingexpiresat && new Date(job.biddingexpiresat).getTime()<Date.now())) fail(409,'This booking is not accepting cleaner bids.');
      const { data, error } = await admin.rpc('submit_bid_secure',{p_job_id:jobId,p_cleaner_id:actor,p_bid_price:bidPrice,p_estimated_arrival:eta,p_message:text(input.message,500)});
      if(error?.message?.includes('active quote'))fail(409,'You already have an active quote for this booking.');
      if (error) throw error;
      await notify(job.customerid,{type:'NEW_BID',title:'New cleaner quote',body:`${profile.displayname || 'A cleaner'} sent a quote for your booking.`,jobId});
      return {success:true,bidId:data};
    }
    case 'rejectBid': {
      const actor=authed(),jobId=text(input.jobId,80),bidId=text(input.bidId,80);
      const {error}=await admin.rpc('reject_bid_secure',{p_job_id:jobId,p_bid_id:bidId,p_customer_id:actor});
      if(error) throw error; return {success:true};
    }
    case 'increaseJobBudget': {
      const actor=authed(); const jobId=text(input.jobId,80); const value=round2(Number(input.newBudget));
      await requireActiveMarketplaceAccount(actor);
      const {data:job}=await admin.from('jobs').select('customerid,status,budget').eq('id',jobId).maybeSingle();
      if(!job||job.customerid!==actor) fail(403,'Only the customer can change the budget.');
      if(job.status!=='PENDING'||value<=Number(job.budget||0)||value<=0) fail(409,'A higher budget can only be set while the booking is open.');
      const expires=new Date(Date.now()+30*60*1000).toISOString();
      const [a,b]=await Promise.all([admin.from('jobs').update({budget:value,biddingexpiresat:expires}).eq('id',jobId),admin.from('openjobs').update({budget:value,biddingexpiresat:expires}).eq('jobid',jobId)]);
      if(a.error)throw a.error; if(b.error)throw b.error; return {success:true};
    }
    case 'acceptBid': {
      const actor=authed(); const jobId=text(input.jobId,80), bidId=text(input.bidId,80), method=text(input.paymentMethod,20).toUpperCase(), key=requireKey(input.idempotencyKey);
      await requireActiveMarketplaceAccount(actor);
      await enforceRateLimit(request,actor,'accept_bid',10,3600);
      const {data:booking,error:bookingError}=await admin.from('jobs').select('customerid').eq('id',jobId).maybeSingle();
      if(bookingError)throw bookingError;
      if(!booking||booking.customerid!==actor)fail(403,'Only the customer can accept a quote.');
      const [{data:config},{data:operations}]=await Promise.all([admin.from('configuration').select('value').eq('key','beta').maybeSingle(),admin.from('configuration').select('value').eq('key','operations').maybeSingle()]);
      if(config?.value?.maintenanceMode||config?.value?.disablePayments||operations?.value?.switches?.maintenance===true||operations?.value?.switches?.payments===true||operations?.value?.switches?.bidAcceptance===true)fail(503,'PAYMENTS_DISABLED');
      const {data,error}=await admin.rpc('accept_bid',{p_actor_id:actor,p_job_id:jobId,p_bid_id:bidId,p_payment_method:method,p_idempotency_key:key});
      if(error)throw error;
      let redirectUrl: string | null=null;
      if(method==='PAYNOW') {
        const {data:profile}=await admin.from('users').select('email').eq('id',actor).single();
        const email=user?.email??profile?.email;
        if(!email)fail(409,'Add an email address to your account before paying with Paynow.');
        try { redirectUrl=await startPaynowCheckout(jobId,email,{reference:data.payment.reference,amount:data.payment.amount,cleanerName:data.cleanerName}); }
        catch(error){await admin.from('payments').update({status:'FAILED',data:{failureReason:'INITIATION_FAILED'}}).eq('id',`${jobId}_booking`);await admin.from('jobs').update({paymentstatus:'FAILED'}).eq('id',jobId);throw error;}
      }
      if(data.cleanerId && method!=='PAYNOW') await notify(data.cleanerId,{type:'BID_ACCEPTED',title:'Quote accepted',body:'The customer accepted your quote.',jobId});
      return {...data,redirectUrl};
    }
    case 'refreshPaynowBookingPayment': {
      const actor=authed(), jobId=text(input.jobId,80);
      const {data:job}=await admin.from('jobs').select('customerid').eq('id',jobId).maybeSingle();
      if(!job||job.customerid!==actor)fail(403,'Only the customer can refresh this payment.');
      const {data:payment}=await admin.from('payments').select('*').eq('id',`${jobId}_booking`).maybeSingle();
      if(!payment||payment.provider!=='PAYNOW'||!payment.pollurl)fail(409,'Paynow checkout has not been created.');
      const poll=new URL(payment.pollurl); if(poll.protocol!=='https:'||!['paynow.co.zw','www.paynow.co.zw'].includes(poll.hostname))fail(400,'Untrusted Paynow poll URL.');
      const result=await paynowClient().pollTransaction(payment.pollurl);
      const applied=await applyPaynowStatus(String(result.reference),String(result.status),String(result.amount));
      return {success:true,status:applied.status};
    }
    case 'retryPaynowBookingPayment': {
      const actor=authed(), jobId=text(input.jobId,80),idempotencyKey=requireKey(input.idempotencyKey);
      await enforceRateLimit(request,actor,'paynow_booking_retry',5,3600);
      const [{data:job},{data:payment},{data:profile}] = await Promise.all([admin.from('jobs').select('*').eq('id',jobId).maybeSingle(),admin.from('payments').select('*').eq('id',`${jobId}_booking`).maybeSingle(),admin.from('users').select('email').eq('id',actor).maybeSingle()]);
      if(!job||!payment||job.customerid!==actor||job.paymentmethod!=='PAYNOW')fail(409,'This Paynow payment cannot be retried.');
      const email=user?.email??profile?.email; if(!email)fail(409,'Add an email address before paying with Paynow.');
      const {data:claim,error:claimError}=await admin.rpc('claim_paynow_booking_retry',{p_job_id:jobId,p_customer_id:actor,p_idempotency_key:idempotencyKey});if(claimError)throw claimError;
      if(claim.status==='PENDING'&&claim.redirectUrl)return {success:true,redirectUrl:claim.redirectUrl};
      if(claim.status==='IN_PROGRESS')fail(409,'Paynow checkout is still starting. Wait a moment, then refresh payment status.');
      const reference=String(claim.reference);
      try{
        const redirectUrl=await startPaynowCheckout(jobId,email,{reference,amount:Number(payment.amount),cleanerName:job.cleanername,serviceType:job.servicetype,attemptKey:idempotencyKey});
        return {success:true,redirectUrl};
      }catch(error){
        const {data:latest}=await admin.from('payments').select('data').eq('id',payment.id).maybeSingle();
        const retryAttempt={...(latest?.data?.retryAttempt??{}),status:'FAILED',failedAt:new Date().toISOString()};
        const {error:paymentError}=await admin.from('payments').update({status:'FAILED',data:{...(latest?.data??{}),retryAttempt},updatedat:new Date().toISOString()}).eq('id',payment.id);
        const {error:jobError}=await admin.from('jobs').update({paymentstatus:'FAILED',updatedat:new Date().toISOString()}).eq('id',jobId);
        if(paymentError||jobError)console.error('Paynow retry failed and status recovery was incomplete',paymentError?.message,jobError?.message);
        throw error;
      }
    }
    case 'refreshPaynowWalletTopup': {
      const actor=authed(), reference=text(input.referenceNumber,160);
      const {data:payment}=await admin.from('payments').select('*').eq('reference',reference).maybeSingle();
      if(!payment||payment.customerid!==actor||payment.jobid||payment.provider!=='PAYNOW'||payment.data?.type!=='wallet_topup'||!payment.pollurl)fail(404,'Wallet payment not found.');
      const poll=new URL(payment.pollurl); if(poll.protocol!=='https:'||!['paynow.co.zw','www.paynow.co.zw'].includes(poll.hostname))fail(400,'Untrusted Paynow poll URL.');
      const result=await paynowClient().pollTransaction(payment.pollurl);
      const applied=await applyPaynowStatus(String(result.reference),String(result.status),String(result.amount));
      return {success:true,status:applied.status};
    }
    case 'createPaynowWalletTopup': {
      const actor=authed(); const amount=round2(Number(input.amount)),idempotencyKey=requireKey(input.idempotencyKey);
      await enforceRateLimit(request, actor, 'wallet_topup', 6, 3600);
      const [{data:beta},{data:operations}]=await Promise.all([admin.from('configuration').select('value').eq('key','beta').maybeSingle(),admin.from('configuration').select('value').eq('key','operations').maybeSingle()]);
      if(beta?.value?.maintenanceMode||beta?.value?.disablePayments||operations?.value?.switches?.maintenance===true||operations?.value?.switches?.payments===true)fail(503,'PAYMENTS_DISABLED');
      if(!Number.isFinite(amount)||amount<1||amount>1000||String(input.currency??'USD').toUpperCase()!=='USD')fail(400,'Wallet top-ups must be between $1 and $1,000 USD.');
      const {data:profile}=await admin.from('users').select('email').eq('id',actor).single();
      const email=user?.email??profile?.email; if(!email)fail(409,'Add an email address to your account before paying with Paynow.');
      const stableId=(await hash(`${actor}:wallet_topup:${idempotencyKey}`)).slice(0,32),id=`topup_${stableId}`,reference=`wallet-${stableId}`,paymentKey=`wallet_topup_${stableId}`;
      const {data:existing,error:existingError}=await admin.from('payments').select('customerid,reference,status,redirecturl,pollurl').eq('idempotencykey',paymentKey).maybeSingle();
      if(existingError)throw existingError;
      if(existing){
        if(existing.customerid!==actor)fail(409,'This checkout key is already in use.');
        if(existing.status==='PENDING'&&existing.redirecturl)return {redirectUrl:existing.redirecturl,referenceNumber:existing.reference};
        fail(409,'This top-up attempt already exists. Start a new checkout from your wallet.');
      }
      const {error}=await admin.from('payments').insert({id,customerid:actor,provider:'PAYNOW',reference,amount,currency:'USD',status:'INITIATING',idempotencykey:paymentKey,data:{type:'wallet_topup'}});
      if(error?.code==='23505'){
        const {data:retry}=await admin.from('payments').select('customerid,reference,status,redirecturl').eq('idempotencykey',paymentKey).maybeSingle();
        if(retry?.customerid===actor&&retry.status==='PENDING'&&retry.redirecturl)return {redirectUrl:retry.redirecturl,referenceNumber:retry.reference};
      }
      if(error)throw error;
      const client=paynowClient(), checkout=client.createPayment(reference,email); checkout.add('Detail wallet top-up',amount);
      const result=await client.send(checkout);
      if(!result?.success||!result.redirectUrl||!result.pollUrl){await admin.from('payments').update({status:'FAILED'}).eq('id',id);fail(502,'Paynow could not start the wallet top-up.');}
      const poll=new URL(String(result.pollUrl)); if(poll.protocol!=='https:'||!['paynow.co.zw','www.paynow.co.zw'].includes(poll.hostname))fail(502,'Paynow returned an untrusted poll URL.');
      await admin.from('payments').update({status:'PENDING',pollurl:String(result.pollUrl),redirecturl:String(result.redirectUrl),updatedat:new Date().toISOString()}).eq('id',id);
      return {redirectUrl:String(result.redirectUrl),referenceNumber:reference};
    }
    case 'settleJobPayment': {
      const actor=authed(); const jobId=text(input.jobId,80), method=text(input.paymentMethod,20).toUpperCase();
      const {error}=await admin.rpc('settle_job_payment',{p_job_id:jobId,p_actor_id:actor,p_payment_method:method});
      if(error)throw error; return {success:true};
    }
    case 'requestCleanerPayout': {
      const actor=authed(),operationKey=requireKey(input.idempotencyKey),amount=round2(Number(input.amount)),method=text(input.method,20).toUpperCase();
      const accountName=text(input.accountName,100),accountNumber=text(input.accountNumber,120);
      if(accountNumber.length<4)fail(400,'Enter a valid payout destination.');
      const requestHash=await hash(JSON.stringify({amount,method,accountName,accountNumber}));
      const {data:existing,error:existingError}=await admin.from('payoutrequests').select('id,requesthash,status').eq('cleanerid',actor).eq('operationkey',operationKey).maybeSingle();
      if(existingError)throw existingError;
      if(existing){if(existing.requesthash!==requestHash)fail(409,'This payout retry key was already used for different details.');return {success:true,payoutRequestId:existing.id,status:existing.status};}
      await enforceRateLimit(request,actor,'cleaner_payout_request',4,86400);
      const encrypted=await encryptPayoutAccount(accountNumber),last4=accountNumber.slice(-4).replace(/[^A-Za-z0-9]/g,'0');
      const {data,error}=await admin.rpc('request_cleaner_payout_idempotent',{p_cleaner_id:actor,p_amount:amount,p_method:method,p_account_name:accountName,p_ciphertext:encrypted,p_last4:last4,p_operation_key:operationKey,p_request_hash:requestHash});
      if(error)throw error; return {success:true,payoutRequestId:data,status:'PENDING'};
    }
    case 'listPayoutRequests': {
      const actor=authed(); requireRecentMfa(request); await requireAdmin(actor,'finance.read');
      const {data,error}=await admin.from('payoutrequests').select('id,cleanerid,amount,method,accountnumberlast4,status,approvedby,createdat').in('status',['PENDING','APPROVED']).order('createdat',{ascending:true}).limit(100);
      if(error)throw error; return {requests:(data??[]).map(item=>({...item,accountNumberMasked:item.accountnumberlast4?`••••${item.accountnumberlast4}`:'Legacy destination — update required'}))};
    }
    case 'revealPayoutDestination': {
      const actor=authed();requireRecentMfa(request);await requireAdmin(actor,'finance.write');
      const payoutId=text(input.payoutRequestId,80);const {data,error}=await admin.from('payoutrequests').select('accountname,accountnumberciphertext,accountnumberlast4,status,approvedby').eq('id',payoutId).maybeSingle();
      if(error)throw error;if(!data||data.status!=='APPROVED')fail(404,'Approved payout destination not found.');
      if(!data.accountnumberciphertext)fail(409,'This legacy payout has no encrypted destination. Ask the cleaner to submit updated payout details.');
      const {error:auditError}=await admin.from('adminauditevents').insert({action:'payout_destination_view',actorid:actor,targetid:payoutId,reason:'Destination revealed for manual payout',createdat:new Date().toISOString()});if(auditError)throw auditError;
      return {accountName:data.accountname,accountNumber:await decryptPayoutAccount(data.accountnumberciphertext),last4:data.accountnumberlast4};
    }
    case 'settlePayoutRequest': {
      const actor=authed();requireRecentMfa(request); await requireAdmin(actor,'finance.write');
      const decision=text(input.decision,20).toUpperCase();
      const {error}=decision==='APPROVED'
        ?await admin.rpc('approve_cleaner_payout',{p_payout_id:input.payoutRequestId,p_actor_id:actor})
        :decision==='REJECT_PENDING'
          ?await admin.rpc('reject_pending_cleaner_payout',{p_payout_id:input.payoutRequestId,p_actor_id:actor,p_reason:text(input.reason,500),p_idempotency_key:requireKey(input.idempotencyKey)})
        :await admin.rpc('settle_cleaner_payout',{p_payout_id:input.payoutRequestId,p_actor_id:actor,p_decision:decision,p_transfer_reference:text(input.transferReference,120)});
      if(error)throw error; return {success:true,status:input.decision};
    }
    case 'submitRating': {
      const actor=authed(); const jobId=text(input.jobId,80); const rating=Number(input.rating);
      if(!Number.isInteger(rating)||rating<1||rating>5)fail(400,'Rating must be between 1 and 5.');
      const {data,error}=await admin.rpc('submit_booking_rating',{p_actor_id:actor,p_job_id:jobId,p_rating:rating,p_comment:text(input.comment??input.problemDescription,1000)||null});
      if(error)throw error;
      return data;
    }
    case 'reportJobIssue':
    case 'reportNoShow': {
      const actor=authed(); const jobId=text(input.jobId,80), reason=text(input.reason??input.notes,1000);
      await enforceRateLimit(request,actor,'report_booking_issue',8,3600);
      const {data:job}=await admin.from('jobs').select('*').eq('id',jobId).maybeSingle();
      if(!job||![job.customerid,job.cleanerid].includes(actor)||reason.length<3)fail(400,'A booking participant and issue description are required.');
      const id=crypto.randomUUID(); const {error}=await admin.from('supportcases').insert({id,jobid:jobId,customerid:job.customerid,cleanerid:job.cleanerid,reason,status:'OPEN',data:{reporterId:actor,evidence:Array.isArray(input.evidence)?input.evidence.slice(0,5):[]}});
      if(error)throw error;
      const {data:admins,error:adminError}=await admin.from('adminroles').select('userid');
      if(adminError)console.error('support case admin notification lookup failed',adminError.message);
      await Promise.all((admins??[]).map(row=>notify(row.userid,{type:'SUPPORT_CASE',title:'New booking support report',body:`${reason.slice(0,120)}. Booking ${jobId}.`,jobId,supportCaseId:id})));
      await emailSupport(`New booking support report: ${jobId}`,`A booking issue was reported. Case ${id}. Booking ${jobId}. Reporter ${actor}. ${reason}`);
      return {success:true,caseId:id};
    }
    case 'reportEmergency': {
      const actor=authed(),jobId=text(input.jobId,80),description=text(input.description,1000)||'Emergency safety alert';
      await enforceRateLimit(request, actor, 'emergency_report', 3, 600);
      const {data:job}=await admin.from('jobs').select('*').eq('id',jobId).maybeSingle();if(!job||![job.customerid,job.cleanerid].includes(actor)||['COMPLETED','CANCELLED'].includes(job.status))fail(403,'An active booking participant is required to send an emergency alert.');
      const id=crypto.randomUUID();const {error}=await admin.from('supportcases').insert({id,jobid:jobId,customerid:job.customerid,cleanerid:job.cleanerid,reason:description,status:'URGENT',ownerid:null,data:{reporterId:actor,severity:'URGENT',createdAt:new Date().toISOString()}});if(error)throw error;
      const {data:admins}=await admin.from('adminroles').select('userid');await Promise.all((admins??[]).map(row=>notify(row.userid,{type:'EMERGENCY',title:'Emergency alert - immediate review',body:`Urgent report for booking ${jobId}. Open the support queue now.`,jobId,supportCaseId:id})));
      await emailSupport(`Urgent safety report for booking ${jobId}`,`Urgent safety alert submitted from Detail.\nCase: ${id}\nBooking: ${jobId}\nReporter: ${actor}\nDescription: ${description}\nOpen the dashboard support queue for details.`);
      return {success:true,caseId:id};
    }
    case 'createSupportTicket': {
      const actor=authed(),subject=text(input.subject,160),description=text(input.description,3000);if(subject.length<3||description.length<10)fail(400,'Add a subject and at least 10 characters describing the issue.');
      await enforceRateLimit(request, actor, 'support_ticket', 8, 3600);
      const profile=await userRow(actor),id=crypto.randomUUID();const {error}=await admin.from('supportcases').insert({id,customerid:profile.role==='CLEANER'?null:actor,cleanerid:profile.role==='CLEANER'?actor:null,reason:subject,status:'OPEN',data:{description,reporterId:actor,category:text(input.category,40)||'GENERAL',createdAt:new Date().toISOString()}});if(error)throw error;
      const {data:admins}=await admin.from('adminroles').select('userid');await Promise.all((admins??[]).map(row=>notify(row.userid,{type:'SUPPORT_CASE',title:'New support request',body:subject.slice(0,120),supportCaseId:id})));
      await emailSupport(`New Detail support request: ${subject}`,`New support request submitted.\nCase: ${id}\nReporter: ${actor}\nSubject: ${subject}\n\n${description}`);
      return {success:true,caseId:id};
    }
    case 'listMySupportCases': {
      const actor=authed();const {data,error}=await admin.from('supportcases').select('id,jobid,reason,status,createdat,data,ownerid').or(`customerid.eq.${actor},cleanerid.eq.${actor}`).order('createdat',{ascending:false}).limit(50);if(error)throw error;
      return {cases:(data??[]).map((item:Json)=>({id:item.id,jobId:item.jobid,subject:item.reason,status:item.status,createdAt:item.createdat,description:item.data?.description??item.data?.resolution??'',resolution:item.data?.resolution??null}))};
    }
    case 'searchVerifiedCleaners': {
      const actor=authed();
      const search=text(input.search,80).replace(/[^a-zA-Z0-9 -]/g,' ').trim().replace(/\s+/g,' ');
      const category=['HOUSE','CAR'].includes(text(input.category,10).toUpperCase())?text(input.category,10).toUpperCase():'';
      const lat=Number(input.lat),lng=Number(input.lng),radius=Math.min(100,Math.max(1,Number(input.radiusKm)||25));const useNearby=Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
      let query=admin.from('users').select('id,displayname,photourl,servicearea,servicecategories,serviceradiuskm,ratingaverage,ratingcount,jobscompleted,verificationstatus,location').eq('role','CLEANER').eq('verificationstatus','VERIFIED').eq('cleaneragreementaccepted',true).eq('issuspended',false).eq('isbanned',false).limit(250);
      if(search)query=query.or(`displayname.ilike.%${search}%,servicearea.ilike.%${search}%`);
      if(category)query=query.contains('servicecategories',[category]);
      const {data,error}=await query;
      if(error)throw error;
      const candidates=(data??[]).map((row:Json)=>{const point=row.location??{};const cleanerLat=Number(point.lat??point.latitude),cleanerLng=Number(point.lng??point.longitude);let distanceKm:number|null=null;if(useNearby&&Number.isFinite(cleanerLat)&&Number.isFinite(cleanerLng)){const radians=(n:number)=>n*Math.PI/180;const dLat=radians(cleanerLat-lat),dLng=radians(cleanerLng-lng),a=Math.sin(dLat/2)**2+Math.cos(radians(lat))*Math.cos(radians(cleanerLat))*Math.sin(dLng/2)**2;distanceKm=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}return {row,distanceKm};}).filter((item:any)=>!useNearby||(item.distanceKm!==null&&item.distanceKm<=Math.min(radius,Number(item.row.serviceradiuskm)||radius))).sort((a:any,b:any)=>useNearby?(a.distanceKm??99999)-(b.distanceKm??99999):Number(b.row.ratingaverage??0)-Number(a.row.ratingaverage??0)).slice(0,100);
      const profiles=await Promise.all(candidates.map(async ({row,distanceKm}:any)=>{
        const {data:portfolio}=await admin.from('cleanerportfolio').select('imagepath,caption').eq('cleanerid',row.id).order('createdat',{ascending:false}).limit(6);
        const photos=await Promise.all((portfolio??[]).map(async (photo:Json)=>{const {data:signed}=await admin.storage.from('detail-media').createSignedUrl(String(photo.imagepath),3600);return signed?.signedUrl?{url:signed.signedUrl,caption:photo.caption}:null;}));
        const avatar=row.photourl?.startsWith('detail-media/')?await admin.storage.from('detail-media').createSignedUrl(String(row.photourl).slice('detail-media/'.length),3600):null;
        return {uid:row.id,displayName:row.displayname,photoURL:avatar?.data?.signedUrl??row.photourl,portfolio:photos.filter(Boolean),serviceArea:row.servicearea,serviceCategories:row.servicecategories,ratingAverage:row.ratingaverage,ratingCount:row.ratingcount,jobsCompleted:row.jobscompleted,verificationStatus:row.verificationstatus,distanceKm:distanceKm===null?null:Math.round(distanceKm)};
      }));
      return {cleaners:profiles};
    }
    case 'getCleanerPortfolio': {
      const actor=authed(), cleanerId=text(input.cleanerId,80)||actor;
      if(cleanerId!==actor){const {data:profile}=await admin.from('users').select('role,verificationstatus,issuspended,isbanned').eq('id',cleanerId).maybeSingle();if(!profile||profile.role!=='CLEANER'||profile.verificationstatus!=='VERIFIED'||profile.issuspended||profile.isbanned)fail(404,'Cleaner profile is unavailable.');}
      const {data,error}=await admin.from('cleanerportfolio').select('id,imagepath,caption,createdat').eq('cleanerid',cleanerId).order('createdat',{ascending:false}).limit(20);if(error)throw error;
      const photos=await Promise.all((data??[]).map(async (photo:Json)=>{const {data:signed}=await admin.storage.from('detail-media').createSignedUrl(String(photo.imagepath),3600);return {...photo,url:signed?.signedUrl??null};}));
      return {photos};
    }
    case 'getCleanerBookingPreview': {
      const actor=authed(),jobId=text(input.jobId,80),profile=await userRow(actor);
      if(profile.role!=='CLEANER'||profile.verificationstatus!=='VERIFIED'||!profile.cleaneragreementaccepted||!profile.cleaneronboardingcomplete||profile.issuspended||profile.isbanned)fail(403,'Only active, verified cleaners can review open bookings.');
      const {data:openJob,error:openError}=await admin.from('openjobs').select('jobid,status').eq('jobid',jobId).eq('status','PENDING').maybeSingle();
      if(openError)throw openError;if(!openJob)fail(404,'This booking is no longer accepting quotes.');
      const {data:job,error}=await admin.from('jobs').select('id,category,servicetype,checklist,location,scheduledtime,scheduleddatetime,timepreference,bookingmode,budget,biddingexpiresat,estimatedduration,suppliesrequired,suppliesfee,createdat,status').eq('id',openJob.jobid).maybeSingle();
      if(error)throw error;if(!job||job.status!=='PENDING')fail(404,'This booking is no longer accepting quotes.');
      const source=(job.checklist&&typeof job.checklist==='object'?job.checklist:{}) as Json;
      const strings=(value:unknown,max=12)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string').slice(0,max).map(item=>text(item,60)):[];
      const count=(value:unknown)=>Number.isFinite(Number(value))&&Number(value)>0?Math.min(10000,Number(value)):undefined;
      const category=job.category==='CAR'?'CAR':'HOUSE';
      const checklist:Json=category==='HOUSE'?{
        category:'HOUSE',packageId:text(source.packageId,80),areas:strings(source.areas),cleaningTypes:strings(source.cleaningTypes),condition:['LIGHT','MODERATE','HEAVY'].includes(String(source.condition))?source.condition:undefined,addOns:strings(source.addOns),propertySizeSqm:count(source.propertySizeSqm),storiesCount:count(source.storiesCount),roomsCount:count(source.roomsCount),bathroomsCount:count(source.bathroomsCount),
      }:{
        category:'CAR',packageId:text(source.packageId,80),vehicleType:text(source.vehicleType,40),cleaningTypes:strings(source.cleaningTypes),condition:['CLEAN','AVERAGE','VERY_DIRTY'].includes(String(source.condition))?source.condition:undefined,exteriorServices:strings(source.exteriorServices),interiorServices:strings(source.interiorServices),deepServices:strings(source.deepServices),
      };
      const location=(job.location&&typeof job.location==='object'?job.location:{}) as Json;
      const lat=Number(location.lat),lng=Number(location.lng);
      return {id:job.id,customerId:'',category,serviceType:text(job.servicetype,120),checklist,description:'',location:{lat:Number.isFinite(lat)?Math.round(lat*100)/100:0,lng:Number.isFinite(lng)?Math.round(lng*100)/100:0,address:'Approximate area'},scheduledTime:job.scheduledtime,timePreference:job.timepreference,scheduledDateTime:job.scheduleddatetime,bookingMode:job.bookingmode,budget:job.budget,biddingExpiresAt:job.biddingexpiresat,estimatedDuration:job.estimatedduration,suppliesRequired:job.suppliesrequired,suppliesFee:job.suppliesfee,createdAt:job.createdat,status:job.status,photos:[],completionPhotos:[]};
    }
    case 'addCleanerPortfolioPhoto': {
      const actor=authed(), path=text(input.imagePath,500);const profile=await userRow(actor);
      if(profile.role!=='CLEANER'||profile.verificationstatus!=='VERIFIED'||profile.issuspended||profile.isbanned)fail(403,'Only an active verified cleaner can publish portfolio photos.');
      if(!path.startsWith(`detail-media/cleaner-portfolio/${actor}/`))fail(400,'Upload the photo to your private portfolio folder first.');
      const {data:existing}=await admin.from('cleanerportfolio').select('id').eq('cleanerid',actor);if((existing?.length??0)>=12)fail(409,'Portfolio limit reached. Remove a photo before adding another.');
      const {data,error}=await admin.from('cleanerportfolio').insert({cleanerid:actor,imagepath:path.slice('detail-media/'.length),caption:text(input.caption,240)}).select('id').single();if(error)throw error;return {id:data.id};
    }
    case 'removeCleanerPortfolioPhoto': {
      const actor=authed(), photoId=text(input.photoId,80);const {data:photo}=await admin.from('cleanerportfolio').select('imagepath').eq('id',photoId).eq('cleanerid',actor).maybeSingle();if(!photo)fail(404,'Portfolio photo not found.');
      const {error}=await admin.from('cleanerportfolio').delete().eq('id',photoId).eq('cleanerid',actor);if(error)throw error;
      const {error:storageError}=await admin.storage.from('detail-media').remove([photo.imagepath]);if(storageError)console.error('portfolio object cleanup failed',storageError.message);return {success:true};
    }
    case 'registerOrganization': {
      const actor=authed(); await requireActiveMarketplaceAccount(actor); const name=text(input.name,160);
      if(name.length<2)fail(400,'Organization name is required.');
      const registrationNumber=text(input.registrationNumber,100), phone=text(input.phone,40), country=text(input.country,80), city=text(input.city,100);
      if(!registrationNumber||!phone||!country||!city)fail(400,'Complete the organization registration details.');
      const {data,error}=await admin.rpc('register_organization_secure',{p_owner_id:actor,p_name:name,p_registration_number:registrationNumber,p_phone:phone,p_country:country,p_city:city});
      if(error)throw error;
      return {organizationId:data};
    }
    case 'createOrganizationCleanerInvite': {
      const actor=authed(); await requireActiveMarketplaceAccount(actor); const email=text(input.email ?? input.cleanerEmail,254).toLowerCase();
      const {data:org}=await admin.from('organizations').select('id').eq('ownerid',actor).maybeSingle();
      if(!org||!email.includes('@'))fail(400,'Register an organization and enter a valid cleaner email.');
      const code=crypto.randomUUID().replaceAll('-','').slice(0,18).toUpperCase(), codeHash=await hash(code);
      const {error}=await admin.from('organizationinvites').insert({organizationid:org.id,email,cleanername:text(input.cleanerName,120),codehash:codeHash,createdby:actor,expiresat:new Date(Date.now()+7*86400000).toISOString()});
      if(error)throw error; return {code};
    }
    case 'joinOrganization': {
      const actor=authed(); await requireActiveMarketplaceAccount(actor); const code=text(input.code,80).toUpperCase(); const codeHash=await hash(code);
      const {data,error}=await admin.rpc('join_organization_secure',{p_user_id:actor,p_email:String(user?.email??'').toLowerCase(),p_code_hash:codeHash});
      if(error)throw error;
      if(!data)fail(403,'This invitation is invalid, expired, or belongs to another email.');
      return {success:true};
    }
    case 'removeOrganizationCleaner': {
      const actor=authed(),memberId=text(input.memberId,80);const {data:organization}=await admin.from('organizations').select('id').eq('ownerid',actor).maybeSingle();
      if(!organization)fail(403,'Only the organization owner can manage its team.');
      const {data:member}=await admin.from('organizationmembers').select('userid').eq('id',memberId).eq('organizationid',organization.id).maybeSingle();
      if(!member)fail(404,'Organization member was not found.');
      const {error}=await admin.from('organizationmembers').delete().eq('id',memberId).eq('organizationid',organization.id);if(error)throw error;
      await admin.from('users').update({organizationid:null,updatedat:new Date().toISOString()}).eq('id',member.userid).eq('organizationid',organization.id);
      return {success:true};
    }
    case 'deleteAccount': {
      const actor=authed();
      if(input.confirmation!=='DELETE')fail(400,'Type DELETE to confirm.');
      const lastSignInAt=Date.parse(String(user?.last_sign_in_at??'')),signInAge=Date.now()-lastSignInAt;
      if(!Number.isFinite(lastSignInAt)||signInAge<0||signInAge>5*60*1000)fail(409,'RECENT_LOGIN_REQUIRED');
      const [profileResult,payoutResult,bookingResult]=await Promise.all([admin.from('users').select('balance,earningsbalance,commissionbalance,commissionowed,walletrestricted').eq('id',actor).single(),admin.from('payoutrequests').select('id').eq('cleanerid',actor).in('status',['PENDING','APPROVED']).limit(1).maybeSingle(),admin.from('jobs').select('id').or(`customerid.eq.${actor},cleanerid.eq.${actor}`)]);
      if(profileResult.error)throw profileResult.error;if(payoutResult.error)throw payoutResult.error;if(bookingResult.error)throw bookingResult.error;
      const profile=profileResult.data,pendingPayout=payoutResult.data,bookings=bookingResult.data;
      if(Number(profile?.balance??0)>0||Number(profile?.earningsbalance??0)>0||Number(profile?.commissionbalance??0)>0||Number(profile?.commissionowed??0)>0||profile?.walletrestricted||pendingPayout)fail(409,'Settle all wallet balances, commission and pending payouts before deleting the account.');
      const {error}=await admin.rpc('close_account',{p_user_id:actor}); if(error)throw error;
      const prefixes=[`profile-photos/${actor}`,`verification/${actor}`,`job-photos/${actor}`,`cleaner-portfolio/${actor}`,...(bookings??[]).flatMap((booking:Json)=>[`job-completion/${booking.id}/${actor}`,`chat-photos/${booking.id}/${actor}`])];
      const storage=admin.storage.from('detail-media');
      for(const prefix of prefixes){
        const paths:string[]=[];
        for(let offset=0;offset<10000;offset+=1000){
          const {data:objects,error:listError}=await storage.list(prefix,{limit:1000,offset});if(listError)throw new ApiError(503,'Could not remove private media. Retry account deletion.');
          const files=(objects??[]).filter(item=>item.id).map(item=>`${prefix}/${item.name}`);paths.push(...files);if((objects??[]).length<1000)break;
        }
        for(let index=0;index<paths.length;index+=100){const {error:removeError}=await storage.remove(paths.slice(index,index+100));if(removeError)throw new ApiError(503,'Could not remove private media. Retry account deletion.');}
      }
      // Soft deletion anonymizes Auth while preserving UUID references held by
      // retained bookings, support cases, payouts and accounting records.
      const {error:deleteError}=await admin.auth.admin.deleteUser(actor,true); if(deleteError)throw deleteError;
      return {success:true};
    }
    case 'joinWaitlist': {
      if(text(input.website,200)) return {success:true};
      const {data:betaConfig,error:betaConfigError}=await admin.from('configuration').select('value').eq('key','beta').maybeSingle();
      if(betaConfigError)throw betaConfigError;
      if(betaConfig?.value?.waitlistEnabled===false)fail(503,'The waitlist is temporarily closed. Please try again later.');
      if(input.privacyAccepted!==true)fail(400,'Accept the privacy notice to join the waitlist.');
      const email=text(input.email,254).toLowerCase(); const fullName=text(input.fullName,120); const token=text(input.turnstileToken,4000);
      if(!email.includes('@')||fullName.length<2||text(input.phone,40).length<7)fail(400,'Enter your name, email and phone number.');
      const turnstileSecret=Deno.env.get('TURNSTILE_SECRET');
      if(!turnstileSecret)fail(503,'Waitlist security is not configured.');
      if(!token)fail(400,'Complete the security check.');
      const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:turnstileSecret,response:token})});const verdict=await response.json();if(!verdict.success)fail(400,'Security check failed. Please try again.');
      await enforceRateLimit(request,`waitlist:${await hash(email)}`,'waitlist_signup',3,3600);
      const consent=input.marketingEmailPermission==='YES'; const unsubscribeToken=crypto.randomUUID()+crypto.randomUUID();
      const {data:created,error}=await admin.rpc('register_waitlist_entry',{p_email:email,p_full_name:fullName,p_phone:text(input.phone,40),p_country:text(input.country,80),p_city:text(input.city,100),p_area:text(input.area,120),p_participant_type:text(input.participantType,30),p_service_interest:text(input.serviceInterest,30),p_preferred_language:text(input.preferredLanguage,40),p_marketing_consent:consent,p_unsubscribe_token:unsubscribeToken,p_data:{campaign:input.campaign??{}}});
      if(error)throw error;
      // A repeated public signup must not overwrite contact/consent data or send
      // a confirmation email using details supplied by an unverified caller.
      if(created!==true)return {success:true};
      const apiKey=secret('RESEND_API_KEY','EXPO_RESEND_API_KEY');
      if(apiKey)await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({from:'Detail <hello@detailapp.co.zw>',to:[email],reply_to:'support@detailapp.co.zw',subject:'Your place on the Detail list',html:`<p>Hi ${fullName.replace(/[<>&"']/g,'')},</p><p>Thanks for joining the Detail waitlist.</p><p>— The Detail team</p>`})});
      return {success:true};
    }
    case 'adminOverview': {
      const actor=authed(); await requireAdmin(actor);
      const period=['7d','30d','12m'].includes(input.period)?input.period:'30d';
      const start=new Date(Date.now()-(period==='7d'?7:period==='12m'?365:30)*86400000).toISOString();
      const {data,error}=await admin.rpc('admin_marketplace_metrics',{p_start:start});if(error)throw error;
      const metrics=[{label:'Bookings today',value:Number(data.bookingsToday??0)},{label:'Upcoming bookings',value:Number(data.upcomingBookings??0)},{label:'Completed jobs',value:Number(data.completedJobs??0)},{label:'Cancelled jobs',value:Number(data.cancelledJobs??0)},{label:'Revenue',value:Math.round(Number(data.revenue??0)*100),format:'money'},{label:'Active cleaners',value:Number(data.activeCleaners??0)},{label:'Pending payments',value:Number(data.pendingPayments??0)}];
      return {asOf:new Date().toISOString(),timezone:'Africa/Harare',currency:'USD',metrics,revenue:data.revenueSeries??[],attention:data.attention??[]};
    }
    case 'adminQuery': {
      const module=text(input.module,40);
      const readPermissions:Record<string,string>={bookings:'bookings.manage',customers:'users.manage',cleaners:'users.manage',payments:'finance.read',support:'support.manage',products:'finance.read',analytics:'finance.read',waitlist:'marketing.read'};
      const actor=authed(); await requireAdmin(actor,readPermissions[module]);
      if(module==='settings'){
        const [{data:operations,error:operationsError},{data:beta,error:betaError}]=await Promise.all([
          admin.from('configuration').select('value').eq('key','operations').maybeSingle(),
          admin.from('configuration').select('value').eq('key','beta').maybeSingle(),
        ]);
        if(operationsError)throw operationsError;if(betaError)throw betaError;
        return {...(operations?.value??{switches:{},supportCopy:''}),bookingEnabled:beta?.value?.bookingEnabled===true};
      }
      const table:Record<string,string>={bookings:'jobs',customers:'users',cleaners:'users',payments:'payments',products:'productsales',analytics:'reportingaggregates',support:'supportcases',waitlist:'betawaitlist'};
      const target=table[module]; if(!target)fail(400,'Unknown dashboard module.');
      const pageSize=Math.min(100,Math.max(1,Number(input.pageSize??25)));
      let q=admin.from(target).select('*').order('createdat',{ascending:false}).order('id',{ascending:false}).limit(pageSize+1);
      if(module==='customers')q=q.eq('role','CUSTOMER'); if(module==='cleaners')q=q.eq('role','CLEANER');
      const filters=input.filters&&typeof input.filters==='object'?input.filters as Json:{};
      const status=text(filters.Status,30).toUpperCase();
      const allowedStatuses:Record<string,string[]>={bookings:['PENDING','CONFIRMED','ASSIGNED','EN_ROUTE','IN_PROGRESS','COMPLETED','CANCELLED'],cleaners:['AVAILABLE','BUSY','OFFLINE'],payments:['INITIATING','PENDING','CAPTURED','AUTHORIZED','ESCROWED','DELIVERED','PAID','DISPUTED','FAILED','REFUNDED'],products:['PENDING','PAID','CANCELLED'],support:['OPEN','URGENT','IN_PROGRESS','RESOLVED','CLOSED'],waitlist:['PENDING','CONFIRMED','UNSUBSCRIBED']};
      if(status&&allowedStatuses[module]?.includes(status))q=q.eq('status',status);
      const service=text(filters.Service,60).toUpperCase();if(service==='HOUSE'||service==='CAR'){if(module==='bookings')q=q.eq('category',service);else if(module==='cleaners')q=q.contains('servicecategories',[service]);}
      const verification=text(filters.Verification,30).toUpperCase();if(verification&&module==='cleaners')q=q.eq('verificationstatus',verification);
      const cleanerState=text(filters.Status,30).toUpperCase();if(cleanerState&&module==='cleaners'&&['AVAILABLE','BUSY','OFFLINE'].includes(cleanerState))q=q.eq('status',cleanerState);
      const accountState=text(filters['Account state'],30).toUpperCase();if(accountState==='SUSPENDED'&&module==='customers')q=q.or('isbanned.eq.true,issuspended.eq.true');else if(accountState==='ACTIVE'&&module==='customers')q=q.eq('isbanned',false).eq('issuspended',false);
      const paymentType=text(filters.Type,30).toUpperCase();if(paymentType&&module==='payments')q=q.eq('provider',paymentType);
      const coverage=text(filters.Coverage,100).replace(/[%,()]/g,' ').trim();if(coverage&&module==='cleaners')q=q.ilike('servicearea',`%${coverage}%`);
      const owner=text(filters.Owner,80);if(owner&&module==='support'&&/^[0-9a-f-]{36}$/i.test(owner))q=q.eq('ownerid',owner);
      const reason=text(filters.Reason,100).replace(/[%,()]/g,' ').trim();if(reason&&module==='support')q=q.ilike('reason',`%${reason}%`);
      const cleaner=text(filters.Cleaner,80);if(cleaner&&module==='products'&&/^[0-9a-f-]{36}$/i.test(cleaner))q=q.eq('cleanerid',cleaner);
      const product=text(filters.Product,80);if(product&&module==='products')q=q.eq('productid',product);
      const period=text(filters.Period,10).toUpperCase();if(period&&module==='analytics'&&['7D','30D','12M'].includes(period))q=q.eq('period',period);
      const dateRange=text(filters.Date,10).toUpperCase();const days=dateRange==='TODAY'?1:dateRange==='7D'?7:dateRange==='30D'?30:0;if(days)q=q.gte('createdat',new Date(Date.now()-days*86400000).toISOString());
      const cursor=text(input.cursor,120); if(cursor){if(!/^[A-Za-z0-9_-]{1,120}$/.test(cursor))fail(400,'Invalid page cursor.');const {data:prior}=await admin.from(target).select('createdat').eq('id',cursor).maybeSingle();if(prior?.createdat)q=q.or(`createdat.lt.${prior.createdat},and(createdat.eq.${prior.createdat},id.lt.${cursor})`);}
      if(input.search){const clean=text(input.search,100).replace(/[%,()]/g,' ').replace(/\s+/g,' ').trim();const term=`%${clean}%`;if(module==='waitlist')q=q.or(`email.ilike.${term},fullname.ilike.${term},phone.ilike.${term}`);else if(module==='customers'||module==='cleaners')q=q.or(`email.ilike.${term},displayname.ilike.${term},phone.ilike.${term}`);else if(module==='bookings')q=q.or(`id.ilike.${term},customername.ilike.${term},cleanername.ilike.${term}`);else if(module==='support')q=q.or(`id.ilike.${term},reason.ilike.${term}`);else if(module==='payments')q=q.or(`id.ilike.${term},reference.ilike.${term}`);}
      const {data,error}=await q; if(error)throw error;
      const page=(data??[]).slice(0,pageSize);
      const paymentRefunds=new Map<string,{confirmed:number;latest?:Json}>();
      if(module==='payments'&&page.length){const ids=page.map((row:Json)=>row.id);const {data:refundRows,error:refundError}=await admin.from('paynowrefundtransactions').select('paymentid,amount,status,providerreference,createdat').in('paymentid',ids).order('createdat',{ascending:false});if(refundError)throw refundError;for(const refund of refundRows??[]){const entry=paymentRefunds.get(refund.paymentid)??{confirmed:0};if(refund.status==='CONFIRMED')entry.confirmed+=Number(refund.amount)||0;if(!entry.latest)entry.latest=refund;paymentRefunds.set(refund.paymentid,entry);}}
      const supportContext=new Map<string,Json>();
      if(module==='support'&&page.length){
        const profileIds=[...new Set(page.flatMap((row:Json)=>[row.customerid,row.cleanerid,row.ownerid,row.data?.reporterId,...(Array.isArray(row.data?.assignmentHistory)?row.data.assignmentHistory.map((entry:Json)=>entry.assignee):[])]).filter((id:unknown):id is string=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)))];
        const jobIds=[...new Set(page.map((row:Json)=>row.jobid).filter((id:unknown):id is string=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)))];
        let profiles:Json[]=[];let jobs:Json[]=[];
        if(profileIds.length){const result=await admin.from('users').select('id,displayname,email,phone').in('id',profileIds);if(result.error)throw result.error;profiles=result.data??[];}
        if(jobIds.length){const result=await admin.from('jobs').select('id,status,paymentstatus,paymentmethod,scheduleddatetime').in('id',jobIds);if(result.error)throw result.error;jobs=result.data??[];}
        const profileMap=new Map(profiles.map(profile=>[profile.id,profile]));const jobMap=new Map(jobs.map(job=>[job.id,job]));
        for(const row of page){
          const customer=profileMap.get(row.customerid),cleanerProfile=profileMap.get(row.cleanerid),reporter=profileMap.get(row.data?.reporterId),job=jobMap.get(row.jobid);
          supportContext.set(row.id,{customer,cleaner:cleanerProfile,reporter,job});
        }
      }
      const rows=page.map((row:Json)=>{
        if(module==='waitlist')return {id:row.id,participantType:row.participanttype,fullName:row.fullname,email:row.email,phone:row.phone,country:row.country,city:row.city,area:row.area,preferredLanguage:row.preferredlanguage,serviceInterest:row.serviceinterest,marketingEmailPermission:row.marketingemailpermission,status:row.status,createdAt:row.createdat};
        if(module==='customers')return {id:row.id,createdAt:row.createdat,Customer:row.displayname??'Customer',Contact:[row.email,row.phone].filter(Boolean).join(' · '),State:row.isbanned?'SUSPENDED':row.issuspended?'SUSPENDED':'ACTIVE',Bookings:row.jobscompleted??0,'Total spend':'—',Upcoming:'—'};
        if(module==='cleaners')return {id:row.id,createdAt:row.createdat,Cleaner:row.displayname??'Cleaner',Verification:row.verificationstatus??'PENDING',Coverage:row.servicearea??'—',Availability:row.status??'OFFLINE',Assignments:row.jobscompleted??0,Rating:row.ratingaverage??0,Earnings:'Restricted'};
        if(module==='payments'){const refund=paymentRefunds.get(row.id);return {id:row.id,createdAt:row.createdat,Payment:row.reference??row.id,Booking:row.jobid??'—',Customer:row.customerid??'—',Captured:['ESCROWED','DELIVERED','PAID','DISPUTED','REFUNDED'].includes(row.status)?row.amount:0,Refunded:refund?refund.confirmed:Number(row.data?.refundSummary?.confirmedAmount??0),'Refund request':refund?.latest?`${Number(refund.latest.amount).toFixed(2)} ${refund.latest.status}`:'—','Processor ref':row.reference??'—',Status:row.status};}
        if(module==='bookings')return {id:row.id,createdAt:row.createdat,Booking:row.id,Customer:row.customername??row.customerid??'—',Cleaner:row.cleanername??row.cleanerid??'—',Service:row.servicetype??row.category??'—',Scheduled:row.scheduleddatetime??row.scheduledtime??'—',Status:row.status,Payment:row.paymentstatus??row.paymentmethod??'—'};
        if(module==='support'){
          const context=supportContext.get(row.id)??{},customer=context.customer??{},cleanerProfile=context.cleaner??{},reporter=context.reporter??{},job=context.job??{};
          return {id:row.id,createdAt:row.createdat,Case:row.id,Booking:row.jobid??'General support',Reason:row.reason??'Support request',Opened:row.createdat,Owner:row.ownerid?(profileMap.get(row.ownerid)?.displayname??row.ownerid):'Unassigned',Status:row.status,
            reporterName:reporter.displayname??'Unknown reporter',reporterContact:[reporter.email,reporter.phone].filter(Boolean).join(' · '),
            customerName:customer.displayname??'—',customerContact:[customer.email,customer.phone].filter(Boolean).join(' · '),
            cleanerName:cleanerProfile.displayname??'—',cleanerContact:[cleanerProfile.email,cleanerProfile.phone].filter(Boolean).join(' · '),
            category:row.data?.category??row.data?.type??'GENERAL',description:row.data?.description??row.reason??'',
            bookingStatus:job.status??'—',paymentStatus:job.paymentstatus??'—',paymentMethod:job.paymentmethod??'—',scheduledAt:job.scheduleddatetime??null,
            evidenceCount:Array.isArray(row.data?.evidence)?row.data.evidence.length:0,
            assignmentHistory:Array.isArray(row.data?.assignmentHistory)?row.data.assignmentHistory.slice(-20).map((entry:Json)=>({assignee:profileMap.get(entry.assignee)?.displayname??entry.assignee,assignedAt:entry.assignedAt,reason:entry.reason})):[],
            data:{type:row.data?.type,severity:row.data?.severity}};
        }
        // Never return push credentials, exact coordinates, or arbitrary profile metadata.
        if(module==='customers'||module==='cleaners')return {id:row.id,createdAt:row.createdat};
        return {...row,id:row.id,createdAt:row.createdat};
      });
      return {rows,nextCursor:(data?.length??0)>pageSize?rows.at(-1)?.id??null:null};
    }
    case 'adminWaitlistQuery': {
      const actor=authed(); await requireAdmin(actor,'marketing.read');
      const cursor=text(input.cursor,100); let q=admin.from('betawaitlist').select('*').order('createdat',{ascending:false}).limit(51);
      if(cursor){const {data:prior}=await admin.from('betawaitlist').select('createdat').eq('id',cursor).maybeSingle();if(prior?.createdat)q=q.lt('createdat',prior.createdat);}
      const {data,error}=await q;if(error)throw error;const rows=(data??[]).slice(0,50).map((r:Json)=>({id:r.id,participantType:r.participanttype,fullName:r.fullname,phone:r.phone,email:r.email,country:r.country,city:r.city,area:r.area,preferredLanguage:r.preferredlanguage,serviceInterest:r.serviceinterest,marketingEmailPermission:r.marketingemailpermission,status:r.status,createdAt:r.createdat}));
      return {rows,nextCursor:(data?.length??0)>50?rows.at(-1)?.id??null:null};
    }
    case 'adminMutation': {
      const actor=authed(); const action=text(input.action,80); const key=requireKey(input.idempotencyKey); const reason=text(input.reason,500); const targetId=text(input.targetId,120);
      requireRecentMfa(request);
      const supportedActions=new Set(['update_kill_switch','deactivate_cleaner','suspend_cleaner','change_account_state','resolve_case','assign_support_case','reschedule_booking','reassign_booking','assign_cleaner','cancel_booking','request_refund','record_refund_update','full_refund','partial_refund']);
      if(!supportedActions.has(action))fail(400,`Admin action "${action}" is not supported.`);
      const {data:alreadyApplied}=await admin.from('adminauditevents').select('id,action,targetid').eq('id',key).maybeSingle();
      if(alreadyApplied){if(alreadyApplied.action!==action||alreadyApplied.targetid!==(targetId||null))fail(409,'This idempotency key was already used for a different admin action.');return {ok:true,auditId:key};}
      const permission = action.includes('refund') ? 'finance.write' : action.includes('booking') || action.includes('reschedule') || action.includes('assign') ? 'bookings.manage' : action.includes('cleaner') || action.includes('account') ? 'users.manage' : action.includes('support') || action.includes('case') ? 'support.manage' : undefined;
      await requireAdmin(actor,permission,action==='update_kill_switch');
      if(reason.length<4)fail(400,'A meaningful reason is required.');
      if(!targetId && action!=='update_kill_switch')fail(400,'Select a specific record before applying this action.');
      const now=new Date().toISOString();
      if(action==='update_kill_switch'){
        const keyName=text(input.key,40);if(!['maintenance','bookingCreation','bidAcceptance','payments','supportCopy','bookingLaunch'].includes(keyName))fail(400,'Unknown setting.');
        if(keyName==='bookingLaunch'){
          const {data:current,error:readError}=await admin.from('configuration').select('value').eq('key','beta').maybeSingle();if(readError)throw readError;
          const value={...(current?.value??{}),bookingEnabled:input.value===true};
          const {error:updateError}=await admin.from('configuration').upsert({key:'beta',value,updatedby:actor,updatedat:now});if(updateError)throw updateError;
        }else{
          const {data:current,error:readError}=await admin.from('configuration').select('value').eq('key','operations').maybeSingle();if(readError)throw readError;
          const value=current?.value??{switches:{},supportCopy:''};
          if(keyName==='supportCopy')value.supportCopy=text(input.value,2000);else value.switches={...(value.switches??{}),[keyName]:input.value===true};
          const {error:updateError}=await admin.from('configuration').upsert({key:'operations',value,updatedby:actor,updatedat:now});if(updateError)throw updateError;
        }
      } else if(action==='deactivate_cleaner' || action==='suspend_cleaner' || action==='change_account_state') {
        const userId=targetId;
        const state=input.state==='ACTIVE'?'ACTIVE':'SUSPENDED';
        const {data:profile,error}=await admin.from('users').select('role').eq('id',userId).maybeSingle();
        if(error)throw error;if(!profile)fail(404,'User account not found.');
        if(profile.role==='CLEANER' && action!=='change_account_state') {
          const {error:updateError}=await admin.from('users').update({issuspended:true,status:'OFFLINE',updatedat:now}).eq('id',userId);if(updateError)throw updateError;
        } else { const {error:updateError}=await admin.from('users').update({isbanned:state==='SUSPENDED',updatedat:now}).eq('id',userId);if(updateError)throw updateError;const {error:authError}=await admin.auth.admin.updateUserById(userId,{ban_duration:state==='SUSPENDED'?'876000h':'none'});if(authError)throw authError; }
      } else if(action==='resolve_case' || action==='assign_support_case') {
        const {data:record,error}=await admin.from('supportcases').select('data,jobid,status').eq('id',targetId).maybeSingle();if(error)throw error;if(!record)fail(404,'Support case not found.');
        if(action==='assign_support_case'&&['RESOLVED','CLOSED'].includes(record.status))fail(409,'A closed support case cannot be assigned.');
        let settlementDecision='';
        let patchData={...(record.data??{})};
        if(action==='assign_support_case'){
          const history=Array.isArray(record.data?.assignmentHistory)?record.data.assignmentHistory:[];
          patchData={...patchData,assignmentHistory:[...history.slice(-19),{assignee:actor,assignedAt:now,reason}]};
        }else{
          patchData={...patchData,resolution:text(input.resolution,2000)||reason,resolvedBy:actor,resolvedAt:now};
        }
        if(action==='resolve_case'&&record.data?.type==='COMPLETION_DISPUTE'){
          settlementDecision=text(input.settlementDecision,40).toUpperCase();
          if(!['RELEASE_EARNINGS','HOLD_FOR_REFUND'].includes(settlementDecision))fail(400,'Choose whether to release the cleaner earnings or keep them held for refund review.');
          patchData.settlementDecision=settlementDecision;
        }
        const {error:updateError}=await admin.from('supportcases').update({status:action==='resolve_case'?'RESOLVED':'IN_PROGRESS',ownerid:actor,data:patchData}).eq('id',targetId);if(updateError)throw updateError;
        if(settlementDecision==='RELEASE_EARNINGS'&&record.jobid){const {error:releaseError}=await admin.rpc('release_paynow_earnings',{p_job_id:record.jobid});if(releaseError)throw releaseError;}
        if(action==='resolve_case'){
          const {data:caseParties}=await admin.from('supportcases').select('customerid,cleanerid,jobid').eq('id',targetId).maybeSingle();
          const recipients=[...new Set([caseParties?.customerid,caseParties?.cleanerid].filter((id):id is string=>typeof id==='string'&&id!==actor))];
          await Promise.all(recipients.map(userId=>notify(userId,{type:'SUPPORT_CASE_RESOLVED',title:'Support updated your case',body:'The support team reviewed your case. Open Support in Detail to see the latest status.',jobId:caseParties?.jobid,supportCaseId:targetId})));
        }
      } else if(action==='reschedule_booking') {
        const scheduled=text(input.scheduledDateTime,80), parsed=Date.parse(scheduled);if(!Number.isFinite(parsed)||parsed<=Date.now())fail(400,'Choose a future booking date and time.');
        const {data:job,error}=await admin.from('jobs').select('status,customerid,cleanerid').eq('id',targetId).maybeSingle();if(error)throw error;if(!job||['COMPLETED','CANCELLED'].includes(job.status))fail(409,'This booking cannot be rescheduled.');
        const {error:updateError}=await admin.from('jobs').update({scheduleddatetime:new Date(parsed).toISOString(),updatedat:now}).eq('id',targetId);if(updateError)throw updateError;
      await admin.from('jobevents').upsert({jobid:targetId,actorid:actor,actorrole:'ADMIN',type:'RESCHEDULED',idempotencykey:key,reason,data:{scheduledDateTime:new Date(parsed).toISOString()}},{onConflict:'jobid,idempotencykey',ignoreDuplicates:true});
        if(job.customerid)await notify(job.customerid,{type:'RESCHEDULED',title:'Booking rescheduled',body:'Your booking time has changed. Open Detail to review the new schedule.',jobId:targetId});
        if(job.cleanerid)await notify(job.cleanerid,{type:'RESCHEDULED',title:'Booking rescheduled',body:'Your booking time has changed. Open Detail to review the new schedule.',jobId:targetId});
      } else if(action==='reassign_booking' || action==='assign_cleaner') {
        const cleanerId=text(input.cleanerId,80);if(!cleanerId)fail(400,'Enter the cleaner account ID to assign.');
        const {error}=await admin.rpc('admin_reassign_booking',{p_job_id:targetId,p_actor_id:actor,p_cleaner_id:cleanerId,p_reason:reason,p_idempotency_key:key});if(error)throw error;
        await notify(cleanerId,{type:'ASSIGNED',title:'New booking assigned',body:'A booking has been assigned to you. Open Detail to review the details.',jobId:targetId});
      } else if(action==='cancel_booking') {
        const {data:job,error}=await admin.from('jobs').select('*').eq('id',targetId).maybeSingle();if(error)throw error;if(!job)fail(404,'Booking not found.');
        if(['COMPLETED','CANCELLED'].includes(job.status))fail(409,'This booking is already closed.');
        const {data:cancellation,error:cancelError}=await admin.rpc('admin_cancel_booking',{p_job_id:targetId,p_actor_id:actor,p_reason:reason,p_idempotency_key:key});if(cancelError)throw cancelError;
        if(cancellation?.status==='PAYNOW_MANUAL_REVIEW')await admin.from('supportcases').upsert({id:`cancel_${key}`,jobid:targetId,customerid:job.customerid,cleanerid:job.cleanerid,reason:'Paynow refund review required: '+reason,status:'OPEN',data:{refundReview:true,paymentStatus:job.paymentstatus,createdBy:actor}},{onConflict:'id'});
        if(job.customerid)await notify(job.customerid,{type:'CANCELLED',title:'Booking cancelled',body:cancellation?.status==='PAYNOW_MANUAL_REVIEW'?'The booking is cancelled. Support will review the Paynow payment.':'The booking has been cancelled.',jobId:targetId});
      } else if(action==='request_refund' || action==='full_refund' || action==='partial_refund') {
        const amount=round2(Number(input.amount));if(!Number.isFinite(amount)||amount<=0)fail(400,'Enter a positive refund amount.');
        const {data:payment,error}=await admin.from('payments').select('*').eq('id',targetId).maybeSingle();if(error)throw error;if(!payment)fail(404,'Payment not found.');
        if(payment.provider!=='PAYNOW')fail(409,'This workflow records Paynow refund requests. Wallet and direct-payment adjustments must use their matching settlement process.');
        const {error:refundError}=await admin.rpc('request_paynow_refund',{p_payment_id:targetId,p_actor_id:actor,p_amount:amount,p_reason:reason,p_idempotency_key:key});if(refundError)throw refundError;
        if(payment.jobid){const {error:caseError}=await admin.from('supportcases').upsert({id:`refund_${key}`,jobid:payment.jobid,customerid:payment.customerid,cleanerid:payment.cleanerid,reason:`Manual Paynow refund of $${amount.toFixed(2)} requested: ${reason}`,status:'OPEN',data:{paymentId:payment.id,refundAmount:amount,refundStatus:'REQUESTED',createdBy:actor}},{onConflict:'id'});if(caseError)throw caseError;}
      } else if(action==='record_refund_update') {
        const status=text(input.refundStatus,40).toUpperCase();
        const {error:updateError}=await admin.rpc('record_paynow_refund_update',{p_payment_id:targetId,p_actor_id:actor,p_status:status,p_amount:Number(input.amount)||0,p_provider_reference:text(input.providerReference,120),p_reason:reason,p_idempotency_key:key});if(updateError)throw updateError;
      }
      const {error}=await admin.from('adminauditevents').upsert({id:key,action,actorid:actor,targetid:targetId||null,reason,data:input,createdat:now},{onConflict:'id',ignoreDuplicates:true});if(error)throw error;
      return {ok:true,auditId:key};
    }
    case 'adminSendMarketingCampaign': {
      const actor=authed();await requireAdmin(actor,'marketing.send');
      await enforceRateLimit(request,actor,'marketing_campaign_send',3,3600);
      const subject=text(input.subject,140), message=text(input.message,5000), apiKey=secret('RESEND_API_KEY','EXPO_RESEND_API_KEY');
      if(!subject||!message||!apiKey)fail(503,'Campaign email is not configured.');
      const id=requireKey(input.idempotencyKey);
      const {data:existing,error:existingError}=await admin.from('marketingcampaigns').select('createdby,subject,message,status,recipientcount').eq('id',id).maybeSingle();
      if(existingError)throw existingError;
      if(existing){
        if(existing.createdby!==actor||existing.subject!==subject||existing.message!==message)fail(409,'This campaign key is already in use.');
        if(existing.status==='SENT')return {recipientCount:Number(existing.recipientcount??0),alreadySent:true};
        fail(409,'This campaign attempt is already recorded and requires operator review before retrying.');
      }
      const filters=input.filters&&typeof input.filters==='object'?input.filters as Json:{};
      const filterCountry=text(filters.country,80),filterCity=text(filters.city,100),filterService=text(filters.serviceInterest,30).toUpperCase(),filterLanguage=text(filters.preferredLanguage,40);
      const {error:claimError}=await admin.from('marketingcampaigns').insert({id,subject,message,status:'SENDING',recipientcount:0,createdby:actor,data:{filters:{country:filterCountry,city:filterCity,serviceInterest:filterService,preferredLanguage:filterLanguage}}});
      if(claimError?.code==='23505')fail(409,'This campaign was already submitted. Refresh campaign history before retrying.');
      if(claimError)throw claimError;
      let recipientQuery=admin.from('betawaitlist').select('*').eq('marketingemailpermission','YES').limit(100);
      if(filterCountry)recipientQuery=recipientQuery.eq('country',filterCountry);
      if(filterCity)recipientQuery=recipientQuery.eq('city',filterCity);
      if(['HOUSE','CAR','BOTH'].includes(filterService))recipientQuery=recipientQuery.eq('serviceinterest',filterService);
      if(filterLanguage)recipientQuery=recipientQuery.eq('preferredlanguage',filterLanguage);
      const {data:recipients,error}=await recipientQuery;
      if(error){await admin.from('marketingcampaigns').update({status:'FAILED'}).eq('id',id).eq('status','SENDING');throw error;}
      const escapeHtml=(value:string)=>value.replace(/[<>&"']/g,char=>{
        const entities:Record<string,string>={'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'};
        return entities[char]??char;
      });
      const emails=(recipients??[]).map((r:Json)=>({from:'Detail <hello@detailapp.co.zw>',to:[r.email],subject,html:`<p>Hi ${escapeHtml(String(r.fullname||'there'))},</p><p>${escapeHtml(message).replace(/\r?\n/g,'<br>')}</p><hr><p><a href="${url}/functions/v1/marketing-unsubscribe?token=${encodeURIComponent(r.unsubscribetoken)}">Unsubscribe</a></p>`}));
      if(emails.length) {
        const result=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify(emails)});
        if(!result.ok){await admin.from('marketingcampaigns').update({status:'FAILED'}).eq('id',id).eq('status','SENDING');fail(502,'Email provider rejected the campaign.');}
      }
      const {error:sentError}=await admin.from('marketingcampaigns').update({status:'SENT',recipientcount:emails.length}).eq('id',id).eq('status','SENDING');if(sentError)throw sentError;
      await admin.from('adminauditevents').upsert({id:`campaign_${id}`,action:'marketing_campaign_sent',actorid:actor,targetid:id,reason:`Campaign: ${subject}`,data:{recipientCount:emails.length},immutable:true});
      return {recipientCount:emails.length};
    }
    case 'adminDirectory': {
      const actor=authed(); await requireAdmin(actor,'admins.manage');
      const [{data:roles},{data:invites}] = await Promise.all([admin.from('adminroles').select('*'),admin.from('admininvites').select('*').order('createdat',{ascending:false}).limit(100)]);
      const ids=(roles??[]).map(r=>r.userid); const admins=[];
      for(const id of ids){const {data:user}=await admin.auth.admin.getUserById(id);if(user?.user)admins.push({uid:id,email:user.user.email??'',disabled:!!(user.user as User & {banned_until?:string|null}).banned_until,elevated:roles?.find(r=>r.userid===id)?.elevated===true,permissions:roles?.find(r=>r.userid===id)?.permissions??[],lastSignInAt:user.user.last_sign_in_at??null});}
      return {admins,invites:(invites??[]).map(i=>({id:i.id,email:i.email,status:i.status,permissions:i.permissions,createdAt:i.createdat,expiresAt:i.expiresat}))};
    }
    case 'createAdminInvite': {
      const actor=authed(); const actorRole=await requireAdmin(actor,'admins.manage'); requireRecentMfa(request);
      const email=text(input.email,254).toLowerCase();const permissions=Array.isArray(input.permissions)?input.permissions.filter((p:unknown)=>typeof p==='string'&&['marketing.read','marketing.send','finance.read','finance.write','bookings.manage','users.manage','support.manage','audit.read','admins.manage'].includes(p)):[];
      if(!email.includes('@'))fail(400,'Enter a valid email address.');
      if(actorRole.elevated!==true&&permissions.some((permission:string)=>!(actorRole.permissions??[]).includes(permission)))fail(403,'You cannot grant permissions you do not hold.');
      const token=crypto.randomUUID()+crypto.randomUUID(); const {error}=await admin.from('admininvites').insert({email,tokenhash:await hash(token),permissions,elevated:false,status:'PENDING',createdby:actor,expiresat:new Date(Date.now()+7*86400000).toISOString()});
      if(error)throw error;
      return {inviteUrl:`https://dashboard.detail.co.zw/admin/accept-invite?token=${encodeURIComponent(token)}`};
    }
    case 'acceptAdminInvite': {
      const actor=authed();const token=text(input.token,200);const {data:invite}=await admin.from('admininvites').select('*').eq('tokenhash',await hash(token)).eq('status','PENDING').gt('expiresat',new Date().toISOString()).maybeSingle();
      if(!invite||invite.email!==String(user?.email??'').toLowerCase())fail(403,'Invitation is invalid, expired, or belongs to another email.');
      await admin.from('adminroles').upsert({userid:actor,elevated:invite.elevated,permissions:invite.permissions},{onConflict:'userid'});
      await admin.from('admininvites').update({status:'ACCEPTED'}).eq('id',invite.id);
      await admin.auth.admin.updateUserById(actor,{app_metadata:{admin:true,elevated:invite.elevated,permissions:invite.permissions}});
      await admin.from('adminauditevents').insert({id:`invite_accepted_${invite.id}`,action:'admin_invite_accepted',actorid:actor,targetid:invite.id,createdat:new Date().toISOString()});
      return {success:true};
    }
    default: fail(404,`Unknown marketplace action: ${name}`);
  }
}

Deno.serve(async request => {
  const origin=request.headers.get('origin');
  if(origin && !allowedOrigins.has(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) return reply({error:'Origin not allowed.'},403,null);
  // A 204 response must not carry a body. Returning JSON here makes the Fetch
  // Response constructor throw, which prevents browsers from completing CORS
  // preflight for every cross-origin API request.
  if(request.method==='OPTIONS')return new Response(null,{
    status:204,
    headers:{
      'access-control-allow-origin':origin??'*',
      'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods':'POST, OPTIONS',
      'vary':'Origin',
    },
  });
  if(request.method!=='POST')return reply({error:'POST required.'},405,origin);
  try {
    const parsed=await readBoundedJson(request);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'Request must be a JSON object.');
    const payload=parsed as {name?:string;data?:Json};
    if(payload.data!==undefined&&payload.data!==null&&(typeof payload.data!=='object'||Array.isArray(payload.data)))fail(400,'Action data must be a JSON object.');
    const name=text(payload.name,100); if(!name)fail(400,'Action name is required.');
    const publicActions=new Set(['getBetaConfig','joinWaitlist','blogPublicList']);
    const user=publicActions.has(name)?null:await getUser(request);
    return reply(await dispatch(name,payload.data??{},request,user),200,origin);
  } catch(error) {
    const status=error instanceof ApiError?error.status:500;
    if(status>=500)console.error('marketplace-api error',String(error));
    return reply({error:error instanceof ApiError?error.message:'The service could not complete this request.'},status,origin);
  }
});
