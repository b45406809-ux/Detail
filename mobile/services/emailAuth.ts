import { IS_MOCK } from '../utils/env';
import { supabase } from './supabase';

export async function sendEmailLoginCode(email: string, intent: 'SIGN_IN' | 'REGISTER', termsAccepted: boolean) {
  if (IS_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return;
  }
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: intent === 'REGISTER', emailRedirectTo: 'detail://auth/callback', data: intent === 'REGISTER' ? { termsAccepted } : undefined } });
  if (error) throw error;
}

export async function confirmEmailLoginCode(email: string, code: string, intent: 'SIGN_IN' | 'REGISTER') {
  if (IS_MOCK) {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter a six-digit code.');
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: intent === 'REGISTER' ? 'signup' : 'email' });
  if (error) throw error;
  if (!data.user) throw new Error('Verification did not return an account.');
}
