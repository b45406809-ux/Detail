import { Paynow } from 'npm:paynow@2.2.2';
import { initiatePaynowMobile } from '../_shared/paynow_mobile.ts';
import { paynowFetch } from '../_shared/paynow_relay.ts';

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
async function sameSecret(left: string, right: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(left)), crypto.subtle.digest('SHA-256', encoder.encode(right))]);
  return new Uint8Array(a).reduce((acc, byte, i) => acc | (byte ^ new Uint8Array(b)[i]), 0) === 0;
}
// Restrict error details to a fixed vocabulary: never emit payloads, headers or URLs.
function classify(error: unknown): string[] {
  const result: string[] = [];
  let value: unknown = error;
  for (let i = 0; i < 5 && value instanceof Error; i++, value = value.cause) {
    const m = `${value.name} ${value.message}`;
    result.push(/reset by peer|ECONNRESET|os error 104/i.test(m) ? 'connection_reset'
      : /timed? ?out|timeout|AbortError/i.test(m) ? 'timeout'
      : /dns|name resolution|resolve/i.test(m) ? 'dns_error'
      : /certificate|tls|ssl/i.test(m) ? 'tls_error'
      : 'other_network_error');
  }
  return result.length ? result : ['unknown'];
}
Deno.serve(async request => {
  const expected = Deno.env.get('PAYNOW_PROBE_ONETIME_SECRET') ?? '';
  const supplied = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (request.method !== 'POST' || !expected || !supplied || !await sameSecret(expected, supplied)) return response({ error: 'Unauthorized' }, 401);
  const body = await request.json();
  if (body.phone !== '0787213818' || body.email !== 'crzzphillip@gmail.com' || !/^DETAIL-SB-DIAG-[0-9]+-[0-9]+$/.test(body.reference)) return response({ error: 'Invalid diagnostic input' }, 400);
  const id = Deno.env.get('PAYNOW_INTEGRATION_ID') ?? '', key = Deno.env.get('PAYNOW_INTEGRATION_KEY') ?? '';
  if (id !== '27890' || !key) return response({ error: 'Expected Paynow integration is not configured' }, 503);
  const client = new Paynow(id, key, 'https://example.com/paynow-diagnostic', 'https://example.com/paynow-diagnostic');
  const payment = client.createPayment(body.reference, body.email);
  payment.add('Detail payment diagnostic', 2);
  let fetchFailure: string[] | undefined;
  const tracedFetch: typeof fetch = async (input, init) => {
    try { return await paynowFetch(input, init); }
    catch (error) { fetchFailure = classify(error); throw error; }
  };
  const result = await initiatePaynowMobile(client, payment, body.phone, tracedFetch);
  return response({ reference: body.reference, initiation: result.kind,
    ...(result.kind === 'accepted' ? { statusLinkReceived: true } : { reason: result.reason }),
    ...(fetchFailure ? { causes: fetchFailure } : {}) });
});
