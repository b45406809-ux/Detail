import { IS_DEV } from '../utils/env';
import { auth } from './firebase';
import { db, doc, addDoc, updateDoc, collection, serverTimestamp, increment } from './firebase';

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
}

/**
 * Adds funds to the current user's wallet.
 *
 * DEV:  Simulates a successful payment (1.2 s delay), writes a real transaction
 *       to Firestore and increments the user's balance — so the wallet screen
 *       updates live without a real payment processor.
 *
 * PROD: Creates a PaymentIntent via the `createPaymentIntent` Firebase Cloud
 *       Function, then opens Stripe's native PaymentSheet.  On success Stripe's
 *       webhook (or a Firestore trigger) should credit the wallet and write the
 *       transaction — the client-side update is intentionally omitted so the
 *       server is the single source of truth.
 *
 * Backend contract (PROD):
 *   - Cloud Function `createPaymentIntent({ amount: number /*cents*\/, currency: 'usd' })`
 *     → `{ clientSecret: string }`
 */
export async function addFundsToWallet(amountUSD: number): Promise<PaymentResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  if (IS_DEV) {
    await new Promise((r) => setTimeout(r, 1200));

    const txRef = await addDoc(collection(db, 'transactions'), {
      userId: user.uid,
      type: 'CREDIT',
      amount: amountUSD,
      description: `Wallet top-up [DEV simulated]`,
      status: 'COMPLETED',
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'users', user.uid), {
      balance: increment(amountUSD),
    });

    return { success: true, transactionId: txRef.id };
  }

  // PROD — Stripe PaymentSheet
  const { initPaymentSheet, presentPaymentSheet } = await import('@stripe/stripe-react-native');
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { getApp } = await import('firebase/app');

  const functions = getFunctions(getApp());
  const createPaymentIntent = httpsCallable<
    { amount: number; currency: string },
    { clientSecret: string }
  >(functions, 'createPaymentIntent');

  const { data } = await createPaymentIntent({
    amount: Math.round(amountUSD * 100),
    currency: 'usd',
  });

  const { error: initError } = await initPaymentSheet({
    merchantDisplayName: 'Detail',
    paymentIntentClientSecret: data.clientSecret,
    defaultBillingDetails: {
      name: auth.currentUser?.displayName ?? undefined,
    },
  });
  if (initError) throw new Error(initError.message);

  const { error } = await presentPaymentSheet();
  if (error) {
    if (error.code === 'Canceled') throw new Error('CANCELED');
    throw new Error(error.message);
  }

  return { success: true };
}

/**
 * Returns the user's saved payment methods.
 *
 * DEV:  Returns a fake Visa test card.
 *
 * PROD: Calls the `listPaymentMethods` Firebase Cloud Function which fetches
 *       saved methods from the user's Stripe Customer object.
 *
 * Backend contract (PROD):
 *   - Cloud Function `listPaymentMethods()` → `{ methods: StripePaymentMethod[] }`
 *     Each method: `{ id, brand, last4, expMonth, expYear }`
 */
export async function getPaymentMethods(): Promise<
  Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }>
> {
  if (IS_DEV) {
    return [{ id: 'pm_dev_test', brand: 'visa', last4: '4242', expMonth: 12, expYear: 26 }];
  }

  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    const functions = getFunctions(getApp());
    const listPaymentMethods = httpsCallable<void, { methods: any[] }>(
      functions,
      'listPaymentMethods'
    );
    const { data } = await listPaymentMethods();
    return data.methods ?? [];
  } catch {
    return [];
  }
}
