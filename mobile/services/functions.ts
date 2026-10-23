import { supabase } from './supabase';

async function safeFunctionError(error: unknown, responseData: unknown): Promise<string> {
  const candidates: unknown[] = [responseData];
  if (error && typeof error === 'object') {
    const context = (error as { context?: unknown }).context;
    if (context && typeof context === 'object' && 'clone' in context && typeof (context as Response).clone === 'function') {
      try { candidates.unshift(await (context as Response).clone().json()); } catch { /* use the SDK message below */ }
    }
  }
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      const message = (candidate as { error?: unknown }).error;
      if (typeof message === 'string' && message.length <= 500) return message;
    }
  }
  return error instanceof Error && error.message ? error.message : 'The service could not complete this request.';
}

/** Invoke the authenticated Supabase Edge API that owns privileged workflows. */
export async function callFunction<TData = any, TResult = any>(name: string, data?: TData): Promise<TResult> {
  const { data: response, error } = await supabase.functions.invoke('marketplace-api', { body: { name, data: data ?? {} } });
  if (error) {
    throw new Error(await safeFunctionError(error, response));
  }
  if (response?.error) throw new Error(response.error);
  return response as TResult;
}
