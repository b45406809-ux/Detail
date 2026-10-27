/** Return whether a sensitive admin action needs a new password sign-in. */
export function adminStepUpFailure(
  lastSignInAt: unknown,
  nowMilliseconds = Date.now(),
): 'recent_auth_required' | null {
  const signedInMilliseconds = typeof lastSignInAt === 'number'
    ? lastSignInAt * 1000
    : typeof lastSignInAt === 'string' ? Date.parse(lastSignInAt) : Number.NaN;
  return Number.isFinite(signedInMilliseconds) && signedInMilliseconds <= nowMilliseconds && nowMilliseconds - signedInMilliseconds <= 15 * 60 * 1000
    ? null
    : 'recent_auth_required';
}
