import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { initiatePaynowMobile } from './paynow_mobile.ts';

const client = {
  validate() {}, isValidEmail: () => true,
  buildMobile: () => ({ reference: 'wallet-123', hash: 'signature', phone: '0771234567' }),
  generateHash: () => 'signature', integrationKey: 'test',
  parse: (body: string) => JSON.parse(body),
};
Deno.test('mobile payment sends signed fields and retains the status link', async () => {
  const request: typeof fetch = async (_url, init) => {
    assertEquals(new URLSearchParams(String(init?.body)).get('hash'), 'signature');
    return new Response(JSON.stringify({ success: true, pollUrl: 'https://www.paynow.co.zw/status' }));
  };
  assertEquals(await initiatePaynowMobile(client, { authEmail: 'a+tag@b.co', total: () => 2 }, '0771234567', request),
    { kind: 'accepted', pollUrl: 'https://www.paynow.co.zw/status' });
});
Deno.test('provider rejection is distinct from a network error or invalid signature', async () => {
  const rejected: typeof fetch = async () => new Response(JSON.stringify({ success: false, error: 'Insufficient balance' }));
  const payment = { authEmail: 'a@b.co', total: () => 2 };
  assertEquals(await initiatePaynowMobile(client, payment, '', rejected), { kind: 'rejected', reason: 'EcoCash reported insufficient balance.' });
  const broken: typeof fetch = async () => { throw new Error('connection closed'); };
  assertEquals(await initiatePaynowMobile(client, payment, '', broken), { kind: 'unknown', reason: 'network_or_timeout' });
  const invalid: typeof fetch = async () => new Response('invalid');
  assertEquals(await initiatePaynowMobile(client, payment, '', invalid), { kind: 'unknown', reason: 'invalid_or_unverified_response' });
});

Deno.test('mobile request sends original fields and signs their decoded values', async () => {
  let signed: Record<string, string> = {};
  const actual = { ...client, buildMobile: () => ({ resulturl: 'https://example.com/result', reference: 'wallet-123', authemail: 'person+tag@example.com', phone: '0787213818', method: 'ecocash', amount: '2', additionalinfo: 'Cleaner%20registration', hash: 'old' }),
    generateHash: (fields: Record<string, string>) => { signed = { ...fields }; return 'new-signature'; },
    parse: () => ({ success: false, error: 'Insufficient balance' }) };
  const payment = { authEmail: 'person+tag@example.com', total: () => 2 };
  const request: typeof fetch = async (_url, init) => {
    const body = new URLSearchParams(String(init?.body));
    assertEquals(body.get('authemail'), 'person+tag@example.com');
    assertEquals(body.get('phone'), '0787213818');
    assertEquals(body.get('amount'), '2.00');
    assertEquals(body.get('method'), 'ecocash');
    assertEquals(body.get('resulturl'), 'https://example.com/result');
    assertEquals(body.get('additionalinfo')?.includes('%20'), false);
    const values = Object.fromEntries(body);
    const signature = values.hash;
    delete values.hash;
    assertEquals(signature, 'new-signature');
    assertEquals(values, signed);
    return new Response('status=error&error=Insufficient+balance');
  };
  assertEquals(await initiatePaynowMobile(actual, payment, '0787213818', request),
    { kind: 'rejected', reason: 'EcoCash reported insufficient balance.' });
});
