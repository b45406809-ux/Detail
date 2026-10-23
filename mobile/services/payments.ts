import * as WebBrowser from 'expo-web-browser';
import { auth } from './supabase';
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
 * Paynow handles checkout. A verified Paynow result callback credits the wallet
 * server-side; the client never writes a balance directly.
 */
export async function addFundsToWallet(amountUSD: number): Promise<PaymentResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idempotencyKey = `topup-${user.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

  const data = await callFunction<
    { amount: number; currency: string; idempotencyKey: string },
    { redirectUrl: string; referenceNumber: string }
  >('createPaynowWalletTopup', { amount: amountUSD, currency: 'USD', idempotencyKey });

  await WebBrowser.openBrowserAsync(data.redirectUrl, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
  });

  // Poll the signed Paynow status endpoint after the hosted checkout returns.
  // A BuySafe top-up is credited only when Paynow reports Paid.
  try { await callFunction('refreshPaynowWalletTopup', { referenceNumber: data.referenceNumber }); } catch { /* the signed callback remains the source of truth */ }

  // The Paynow result callback settles the balance server-side. Return pending
  // because the user may have dismissed the hosted checkout before paying.
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
