import { IS_MOCK } from '../utils/env';
import { callFunction } from './functions';

export async function sendEmailLoginCode(email: string, intent: 'SIGN_IN' | 'REGISTER', termsAccepted: boolean) {
  if (IS_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return;
  }
  await callFunction('sendEmailLoginCode', { email: email.trim().toLowerCase(), intent, termsAccepted });
}

export async function confirmEmailLoginCode(email: string, code: string, intent: 'SIGN_IN' | 'REGISTER') {
  if (IS_MOCK) {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter a six-digit code.');
    const { auth, signInAnonymously } = await import('./firebase');
    await signInAnonymously(auth);
    return;
  }
  const { customToken } = await callFunction<{ email: string; code: string; intent: 'SIGN_IN' | 'REGISTER' }, { customToken: string }>(
    'verifyEmailLoginCode', { email: email.trim().toLowerCase(), code, intent }
  );
  const { auth, signInWithCustomToken } = await import('./firebase');
  await signInWithCustomToken(auth, customToken);
}
