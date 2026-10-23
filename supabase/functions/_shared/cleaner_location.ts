export function cleanerLocationIsFresh(status: unknown, locationUpdatedAt: unknown, now = Date.now()): boolean {
  const timestamp = typeof locationUpdatedAt === 'string' ? Date.parse(locationUpdatedAt) : NaN;
  return status === 'AVAILABLE' && Number.isFinite(timestamp) && timestamp > now - 5 * 60 * 1000;
}
