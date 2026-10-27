export interface AdminAuthClaims {
  aal?: unknown;
  auth_time?: unknown;
  email?: unknown;
}

/** Return why a sensitive admin action should be denied, or null when allowed. */
export function adminStepUpFailure(
  claims: AdminAuthClaims,
  nowSeconds = Date.now() / 1000,
): 'recent_auth_required' | null {
  const authenticatedAt = Number(claims.auth_time);
  return Number.isFinite(authenticatedAt) && authenticatedAt <= nowSeconds && nowSeconds - authenticatedAt <= 15 * 60
    ? null
    : 'recent_auth_required';
}
