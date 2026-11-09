import { createClient } from 'npm:@supabase/supabase-js@2.80.0';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
if (!url || !serviceKey) throw new Error('Supabase function environment is incomplete.');
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async request => {
  if (request.method !== 'GET') return new Response('GET required', { status: 405 });
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!/^[A-Za-z0-9-]{32,100}$/.test(token)) return new Response('Invalid unsubscribe link.', { status: 400 });
  const { data, error } = await admin.from('betawaitlist').update({ marketingemailpermission: 'NO', marketingconsent: { granted: false, source: 'unsubscribe', timestamp: new Date().toISOString() } }).eq('unsubscribetoken', token).select('id').maybeSingle();
  if (error) { console.error('Unsubscribe failed', error.message); return new Response('Could not update your preferences.', { status: 500 }); }
  if (data) return new Response('<!doctype html><title>Unsubscribed</title><main><h1>You are unsubscribed</h1><p>You will no longer receive Detail marketing emails.</p></main>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const {data:delivery,error:deliveryError}=await admin.from('marketingcampaigndeliveries').select('userid,channel').eq('unsubscribetoken',token).in('channel',['EMAIL','SMS','WHATSAPP']).maybeSingle();
  if(deliveryError){console.error('Campaign unsubscribe lookup failed',deliveryError.message);return new Response('Could not update your preferences.',{status:500});}
  if(!delivery?.userid)return new Response('This unsubscribe link is invalid or has already been used.', { status: 404 });
  const preferenceField=delivery.channel==='SMS'?'smsenabled':delivery.channel==='WHATSAPP'?'whatsappenabled':'emailenabled';
  const {error:updateError}=await admin.from('usermarketingpreferences').upsert({userid:delivery.userid,[preferenceField]:false,consentupdatedat:new Date().toISOString()},{onConflict:'userid'});
  if(updateError){console.error('Campaign unsubscribe update failed',updateError.message);return new Response('Could not update your preferences.',{status:500});}
  const channelName=delivery.channel==='SMS'?'SMS':delivery.channel==='WHATSAPP'?'WhatsApp':'email';
  return new Response(`<!doctype html><title>Unsubscribed</title><main><h1>You are unsubscribed</h1><p>You will no longer receive Detail marketing messages by ${channelName}.</p><p>You can change your other communication choices in your Detail profile.</p></main>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
});
