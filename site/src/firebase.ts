import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { fetchAndActivate, getBoolean, getRemoteConfig, getString } from 'firebase/remote-config';

const app = initializeApp({ apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID });
const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1');
export const joinWaitlist = httpsCallable(functions, 'joinWaitlist');

export type BetaConfig = { bookingEnabled: boolean; waitlistEnabled: boolean; message: string; whatsapp: string };
export async function loadBetaConfig(): Promise<BetaConfig> {
  const defaults: BetaConfig = { bookingEnabled: false, waitlistEnabled: true, message: 'Bookings are being prepared for beta. Join the waitlist and we’ll let you know when your area opens.', whatsapp: '263785832211' };
  try {
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 60 * 60 * 1000;
    rc.defaultConfig = { booking_enabled: defaults.bookingEnabled, waitlist_enabled: defaults.waitlistEnabled, maintenance_message: defaults.message, whatsapp_number: defaults.whatsapp };
    await fetchAndActivate(rc);
    return { bookingEnabled: getBoolean(rc, 'booking_enabled'), waitlistEnabled: getBoolean(rc, 'waitlist_enabled'), message: getString(rc, 'maintenance_message') || defaults.message, whatsapp: getString(rc, 'whatsapp_number') || defaults.whatsapp };
  } catch { return defaults; }
}
