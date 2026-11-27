import { supabase } from './supabase';

async function safeFunctionError(error: unknown, responseData: unknown): Promise<string> {
  const candidates: unknown[] = [responseData];
  if (error && typeof error === 'object') {
    const context = (error as { context?: unknown }).context;
    if (context && typeof context === 'object') {
      const response = context as Response;
      // Read the server's own message. The body may already be used, so try a clone, then the body directly.
      let body: unknown = null;
      try { if (typeof response.clone === 'function') body = await response.clone().json(); } catch { /* try next */ }
      if (!body) { try { if (typeof response.text === 'function') { const text = await response.text(); body = text ? JSON.parse(text) : null; } } catch { /* use the friendly fallback */ } }
      if (body) candidates.unshift(body);
    }
  }
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      const message = (candidate as { error?: unknown }).error;
      if (typeof message === 'string' && message.length <= 500) return message;
    }
  }
  // Never show raw SDK wording such as "Edge Function returned a non-2xx status code".
  const raw = error instanceof Error ? error.message : '';
  if (/network|fetch|timed? ?out|offline/i.test(raw)) return 'Detail could not reach the server. Check your internet connection and try again.';
  return 'Something went wrong on our side. Please try again in a moment.';
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
