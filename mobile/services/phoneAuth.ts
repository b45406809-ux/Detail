import type { ConfirmationResult } from 'firebase/auth';
import { IS_DEV } from '../utils/env';

// Module-level store for the active OTP session (one at a time per app lifecycle)
let _confirmationResult: ConfirmationResult | null = null;

/**
 * DEV:  Waits 800 ms to simulate network, no SMS sent.
 *       Any 6-digit code will be accepted by confirmPhoneOTP.
 *
 * PROD: Triggers Firebase Phone Auth via reCAPTCHA verifier (expo-firebase-recaptcha).
 *       A real SMS is sent to phoneNumber (must include country code, e.g. "+1…").
 */
export async function sendPhoneOTP(
  phoneNumber: string,
  recaptchaVerifier: any
): Promise<void> {
  if (IS_DEV) {
    await new Promise((r) => setTimeout(r, 800));
    return;
  }
  const { signInWithPhoneNumber } = await import('firebase/auth');
  const { auth } = await import('./firebase');
  _confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
}

/**
 * DEV:  Signs the user in anonymously so the AuthGuard sees a real Firebase user.
 *       Accepts any 6-digit code.
 *
 * PROD: Validates the SMS code against the active ConfirmationResult.
 *       On success the user is fully authenticated.
 */
export async function confirmPhoneOTP(code: string): Promise<void> {
  if (IS_DEV) {
    const { signInAnonymously } = await import('firebase/auth');
    const { auth } = await import('./firebase');
    await signInAnonymously(auth);
    return;
  }
  if (!_confirmationResult) {
    throw new Error('No OTP session active. Please request a new code.');
  }
  await _confirmationResult.confirm(code);
  _confirmationResult = null;
}

export function clearOTPSession(): void {
  _confirmationResult = null;
}
