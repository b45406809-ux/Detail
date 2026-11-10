import assert from 'node:assert/strict';
import test from 'node:test';
import { googleSupabaseNonceForIdToken } from '../components/googleIdTokenNonce.mjs';

function tokenWithClaims(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
}

test('passes the raw nonce when the Google ID token includes a nonce claim', () => {
  const token = tokenWithClaims({ aud: 'detail', nonce: 'hashed-request-nonce' });
  assert.equal(googleSupabaseNonceForIdToken(token, 'raw-request-nonce'), 'raw-request-nonce');
});

test('omits the raw nonce when the Google ID token has no nonce claim', () => {
  const token = tokenWithClaims({ aud: 'detail', email: 'qa@example.test' });
  assert.equal(googleSupabaseNonceForIdToken(token, 'raw-request-nonce'), undefined);
});

test('omits a malformed, missing, or empty ID token nonce claim', () => {
  assert.equal(googleSupabaseNonceForIdToken('not-a-jwt', 'raw-request-nonce'), undefined);
  assert.equal(googleSupabaseNonceForIdToken('header..signature', 'raw-request-nonce'), undefined);
  assert.equal(googleSupabaseNonceForIdToken(tokenWithClaims({ nonce: '' }), 'raw-request-nonce'), undefined);
  assert.equal(googleSupabaseNonceForIdToken(tokenWithClaims({ nonce: 42 }), 'raw-request-nonce'), undefined);
});
