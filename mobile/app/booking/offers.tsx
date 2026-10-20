// "Bids Received" — the client vets every bid (no instant-book, no
// negotiate). Ranked by cleaner rating so the strongest pros surface first.
// A 30-minute countdown runs from job.biddingExpiresAt; while it's live (or
// after it lapses) the customer can raise the budget — which also gives
// cleaners a fresh 30-minute window — or cancel the job outright.
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, Clock, Star, ShieldCheck, X, Check, TrendingUp, Timer } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { db, doc, collection, query, where, onSnapshot } from '../../services/firebase';
import { callFunction } from '../../services/functions';
import { rankBidsByRating } from '../../services/matching';
import { Job, Bid, JobStatus } from '../../types';
import { IS_MOCK } from '../../utils/env';

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function OffersScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyBidId, setBusyBidId] = useState<string | null>(null);
  const [paymentChoiceBid, setPaymentChoiceBid] = useState<Bid | null>(null);
  const [isIncreasingBudget, setIsIncreasingBudget] = useState(false);
  const [newBudgetValue, setNewBudgetValue] = useState('');
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [msRemaining, setMsRemaining] = useState<number | null>(null);
  const acceptedLocally = useRef(false);

  useEffect(() => {
    if (!jobId) return;
    return onSnapshot(
      doc(db, 'jobs', jobId),
      (snap) => {
        if (snap.exists()) setJob({ id: snap.id, ...snap.data() } as Job);
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    const q = query(collection(db, 'bids'), where('jobId', '==', jobId), where('status', 'in', ['PENDING', 'COUNTERED']));
    return onSnapshot(q, (snap) => setBids(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Bid))));
  }, [jobId]);

  // Redirect when a bid is accepted elsewhere. During our own acceptance we
  // wait for the Paynow checkout sheet to finish before navigating.
  useEffect(() => {
    if (job && job.status !== JobStatus.PENDING && !busyBidId && !acceptedLocally.current) {
      router.replace({ pathname: '/tracking/[jobId]', params: { jobId: jobId! } });
    }
  }, [job?.status, busyBidId]);

  // 30-minute bidding-window countdown, computed from the server-stored
  // expiry (not a plain local counter) so it survives remounts/navigation.
  useEffect(() => {
    if (!job?.biddingExpiresAt) {
      setMsRemaining(null);
      return;
    }
    const expiresAtMs: number = job.biddingExpiresAt.toMillis
      ? job.biddingExpiresAt.toMillis()
      : new Date(job.biddingExpiresAt).getTime();
    const tick = () => setMsRemaining(expiresAtMs - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [job?.biddingExpiresAt]);

  const rankedBids = rankBidsByRating(bids);

  const acceptBid = (bid: Bid) => {
    Alert.alert('Accept Offer?', `Accept ${bid.cleanerName ?? 'this cleaner'}'s offer of $${bid.bidPrice}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose payment', onPress: () => setPaymentChoiceBid(bid) },
    ]);
  };

  const submitAcceptance = async (bid: Bid, paymentMethod: string) => {
          if (!user) return;
          setBusyBidId(bid.id);
          try {
            const result = await callFunction<{ jobId: string; bidId: string; paymentMethod: string; idempotencyKey: string }, { redirectUrl?: string | null }>(
              'acceptBid', { jobId, bidId: bid.id, paymentMethod, idempotencyKey: `accept-${jobId}-${bid.id}` }
            );
            if (result.redirectUrl) {
              await WebBrowser.openBrowserAsync(result.redirectUrl, {
                presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
              });
            }
            acceptedLocally.current = true;
            router.replace({ pathname: '/booking/confirmation', params: { jobId: jobId! } });
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to accept offer. Please try again.');
          } finally {
            setBusyBidId(null);
          }
  };

  const rejectBid = async (bid: Bid) => {
    setBusyBidId(bid.id);
    try {
      await callFunction('rejectBid', { jobId, bidId: bid.id });
    } catch {
      Alert.alert('Error', 'Could not decline this offer. Please try again.');
    } finally {
      setBusyBidId(null);
    }
  };

  const submitBudgetIncrease = async () => {
    const value = parseFloat(newBudgetValue);
    const currentBudget = Number(job?.budget ?? 0);
    if (isNaN(value) || value <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive budget amount.');
      return;
    }
    if (currentBudget > 0 && value <= currentBudget) {
      Alert.alert('Invalid amount', `Enter an amount higher than your current budget ($${currentBudget}).`);
      return;
    }
    setIsSavingBudget(true);
    try {
      await callFunction('increaseJobBudget', { jobId, newBudget: value });
      setIsIncreasingBudget(false);
      setNewBudgetValue('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update the budget.');
    } finally {
      setIsSavingBudget(false);
    }
  };

  const cancelJob = async () => {
    Alert.alert('Cancel Job?', 'Are you sure you want to cancel this job?', [
      { text: 'Keep Job', style: 'cancel' },
      {
        text: 'Cancel Job',
        style: 'destructive',
        onPress: async () => {
          await callFunction('cancelBooking', { jobId, reason: 'Cancelled before assignment', idempotencyKey: `cancel-${jobId}-${Date.now()}` });
          router.replace('/home');
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#3906D2" size="large" />
      </View>
    );
  }

  const timeIsUp = msRemaining != null && msRemaining <= 0;

  return (
    <SafeAreaView className="flex-1 bg-[#F3F1FC]">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-ink/5">
          <ArrowLeft size={18} color="#150256" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-display font-black text-ink">Bids Received</Text>
          <Text className="font-sans text-xs text-ink/40 font-medium">
            {job?.serviceType} · #{jobId?.slice(-6).toUpperCase()}
          </Text>
        </View>
        <TouchableOpacity onPress={cancelJob} className="w-10 h-10 bg-red-50 rounded-2xl items-center justify-center">
          <X size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Budget + bidding-window timer card */}
      <View className="mx-5 mb-4 bg-white rounded-3xl p-4 border border-ink/5">
        <View className="flex-row items-center justify-between mb-1">
          <View>
            <Text className="text-2xl font-display font-black text-ink">
              {job?.budget && job.budget > 0 ? `$${job.budget}` : 'Open to Bids'}
            </Text>
            <Text className="font-sans text-xs text-ink/50 font-medium mt-0.5">
              {job?.budget && job.budget > 0 ? 'Your budget' : 'Cleaners quoting best prices'}
            </Text>
          </View>
          {msRemaining != null && (
            <View className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl ${timeIsUp ? 'bg-red-50' : 'bg-accent/10'}`}>
              <Timer size={14} color={timeIsUp ? '#ef4444' : '#3906D2'} />
              <Text className={`text-sm font-black ${timeIsUp ? 'text-red-500' : 'text-accent'}`}>
                {timeIsUp ? "Time's up" : formatCountdown(msRemaining)}
              </Text>
            </View>
          )}
        </View>

        {isIncreasingBudget ? (
          <View className="mt-3">
            <View className="flex-row items-center gap-2 border-2 border-accent/30 rounded-2xl px-4 py-1 mb-3">
              <Text className="text-lg font-display font-black text-ink/40">$</Text>
              <TextInput
                className="flex-1 py-3 text-lg font-display font-black text-ink"
                placeholder={
                  job?.budget && job.budget > 0
                    ? `More than $${job.budget}`
                    : 'Target budget (e.g. 50)'
                }
                placeholderTextColor="#9C94C4"
                keyboardType="decimal-pad"
                value={newBudgetValue}
                onChangeText={setNewBudgetValue}
                autoFocus
              />
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity onPress={() => setIsIncreasingBudget(false)} className="flex-1 py-3 rounded-2xl items-center border border-ink/10">
                <Text className="text-xs font-display font-black text-ink/50 uppercase">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitBudgetIncrease}
                disabled={isSavingBudget}
                className="flex-1 py-3 rounded-2xl items-center bg-accent"
              >
                {isSavingBudget ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-xs font-display font-black text-white uppercase">
                    {job?.budget && job.budget > 0 ? 'Confirm New Budget' : 'Set Budget'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setNewBudgetValue('');
              setIsIncreasingBudget(true);
            }}
            className="flex-row items-center justify-center gap-2 mt-3 py-3 rounded-2xl bg-accent/10"
            activeOpacity={0.8}
          >
            <TrendingUp size={16} color="#3906D2" />
            <Text className="text-xs font-display font-black text-accent uppercase tracking-wider">
              {job?.budget && job.budget > 0 ? 'Increase Budget' : '+ Set a Target Budget'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {rankedBids.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 bg-accent/10 rounded-3xl items-center justify-center mb-4">
            <ActivityIndicator color="#3906D2" size="large" />
          </View>
          <Text className="text-lg font-display font-black text-ink text-center mt-2">Waiting for offers…</Text>
          <Text className="font-sans text-sm text-ink/40 font-medium text-center mt-2">
            Cleaners in your area are reviewing your job and will place bids shortly
          </Text>
        </View>
      ) : (
        <FlatList
          data={rankedBids}
          keyExtractor={(b) => b.id}
          contentContainerClassName="px-5 pb-10 gap-4"
          ListHeaderComponent={() => (
            <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest mb-1">
              {rankedBids.length} Offer{rankedBids.length !== 1 ? 's' : ''} · Ranked by rating
            </Text>
          )}
          renderItem={({ item: bid }) => (
            <View className="bg-white rounded-[28px] p-5 border border-ink/5 shadow-sm">
              <View className="flex-row items-center gap-4 mb-4">
                <View className="w-14 h-14 bg-accent/10 rounded-3xl items-center justify-center">
                  <Text className="font-sans text-2xl">🧹</Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-display font-black text-ink">{bid.cleanerName ?? 'Professional Cleaner'}</Text>
                    {bid.cleanerEliteVerified && <ShieldCheck size={14} color="#3906D2" />}
                  </View>
                  <View className="flex-row items-center gap-3 mt-1">
                    <View className="flex-row items-center gap-1">
                      <Star size={12} color="#f59e0b" fill="#f59e0b" />
                      <Text className="text-xs font-display font-black text-ink/70">
                        {bid.cleanerRating != null ? bid.cleanerRating.toFixed(1) : IS_MOCK ? '4.8' : 'New'}
                      </Text>
                    </View>
                    <Text className="font-sans text-xs text-ink/40 font-medium">{bid.cleanerJobsCompleted ?? 0} jobs</Text>
                  </View>
                </View>
                <Text className="text-xl font-display font-black text-accent">${bid.bidPrice}</Text>
              </View>

              <View className="flex-row items-center gap-2 bg-ink/[0.03] rounded-2xl px-4 py-3 mb-4">
                <Clock size={14} color="#9C94C4" />
                <Text className="font-sans text-xs font-bold text-ink/60">Arrives in ~{bid.estimatedArrival} min</Text>
              </View>

              {bid.message && <Text className="font-sans text-sm text-ink/60 font-medium mb-4 italic">"{bid.message}"</Text>}

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => rejectBid(bid)}
                  disabled={busyBidId === bid.id}
                  className="flex-1 py-3 rounded-2xl items-center border-2 border-ink/10"
                >
                  <Text className="text-xs font-display font-black text-ink/50 uppercase tracking-widest">Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => acceptBid(bid)}
                  disabled={!!busyBidId}
                  activeOpacity={0.85}
                  className="flex-1 py-3 rounded-2xl items-center bg-accent shadow-md shadow-accent/30 flex-row justify-center gap-1.5"
                >
                  {busyBidId === bid.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Check size={14} color="#fff" />
                      <Text className="text-white font-display font-black text-xs uppercase tracking-widest">Accept</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListFooterComponent={() => (
            <View className="bg-emerald-50 rounded-3xl p-4 mt-2 flex-row items-center gap-3">
              <ShieldCheck size={20} color="#0FB77A" />
              <Text className="font-sans flex-1 text-xs font-bold text-emerald-800 leading-snug">
                Detail Trust Guarantee — all professionals undergo background checks. Chat unlocks the
                moment you accept an offer.
              </Text>
            </View>
          )}
        />
      )}
      <Modal visible={!!paymentChoiceBid} transparent animationType="fade" onRequestClose={() => setPaymentChoiceBid(null)}>
        <View className="flex-1 bg-black/50 justify-center px-6"><View className="bg-white rounded-3xl p-5">
          <Text className="text-xl font-display font-black text-slate-900 mb-1">Choose payment</Text><Text className="font-sans text-sm text-slate-500 mb-4">BuySafe holds your payment. Direct payments go to the cleaner and do not include escrow protection.</Text>
          {[
            { label: IS_MOCK ? 'Detail Wallet (test)' : 'Paynow BuySafe', method: IS_MOCK ? 'WALLET' : 'PAYNOW' },
            { label: 'Cash to cleaner', method: 'CASH' },
            { label: 'EcoCash to cleaner', method: 'ECOCASH' },
            { label: 'InnBucks to cleaner', method: 'INNBUCKS' },
          ].map(option => <TouchableOpacity key={option.method} onPress={() => { const bid = paymentChoiceBid; setPaymentChoiceBid(null); if (bid) void submitAcceptance(bid, option.method); }} className="py-3 border-b border-slate-100"><Text className="font-sans font-bold text-slate-800">{option.label}</Text></TouchableOpacity>)}
          <TouchableOpacity onPress={() => setPaymentChoiceBid(null)} className="pt-4"><Text className="font-sans text-center font-bold text-slate-400">Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}
