const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const MAX_HORIZON = 180 * DAY;

/** Validate schedule timestamps before accepting client-authored booking data. */
export function isValidScheduledBookingTime(
  preference: unknown,
  value: unknown,
  now = Date.now(),
): value is string {
  if (typeof preference !== 'string' || !['ASAP', 'TODAY', 'TOMORROW', 'CUSTOM'].includes(preference)) return false;
  if (typeof value !== 'string' || !value.trim()) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + MAX_HORIZON) return false;

  if (preference === 'CUSTOM') return timestamp >= now + 30 * MINUTE;
  if (preference === 'TOMORROW') {
    // The client adds one local calendar day, which can be 23 or 25 hours over
    // daylight-saving transitions. The broad bound also tolerates clock skew.
    const hoursAhead = (timestamp - now) / (60 * MINUTE);
    return hoursAhead >= 20 && hoursAhead <= 28;
  }

  // ASAP and TODAY resolve to the request time. Allow a short transit delay
  // between the client timestamp and server validation, but reject stale dates.
  return timestamp >= now - 5 * MINUTE && timestamp <= now + 60 * MINUTE;
}
