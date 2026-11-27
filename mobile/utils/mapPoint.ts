/** A [lng, lat] pair the map can draw, or null when the stored location is empty or invalid. */
export function mapPoint(value: unknown): [number, number] | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return [lng, lat];
}
