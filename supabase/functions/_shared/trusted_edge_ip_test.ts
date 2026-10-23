import { trustedEdgeIp } from './trusted_edge_ip.ts';

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${expected}, received ${actual}`);
}

Deno.test('uses only the ingress-provided Cloudflare address', () => {
  assertEquals(trustedEdgeIp(new Request('https://detail.invalid', { headers: {
    'cf-connecting-ip': '203.0.113.24',
    'x-forwarded-for': '198.51.100.9',
    'x-real-ip': '192.0.2.100',
  } })), '203.0.113.24', 'untrusted forwarding headers cannot replace the edge address');
  assertEquals(trustedEdgeIp(new Request('https://detail.invalid', { headers: {
    'x-forwarded-for': '198.51.100.9',
    'x-real-ip': '192.0.2.100',
  } })), null, 'caller-supplied forwarding headers are ignored');
  assertEquals(trustedEdgeIp(new Request('https://detail.invalid', { headers: {
    'cf-connecting-ip': '203.0.113.24, 198.51.100.9',
  } })), null, 'ambiguous address lists are rejected');
});
