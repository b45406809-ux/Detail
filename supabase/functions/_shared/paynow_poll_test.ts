import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pollPaynowStatus } from './paynow_poll.ts';

Deno.test('signed poll response provides reference, status and amount', async () => {
  const client = { parseStatusUpdate: (body: string) => { assertEquals(body, 'signed-response'); return { reference: 'wallet-1', status: 'Paid', amount: '2.00' }; } };
  const request: typeof fetch = async (_url, init) => { assertEquals(init?.method, 'POST'); return new Response('signed-response'); };
  assertEquals(await pollPaynowStatus(client, 'https://www.paynow.co.zw/check', request), { reference: 'wallet-1', status: 'Paid', amount: 2 });
});

Deno.test('poll rejects untrusted hosts, unsigned responses and incomplete values', async () => {
  const invalid = { parseStatusUpdate: () => { throw new Error('Invalid signature'); } };
  const request: typeof fetch = async () => new Response('bad');
  await assertRejects(() => pollPaynowStatus(invalid, 'https://example.com/', request), Error, 'Untrusted');
  await assertRejects(() => pollPaynowStatus(invalid, 'https://www.paynow.co.zw/check', request), Error, 'Invalid signature');
  await assertRejects(() => pollPaynowStatus({ parseStatusUpdate: () => ({ status: 'Paid' }) }, 'https://www.paynow.co.zw/check', request), Error, 'incomplete');
});
