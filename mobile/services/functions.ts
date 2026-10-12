/**
 * Thin wrapper around Firebase callable Cloud Functions.
 *
 * firebase/functions is imported lazily so it stays out of the initial bundle
 * for screens that never call a function.
 *
 * Pointed at the local Functions emulator (firebase emulators:start) when
 * either EXPO_PUBLIC_USE_FIREBASE_EMULATOR or the narrower
 * EXPO_PUBLIC_USE_FUNCTIONS_EMULATOR is 'true' — the latter lets Functions
 * run locally (free, no Blaze plan needed) while Auth/Firestore stay on a
 * real deployed project. DEV builds exercise the exact same server code as
 * production instead of any client-side shortcut.
 *
 * TEMPORARY: while EXPO_PUBLIC_SIMULATE_FUNCTIONS is 'true' (Cloud Functions
 * can't be deployed yet — needs Blaze billing), named functions are routed
 * through services/functionSimulators.ts instead of the real
 * httpsCallable — see that file's header comment for details. Remove this
 * branch once real Functions are deployed.
 */
import { BACKEND_PROVIDER, CLOUDFLARE_API_URL, IS_SIMULATING_FUNCTIONS } from '../utils/env';
import { FUNCTION_SIMULATORS } from './functionSimulators';
import { auth } from './firebase';

const USE_EMULATOR =
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' ||
  process.env.EXPO_PUBLIC_USE_FUNCTIONS_EMULATOR === 'true';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost';

let _emulatorConnected = false;

export async function callFunction<TData = any, TResult = any>(
  name: string,
  data?: TData
): Promise<TResult> {
  if (BACKEND_PROVIDER === 'cloudflare') {
    if (!CLOUDFLARE_API_URL) {
      throw new Error('Cloudflare API is selected but EXPO_PUBLIC_CLOUDFLARE_API_URL is missing.');
    }
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Please sign in before contacting the Detail API.');
    const response = await fetch(`${CLOUDFLARE_API_URL}/v1/rpc`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, data: data ?? {} }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? 'The Detail API request failed.');
    return result as TResult;
  }

  if (IS_SIMULATING_FUNCTIONS && FUNCTION_SIMULATORS[name]) {
    return FUNCTION_SIMULATORS[name](data) as Promise<TResult>;
  }

  const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import('firebase/functions');
  const { getApp } = await import('firebase/app');
  const functions = getFunctions(getApp());

  if (USE_EMULATOR && !_emulatorConnected) {
    connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
    _emulatorConnected = true;
  }

  const fn = httpsCallable<TData, TResult>(functions, name);
  const { data: result } = await fn(data as TData);
  return result;
}
