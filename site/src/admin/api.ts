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

export const getOverview = (period: '7d' | '30d' | '12m') => adminCall<OverviewData>('adminOverview', { period });
export const mutateAdmin = (action: string, payload: Record<string, unknown>) =>
  adminCall<{ ok: true; auditId: string }>('adminMutation', { action, ...payload });
