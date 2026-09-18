import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import type { AdminClaims, OverviewData } from './types';

export async function verifiedAdminClaims(force = false): Promise<AdminClaims> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in with an administrator account.');
  const token = await user.getIdTokenResult(force);
  if (token.claims.admin !== true) throw new Error('Your verified token does not contain the admin claim.');
  return {
    admin: true,
    elevated: token.claims.elevated === true,
    permissions: Array.isArray(token.claims.permissions) ? token.claims.permissions as string[] : [],
  };
}

export async function adminCall<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  await verifiedAdminClaims();
  const response = await httpsCallable<Record<string, unknown>, T>(functions, name)(data);
  return response.data;
}

const waitlistApiUrl = String(import.meta.env.VITE_WAITLIST_API_URL || '').replace(/\/$/, '');
export async function waitlistAdminCall<T>(path: string, options: { method?: string; body?: Record<string, unknown> } = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in with an administrator account.');
  await verifiedAdminClaims();
  if (!waitlistApiUrl) throw new Error('Cloudflare waitlist API is not configured.');
  const result = await fetch(`${waitlistApiUrl}${path}`, { method: options.method || 'GET', headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined });
  const body = await result.json().catch(() => ({})) as T & { error?: string };
  if (!result.ok) throw new Error(body.error || `Waitlist API returned ${result.status}.`);
  return body;
}

export const getOverview = (period: '7d' | '30d' | '12m') => adminCall<OverviewData>('adminOverview', { period });
export const mutateAdmin = (action: string, payload: Record<string, unknown>) =>
  adminCall<{ ok: true; auditId: string }>('adminMutation', { action, ...payload });
