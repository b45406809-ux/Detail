function containsPrivateMedia(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('detail-media/');
  if (Array.isArray(value)) return value.some(containsPrivateMedia);
  if (value && typeof value === 'object') return Object.values(value).some(containsPrivateMedia);
  return false;
}

/** Resolve profile images without delaying the account data or restoring stale data. */
export async function resolveMediaInBackground(
  original: unknown,
  sign: (value: unknown) => Promise<unknown>,
  isCurrent: () => boolean,
  apply: (resolved: unknown, original: unknown) => void,
  onError: () => void,
): Promise<void> {
  if (!containsPrivateMedia(original)) return;
  try {
    const resolved = await sign(original);
    if (isCurrent()) apply(resolved, original);
  } catch {
    if (isCurrent()) onError();
  }
}
