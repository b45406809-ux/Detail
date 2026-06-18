/**
 * Thin wrapper around Firebase callable Cloud Functions.
 *
 * firebase/functions is imported lazily so it stays out of the initial bundle
 * for screens that never call a function.
 */
export async function callFunction<TData = any, TResult = any>(
  name: string,
  data?: TData
): Promise<TResult> {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { getApp } = await import('firebase/app');
  const fn = httpsCallable<TData, TResult>(getFunctions(getApp()), name);
  const { data: result } = await fn(data as TData);
  return result;
}
