import { hasRecentSupabaseAuthentication, recentSupabaseAuthTime } from './session_auth.ts';

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${expected}, received ${actual}`);
}

Deno.test('reads Supabase AMR timestamps in seconds and milliseconds', () => {
  assertEquals(recentSupabaseAuthTime([{ method: 'password', timestamp: 1_700_000_000 }]), 1_700_000_000_000, 'seconds convert to milliseconds');
  assertEquals(recentSupabaseAuthTime([{ method: 'otp', timestamp: 1_700_000_000_000 }]), 1_700_000_000_000, 'milliseconds stay unchanged');
});

Deno.test('requires a successful authentication on this session within the allowed window', () => {
  const now = 1_700_000_300_000;
  assertEquals(hasRecentSupabaseAuthentication([{ method: 'password', timestamp: 1_700_000_000 }], now, 300_000), true, 'the five-minute boundary is allowed');
  assertEquals(hasRecentSupabaseAuthentication([{ method: 'password', timestamp: 1_699_999_999 }], now, 300_000), false, 'stale authentication is rejected');
  assertEquals(hasRecentSupabaseAuthentication([{ method: 'password', timestamp: 1_700_000_301 }], now, 300_000), false, 'future authentication is rejected');
  assertEquals(hasRecentSupabaseAuthentication([], now, 300_000), false, 'missing methods are rejected');
  assertEquals(hasRecentSupabaseAuthentication([{ method: 'password', timestamp: 'invalid' }], now, 300_000), false, 'invalid timestamps are rejected');
});
