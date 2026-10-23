import { assertEquals } from 'jsr:@std/assert@1';
import { cleanerLocationIsFresh } from '../marketplace-api/index.ts';

Deno.test('cleaner discovery requires available status and a fresh location', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z');
  assertEquals(cleanerLocationIsFresh('AVAILABLE', '2026-10-23T11:59:59.000Z', now), true);
  assertEquals(cleanerLocationIsFresh('OFFLINE', '2026-10-23T11:59:59.000Z', now), false);
  assertEquals(cleanerLocationIsFresh('BUSY', '2026-10-23T11:59:59.000Z', now), false);
  assertEquals(cleanerLocationIsFresh('AVAILABLE', '2026-10-23T11:57:59.999Z', now), false);
  assertEquals(cleanerLocationIsFresh('AVAILABLE', null, now), false);
  assertEquals(cleanerLocationIsFresh('AVAILABLE', 'invalid', now), false);
});
