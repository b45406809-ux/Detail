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
import { IS_SIMULATING_FUNCTIONS } from '../utils/env';
import { FUNCTION_SIMULATORS } from './functionSimulators';

const USE_EMULATOR =
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' ||
  process.env.EXPO_PUBLIC_USE_FUNCTIONS_EMULATOR === 'true';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost';

let _emulatorConnected = false;

export async function callFunction<TData = any, TResult = any>(
  name: string,
  data?: TData
): Promise<TResult> {
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
