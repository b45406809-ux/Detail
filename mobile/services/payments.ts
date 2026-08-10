import * as WebBrowser from 'expo-web-browser';
import { IS_MOCK } from '../utils/env';
import { auth } from './firebase';
import { callFunction } from './functions';

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  referenceNumber?: string;
  pending?: boolean;
}

/**
 * Adds funds to the current user's wallet.
 *
 * No balance is ever written from the client — that would let a tampered build
 * mint money. The wallet is only ever credited by trusted server code:
 *
 * DEV:  calls `devCreditWallet`, a Cloud Function that refuses to run anywhere
 *       except the local Functions emulator. Lets you test the wallet without a
 *       live PesePay account. (Requires EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true.)
 *
 * PROD: calls `createPesePayPayment`, which starts a PesePay hosted checkout and
 *       returns a redirect URL. The user pays in a browser sheet (EcoCash, card,
 *       etc.). PesePay's webhook then credits the wallet server-side; the wallet
 *       screen's onSnapshot listener reflects the new balance automatically.
 */
export async function addFundsToWallet(amountUSD: number): Promise<PaymentResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  if (IS_MOCK) {
    // Emulator-only credit. Throws clearly if the emulator isn't running.
    await callFunction('devCreditWallet', { amount: amountUSD });
    return { success: true, pending: false };
  }

  const data = await callFunction<
    { amount: number; currency: string },
    { redirectUrl: string; referenceNumber: string }
  >('createPesePayPayment', { amount: amountUSD, currency: 'USD' });

  await WebBrowser.openBrowserAsync(data.redirectUrl, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
  });

  // Browser dismissed — PesePay's webhook settles the balance server-side and the
  // wallet's onSnapshot listener picks it up. Return pending so the UI can say so.
  return { success: true, referenceNumber: data.referenceNumber, pending: true };
}

/**
 * Payment methods shown in the wallet UI. The processor handles the actual
 * method selection on its hosted checkout page, so this list is
 * informational only. Deliberately excludes OneMoney — not a supported
 * method for Detail.
 */
export function getPaymentMethods(): Array<{ id: string; label: string; sub: string }> {
  return [
    { id: 'ecocash', label: 'EcoCash', sub: 'Pay via EcoCash mobile money' },
    { id: 'card', label: 'Visa / Mastercard', sub: 'Pay with your debit or credit card' },
  ];
}
