import { toByteArray } from 'base64-js';

function tokenClaims(idToken) {
  const payload = idToken.split('.')[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = toByteArray(padded);
    let json = '';
    for (const byte of bytes) json += String.fromCharCode(byte);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Supabase must receive the original nonce only when Google's ID token carries
 * a nonce claim. GoTrue validates the token signature and nonce value server-side.
 */
export function googleSupabaseNonceForIdToken(idToken, rawNonce) {
  if (typeof rawNonce !== 'string' || rawNonce.length === 0) return undefined;
  const nonce = tokenClaims(idToken)?.nonce;
  return typeof nonce === 'string' && nonce.length > 0 ? rawNonce : undefined;
}
