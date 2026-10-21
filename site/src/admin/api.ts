import { supabase } from '../supabase';
import type { AdminClaims, OverviewData } from './types';

export async function verifiedAdminClaims(force = false): Promise<AdminClaims> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in with an administrator account.');
  const { data, error } = await supabase.from('adminroles').select('elevated,permissions').eq('userid', user.id).maybeSingle();
  if (error || !data) throw new Error('Your account does not have a verified admin role.');
  return {
    admin: true,
    elevated: data.elevated === true,
    permissions: Array.isArray(data.permissions) ? data.permissions as string[] : [],
  };
}

export async function adminCall<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  await verifiedAdminClaims();
  const { data: response, error } = await supabase.functions.invoke('marketplace-api', { body: { name, data } });
  if (error) throw new Error(response?.error || error.message);
  if (response?.error) throw new Error(response.error);
  return response as T;
}

export async function waitlistAdminCall<T>(path: string, options: { method?: string; body?: Record<string, unknown> } = {}): Promise<T> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in with an administrator account.');
  await verifiedAdminClaims();
  const name = path.startsWith('/api/admin/waitlist') ? 'adminWaitlistQuery' : 'adminSendMarketingCampaign';
  const payload = name === 'adminWaitlistQuery' ? { ...options.body, cursor: new URL(path, location.origin).searchParams.get('cursor') } : options.body;
  const { data, error } = await supabase.functions.invoke('marketplace-api', { body: { name, data: payload } });
  if (error) throw new Error(data?.error || error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const getOverview = (period: '7d' | '30d' | '12m') => adminCall<OverviewData>('adminOverview', { period });
export const mutateAdmin = (action: string, payload: Record<string, unknown>) =>
  adminCall<{ ok: true; auditId: string }>('adminMutation', { action, ...payload });
