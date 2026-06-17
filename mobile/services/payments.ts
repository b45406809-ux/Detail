import * as WebBrowser from 'expo-web-browser';
import { IS_DEV } from '../utils/env';
import { auth, db, doc, addDoc, updateDoc, collection, serverTimestamp, increment } from './firebase';

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  referenceNumber?: string;
  pending?: boolean;
}

/**
 * Adds funds to the current user's wallet via PesePay.
 *
 * DEV:  Simulates a successful payment (1.2 s delay), writes a real Firestore
 *       transaction and increments the user's balance immediately.
 *
 * PROD: Calls the `createPesePayPayment` Firebase Cloud Function which creates
 *       the payment on PesePay's API and returns a hosted checkout URL.
 *       The user completes payment in a browser sheet (EcoCash, card, etc.).
 *       PesePay's webhook fires back to the backend on success, which updates
 *       Firestore — the wallet screen's onSnapshot listener picks this up
 *       automatically with no further polling needed.
 *
 * ─── Backend contracts (PROD) ────────────────────────────────────────────────
 *
 * Cloud Function: createPesePayPayment
 *   Input:  { amount: number, currency: 'USD', userId: string }
 *   Output: { redirectUrl: string, referenceNumber: string }
 *   Side-effect: writes a PENDING transaction doc to Firestore:
 *     transactions/{id} = { userId, type:'CREDIT', amount, status:'PENDING',
 *                           referenceNumber, description, createdAt }
 *
 * Cloud Function / HTTP endpoint: pesepayWebhook  (PesePay → backend)
 *   PesePay POSTs payment result here after the user pays.
 *   On status === 'PAID': updates transaction.status → 'COMPLETED' and runs
 *     users/{userId}.balance = FieldValue.increment(amount)
 *
 * Cloud Function: checkPesePayPayment  (optional, for status polling)
 *   Input:  { referenceNumber: string }
 *   Output: { status: 'PAID' | 'PENDING' | 'CANCELLED' | 'FAILED' }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function addFundsToWallet(amountUSD: number): Promise<PaymentResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  if (IS_DEV) {
    // DEV: simulate payment success and write real Firestore records
    await new Promise((r) => setTimeout(r, 1200));
    const txRef = await addDoc(collection(db, 'transactions'), {
      userId: user.uid,
      type: 'CREDIT',
      amount: amountUSD,
      description: 'Wallet top-up [DEV simulated]',
      status: 'COMPLETED',
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'users', user.uid), { balance: increment(amountUSD) });
    return { success: true, transactionId: txRef.id };
  }

  // PROD: PesePay hosted checkout
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { getApp } = await import('firebase/app');
  const functions = getFunctions(getApp());

  // Step 1: Backend creates the PesePay payment and returns the checkout URL
  const createPayment = httpsCallable<
    { amount: number; currency: string; userId: string },
    { redirectUrl: string; referenceNumber: string }
  >(functions, 'createPesePayPayment');

  const { data } = await createPayment({
    amount: amountUSD,
    currency: 'USD',
    userId: user.uid,
  });

  // Step 2: Open PesePay's hosted checkout in a browser sheet
  await WebBrowser.openBrowserAsync(data.redirectUrl, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
  });

  // Step 3: Browser dismissed — PesePay's webhook will have already updated Firestore
  // if the payment was successful. The wallet screen's onSnapshot listener will
  // reflect the balance change automatically. We return pending=true so the UI
  // can show an appropriate "processing" message.
  return { success: true, referenceNumber: data.referenceNumber, pending: true };
}

/**
 * Returns the payment methods supported on this platform.
 * PesePay handles method selection inside their hosted checkout page, so
 * this list is informational only (shown in the wallet UI).
 */
export function getPesePayMethods(): Array<{ id: string; label: string; sub: string }> {
  return [
    { id: 'ecocash', label: 'EcoCash', sub: 'Pay via EcoCash mobile money' },
    { id: 'onemoney', label: 'OneMoney', sub: 'Pay via OneMoney mobile money' },
    { id: 'card', label: 'Visa / Mastercard', sub: 'Pay with your debit or credit card' },
  ];
}
