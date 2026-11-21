import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { auth } from './supabase';
import { callFunction } from './functions';

type TopupPurpose = 'VERIFICATION' | 'COMMISSION';
type Topup = { referenceNumber: string; status: string };
type TopupIntent = { key: string; referenceNumber?: string };

const storageKey = (uid: string) => `detail:ecocash-intent:${uid}`;
const readIntent = async (uid: string): Promise<TopupIntent | null> => {
  const saved = await AsyncStorage.getItem(storageKey(uid));
  try { return JSON.parse(saved ?? 'null'); } catch { return null; }
};
export const isTopupFinished = (status: string) => ['PAID', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(status);

export async function pendingEcoCashTopup(uid: string) {
  return (await readIntent(uid))?.referenceNumber;
}

export async function addFundsToWallet(amount: number, phone: string, purpose: TopupPurpose): Promise<Topup> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to pay.');
  const key = storageKey(user.uid);
  const saved = await readIntent(user.uid);
  if (saved?.referenceNumber) return { referenceNumber: saved.referenceNumber, status: 'PENDING' };

  const intent = saved ?? { key: Crypto.randomUUID() };
  await AsyncStorage.setItem(key, JSON.stringify(intent));
  const result = await callFunction<
    { amount: number; phone: string; purpose: TopupPurpose; currency: string; idempotencyKey: string },
    Topup
  >('createPaynowWalletTopup', { amount, phone, purpose, currency: 'USD', idempotencyKey: intent.key });
  if (isTopupFinished(result.status)) await AsyncStorage.removeItem(key);
  else await AsyncStorage.setItem(key, JSON.stringify({ ...intent, referenceNumber: result.referenceNumber }));
  return result;
}

export async function refreshEcoCashTopup(referenceNumber: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to check your payment.');
  const result = await callFunction<{ referenceNumber: string }, { status: string }>(
    'refreshPaynowWalletTopup', { referenceNumber },
  );
  if (isTopupFinished(result.status)) {
    const saved = await readIntent(user.uid);
    if (saved?.referenceNumber === referenceNumber) await AsyncStorage.removeItem(storageKey(user.uid));
  }
  return result.status;
}
