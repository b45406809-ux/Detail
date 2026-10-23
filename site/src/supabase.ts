import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321', import.meta.env.VITE_SUPABASE_ANON_KEY || 'local-anon-key', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
export async function functionErrorMessage(error: unknown, data?: unknown): Promise<string> {
  if (error && typeof error === 'object') {
    const context = (error as { context?: unknown }).context;
    if (context && typeof context === 'object' && 'clone' in context && typeof (context as Response).clone === 'function') {
      try {
        const body = await (context as Response).clone().json() as { error?: unknown };
        if (typeof body?.error === 'string' && body.error.length <= 500) return body.error;
      } catch { /* use returned data or the SDK fallback */ }
    }
  }
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error.slice(0, 500);
  }
  return error instanceof Error && error.message ? error.message : 'The service could not complete this request.';
}
export async function joinWaitlist(data: Record<string, unknown>) {
  const { data: result, error } = await supabase.functions.invoke('marketplace-api', { body: { name: 'joinWaitlist', data } });
  if (error) throw new Error(await functionErrorMessage(error, result) || 'We could not save your place. Please try again.');
  return result;
}

export type BetaConfig = { bookingEnabled: boolean; waitlistEnabled: boolean; message: string; whatsapp: string };
export const SUPPORT_WHATSAPP = '263714885936';
export async function loadBetaConfig(): Promise<BetaConfig> {
  const defaults: BetaConfig = { bookingEnabled: false, waitlistEnabled: true, message: 'Bookings are being prepared for beta. Join the waitlist and we’ll let you know when your area opens.', whatsapp: SUPPORT_WHATSAPP };
  try {
    const { data, error } = await supabase.functions.invoke('marketplace-api', { body: { name: 'getBetaConfig', data: {} } });
    if (error || !data || typeof data !== 'object') return defaults;
    return {
      bookingEnabled: data.bookingEnabled === true,
      waitlistEnabled: data.waitlistEnabled !== false,
      message: String(data.message || defaults.message),
      whatsapp: SUPPORT_WHATSAPP,
    };
  } catch { return defaults; }
}
