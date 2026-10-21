import { IS_MOCK } from '../utils/env';
import { supabase } from './supabase';

let pendingPhone: string | null = null;

/**
 * DEV:  Waits 800 ms to simulate network, no SMS sent.
 *       Any 6-digit code will be accepted by confirmPhoneOTP.
 *
 * PROD: Supabase Auth sends SMS through its configured provider.
 */
export async function sendPhoneOTP(
  phoneNumber: string,
  _recaptchaVerifier?: any
): Promise<void> {
  if (IS_MOCK) {
    await new Promise((r) => setTimeout(r, 800));
    pendingPhone = phoneNumber;
    return;
  }
  const { error } = await supabase.auth.signInWithOtp({ phone: phoneNumber });
  if (error) throw error;
  pendingPhone = phoneNumber;
}

/**
 * DEV:  Signs the user in anonymously so the AuthGuard sees an authenticated user.
 *       Accepts any 6-digit code.
 *
 * PROD: Validates the SMS code through Supabase Auth.
 *       On success the user is fully authenticated.
 */
export async function confirmPhoneOTP(code: string): Promise<void> {
  if (IS_MOCK) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    return;
  }
  if (!pendingPhone) {
    throw new Error('No OTP session active. Please request a new code.');
  }
  const { error } = await supabase.auth.verifyOtp({ phone: pendingPhone, token: code, type: 'sms' });
  if (error) throw error;
  pendingPhone = null;
}

export function clearOTPSession(): void {
  pendingPhone = null;
}
