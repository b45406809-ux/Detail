import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isValidScheduledBookingTime } from './booking_schedule.ts';

Deno.test('booking schedule validation accepts supported presets', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z');
  assertEquals(isValidScheduledBookingTime('ASAP', new Date(now).toISOString(), now), true);
  assertEquals(isValidScheduledBookingTime('TODAY', new Date(now - 4 * 60_000).toISOString(), now), true);
  assertEquals(isValidScheduledBookingTime('TOMORROW', new Date(now + 23 * 60 * 60_000).toISOString(), now), true);
  assertEquals(isValidScheduledBookingTime('TOMORROW', new Date(now + 24 * 60 * 60_000).toISOString(), now), true);
  assertEquals(isValidScheduledBookingTime('TOMORROW', new Date(now + 25 * 60 * 60_000).toISOString(), now), true);
  assertEquals(isValidScheduledBookingTime('CUSTOM', new Date(now + 30 * 60_000).toISOString(), now), true);
});

Deno.test('booking schedule validation rejects invalid, stale and implausible dates', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z');
  assertEquals(isValidScheduledBookingTime('ASAP', 'not a date', now), false);
  assertEquals(isValidScheduledBookingTime('ASAP', new Date(now - 6 * 60_000).toISOString(), now), false);
  assertEquals(isValidScheduledBookingTime('TOMORROW', new Date(now + 19 * 60 * 60_000).toISOString(), now), false);
  assertEquals(isValidScheduledBookingTime('CUSTOM', new Date(now + 29 * 60_000).toISOString(), now), false);
  assertEquals(isValidScheduledBookingTime('UNKNOWN', new Date(now).toISOString(), now), false);
});
