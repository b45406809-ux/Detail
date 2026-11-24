import { paynowFetch } from '../_shared/paynow_relay.ts';

Deno.serve(async request => {
  const token = Deno.env.get('PAYNOW_PROBE_ONETIME_SECRET');
  if (request.method !== 'POST' || !token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return new Response(null, { status: 401 });
  }
  const result = await paynowFetch('https://www.paynow.co.zw/interface/remotetransaction', {
    method: 'POST', body: '', signal: AbortSignal.timeout(16000),
  });
  const fields = new URLSearchParams(await result.text());
  const providerError = [...fields].some(([key, value]) => key.toLowerCase() === 'status' && value.toLowerCase() === 'error');
  return Response.json({ region: Deno.env.get('SB_REGION'), upstream: result.status, providerError, relay: result.headers.get('x-detail-relay') });
});
