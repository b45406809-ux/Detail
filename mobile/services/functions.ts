import { supabase } from './supabase';

/** Invoke the authenticated Supabase Edge API that owns privileged workflows. */
export async function callFunction<TData = any, TResult = any>(name: string, data?: TData): Promise<TResult> {
  const { data: response, error } = await supabase.functions.invoke('marketplace-api', { body: { name, data: data ?? {} } });
  if (error) {
    const detail = (response as { error?: string } | null)?.error;
    throw new Error(detail || error.message || 'The service could not complete this request.');
  }
  if (response?.error) throw new Error(response.error);
  return response as TResult;
}
