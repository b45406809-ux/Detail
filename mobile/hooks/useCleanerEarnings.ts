import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { callFunction } from '../services/functions';
import { auth } from '../services/supabase';

type CleanerEarnings = { totalEarnings: number; completedJobs: number };
type EarningsResult =
  | { userId: string; summary: CleanerEarnings; error: false }
  | { userId: string; summary: null; error: true };

export function useCleanerEarnings(userId: string | undefined, refreshKey: number) {
  const [result, setResult] = useState<EarningsResult | null>(null);

  useFocusEffect(useCallback(() => {
    setResult(null);
    if (!userId) return;
    let active = true;
    void callFunction<undefined, CleanerEarnings>('getCleanerEarningsSummary')
      .then(summary => {
        if (active && auth.currentUser?.uid === userId) {
          setResult({ userId, summary, error: false });
        }
      })
      .catch(() => {
        if (active && auth.currentUser?.uid === userId) {
          setResult({ userId, summary: null, error: true });
        }
      });
    return () => { active = false; };
  }, [userId, refreshKey]));

  const current = result?.userId === userId ? result : null;
  return {
    summary: current?.summary ?? null,
    error: current?.error ?? false,
    loading: Boolean(userId && !current),
  };
}
