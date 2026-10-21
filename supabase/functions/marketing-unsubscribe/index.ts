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
  if (!data) return new Response('This unsubscribe link is invalid or has already been used.', { status: 404 });
  return new Response('<!doctype html><title>Unsubscribed</title><main><h1>You are unsubscribed</h1><p>You will no longer receive Detail marketing emails.</p></main>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
});
