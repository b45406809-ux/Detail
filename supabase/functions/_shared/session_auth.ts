export function recentSupabaseAuthTime(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  const timestamps = amr.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('timestamp' in entry)) return NaN;
    const raw = (entry as { timestamp?: unknown }).timestamp;
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value <= 0) return NaN;
    return value > 1e12 ? value : value * 1000;
  }).filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

export function hasRecentSupabaseAuthentication(amr: unknown, now: number, maxAgeMs: number): boolean {
  const authenticatedAt = recentSupabaseAuthTime(amr);
  if (authenticatedAt === null) return false;
  const age = now - authenticatedAt;
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}
