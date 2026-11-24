import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { initiatePaynowMobile } from './paynow_mobile.ts';

const client = {
  validate() {}, isValidEmail: () => true,
  buildMobile: () => ({ reference: 'wallet-123', hash: 'signature', phone: '0771234567' }),
  parse: (body: string) => JSON.parse(body),
};
Deno.test('mobile payment sends signed fields and retains the status link', async () => {
  const request: typeof fetch = async (_url, init) => {
    assertEquals(new URLSearchParams(String(init?.body)).get('hash'), 'signature');
    return new Response(JSON.stringify({ success: true, pollUrl: 'https://www.paynow.co.zw/status' }));
  };
  assertEquals(await initiatePaynowMobile(client, { authEmail: 'a@b.co' }, '0771234567', request),
    { kind: 'accepted', pollUrl: 'https://www.paynow.co.zw/status' });
});
Deno.test('provider rejection is distinct from a network error or invalid signature', async () => {
  const rejected: typeof fetch = async () => new Response(JSON.stringify({ success: false, error: 'Insufficient balance' }));
  assertEquals(await initiatePaynowMobile(client, {}, '', rejected), { kind: 'rejected', reason: 'EcoCash reported insufficient balance.' });
  const broken: typeof fetch = async () => { throw new Error('connection closed'); };
  assertEquals(await initiatePaynowMobile(client, {}, '', broken), { kind: 'unknown', reason: 'network_or_timeout' });
  const invalid: typeof fetch = async () => new Response('invalid');
  assertEquals(await initiatePaynowMobile(client, {}, '', invalid), { kind: 'unknown', reason: 'invalid_or_unverified_response' });
});
