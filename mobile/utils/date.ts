export function formatDate(value: unknown, fallback = 'Recent'): string {
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    try {
      const converted = value.toDate();
      if (converted instanceof Date) date = converted;
    } catch {
      return fallback;
    }
  }
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : fallback;
}
