import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321', import.meta.env.VITE_SUPABASE_ANON_KEY || 'local-anon-key', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
export async function joinWaitlist(data: Record<string, unknown>) {
  const { data: result, error } = await supabase.functions.invoke('marketplace-api', { body: { name: 'joinWaitlist', data } });
  if (error) throw new Error(result?.error || error.message || 'We could not save your place. Please try again.');
  return result;
}

export type BetaConfig = { bookingEnabled: boolean; waitlistEnabled: boolean; message: string; whatsapp: string };
export const SUPPORT_WHATSAPP = '263714885936';
export async function loadBetaConfig(): Promise<BetaConfig> {
  const defaults: BetaConfig = { bookingEnabled: false, waitlistEnabled: true, message: 'Bookings are being prepared for beta. Join the waitlist and we’ll let you know when your area opens.', whatsapp: SUPPORT_WHATSAPP };
  try {
    const { data, error } = await supabase.from('configuration').select('value').eq('key', 'beta').maybeSingle();
    if (error || !data?.value) return defaults;
    const config = data.value as Record<string, unknown>;
    return { bookingEnabled: config.bookingEnabled === true, waitlistEnabled: config.waitlistEnabled !== false, message: String(config.message || defaults.message), whatsapp: SUPPORT_WHATSAPP };
  } catch { return defaults; }
}
