import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { fetchAndActivate, getBoolean, getRemoteConfig, getString } from 'firebase/remote-config';

export const app = initializeApp({ apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID });
export const auth = getAuth(app);
export const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1');
const waitlistApiUrl = String(import.meta.env.VITE_WAITLIST_API_URL || '').replace(/\/$/, '');
export async function joinWaitlist(data: Record<string, unknown>) {
  if (!waitlistApiUrl) throw new Error('Waitlist service is not configured. Please use WhatsApp support.');
  const result = await fetch(`${waitlistApiUrl}/api/waitlist`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const body = await result.json().catch(() => ({})) as { error?: string };
  if (!result.ok) throw new Error(body.error || 'We could not save your place. Please try again.');
  return body;
}

export type BetaConfig = { bookingEnabled: boolean; waitlistEnabled: boolean; message: string; whatsapp: string };
export const SUPPORT_WHATSAPP = '263714885936';
export async function loadBetaConfig(): Promise<BetaConfig> {
  const defaults: BetaConfig = { bookingEnabled: false, waitlistEnabled: true, message: 'Bookings are being prepared for beta. Join the waitlist and we’ll let you know when your area opens.', whatsapp: SUPPORT_WHATSAPP };
  try {
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 60 * 60 * 1000;
    rc.defaultConfig = { booking_enabled: defaults.bookingEnabled, waitlist_enabled: defaults.waitlistEnabled, maintenance_message: defaults.message, whatsapp_number: defaults.whatsapp };
    await fetchAndActivate(rc);
    return { bookingEnabled: getBoolean(rc, 'booking_enabled'), waitlistEnabled: getBoolean(rc, 'waitlist_enabled'), message: getString(rc, 'maintenance_message') || defaults.message, whatsapp: SUPPORT_WHATSAPP };
  } catch { return defaults; }
}
