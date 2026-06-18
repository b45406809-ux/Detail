/**
 * Thin wrapper around Firebase callable Cloud Functions.
 *
 * firebase/functions is imported lazily so it stays out of the initial bundle
 * for screens that never call a function.
 *
 * When EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' the SDK is pointed at the
 * local Functions emulator (firebase emulators:start), so DEV builds exercise
 * the exact same server code as production instead of any client-side shortcut.
 */
const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost';

let _emulatorConnected = false;

export async function callFunction<TData = any, TResult = any>(
  name: string,
  data?: TData
): Promise<TResult> {
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
