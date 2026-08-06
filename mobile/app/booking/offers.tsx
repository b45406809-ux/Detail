// "Bids Received" — compare offers, negotiate a counter-price inline or hop
// into chat, then accept. Mirrors the reference "3 Top Offers" screen.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock, Star, ShieldCheck, X, Check, MessageCircle, ArrowLeftRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { db, doc, collection, query, where, onSnapshot, updateDoc } from '../../services/firebase';
import { callFunction } from '../../services/functions';
import { Job, Bid, JobStatus } from '../../types';
import { IS_DEV } from '../../utils/env';

export default function OffersScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyBidId, setBusyBidId] = useState<string | null>(null);
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [counterValue, setCounterValue] = useState('');

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

  // Redirect automatically once a bid is accepted elsewhere (job leaves BIDDING).
  useEffect(() => {
    if (job && job.status !== JobStatus.BIDDING && job.status !== JobStatus.PENDING) {
      router.replace({ pathname: '/tracking/[jobId]', params: { jobId: jobId! } });
    }
  }, [job?.status]);

  const acceptBid = (bid: Bid) => {
    Alert.alert('Accept Offer?', `Accept ${bid.cleanerName ?? 'this cleaner'}'s offer of $${bid.bidPrice}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          if (!user) return;
          setBusyBidId(bid.id);
          try {
            await callFunction('acceptBid', { jobId, bidId: bid.id });
            router.replace({ pathname: '/tracking/[jobId]', params: { jobId: jobId! } });
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to accept offer. Please try again.');
          } finally {
            setBusyBidId(null);
          }
        },
      },
    ]);
  };

  const rejectBid = async (bid: Bid) => {
    setBusyBidId(bid.id);
    try {
      await updateDoc(doc(db, 'bids', bid.id), { status: 'REJECTED' });
    } catch {
      Alert.alert('Error', 'Could not decline this offer. Please try again.');
    } finally {
      setBusyBidId(null);
    }
  };

  const sendCounter = async (bid: Bid) => {
    const price = parseFloat(counterValue);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid counter price.');
      return;
    }
    setBusyBidId(bid.id);
    try {
      await callFunction('counterOffer', { jobId, bidId: bid.id, price });
      setCounteringId(null);
      setCounterValue('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not send counter-offer.');
    } finally {
      setBusyBidId(null);
    }
  };

  const cancelJob = async () => {
    Alert.alert('Cancel Job?', 'Are you sure you want to cancel this job?', [
      { text: 'Keep Job', style: 'cancel' },
      {
        text: 'Cancel Job',
        style: 'destructive',
        onPress: async () => {
          await updateDoc(doc(db, 'jobs', jobId!), { status: JobStatus.CANCELLED });
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

  return (
    <SafeAreaView className="flex-1 bg-[#F3F1FC]">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-ink/5">
          <ArrowLeft size={18} color="#150256" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-black text-ink">Bids Received</Text>
          <Text className="text-xs text-ink/40 font-medium">
            {job?.serviceType} · #{jobId?.slice(-6).toUpperCase()}
          </Text>
        </View>
        <TouchableOpacity onPress={cancelJob} className="w-10 h-10 bg-red-50 rounded-2xl items-center justify-center">
          <X size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {bids.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 bg-accent/10 rounded-3xl items-center justify-center mb-4">
            <ActivityIndicator color="#3906D2" size="large" />
          </View>
          <Text className="text-lg font-black text-ink text-center mt-2">Waiting for offers…</Text>
          <Text className="text-sm text-ink/40 font-medium text-center mt-2">
            Cleaners in your area are reviewing your job and will place bids shortly
          </Text>
        </View>
      ) : (
        <FlatList
          data={bids}
          keyExtractor={(b) => b.id}
          contentContainerClassName="px-5 pb-10 gap-4"
          ListHeaderComponent={() => (
            <View className="bg-white rounded-3xl p-4 border border-ink/5 mb-2">
              <Text className="text-xs font-black text-ink/40 uppercase tracking-widest mb-1">
                {bids.length} Offer{bids.length !== 1 ? 's' : ''} Received
              </Text>
              <Text className="text-2xl font-black text-ink">
                {job?.budgetMin || job?.budgetMax
                  ? `$${job?.budgetMin ?? 0} – $${job?.budgetMax ?? '—'}`
                  : job?.customerBid
                  ? `$${job.customerBid}`
                  : 'Review offers below'}
              </Text>
              <Text className="text-xs text-ink/50 font-medium mt-0.5">Your target budget</Text>
            </View>
          )}
          renderItem={({ item: bid }) => {
            const isCountering = counteringId === bid.id;
            return (
              <View className="bg-white rounded-[28px] p-5 border border-ink/5 shadow-sm">
                <View className="flex-row items-center gap-4 mb-4">
                  <View className="w-14 h-14 bg-accent/10 rounded-3xl items-center justify-center">
                    <Text className="text-2xl">🧹</Text>
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-base font-black text-ink">{bid.cleanerName ?? 'Professional Cleaner'}</Text>
                      {bid.cleanerEliteVerified && <ShieldCheck size={14} color="#3906D2" />}
                    </View>
                    <View className="flex-row items-center gap-3 mt-1">
                      <View className="flex-row items-center gap-1">
                        <Star size={12} color="#f59e0b" fill="#f59e0b" />
                        <Text className="text-xs font-black text-ink/70">
                          {bid.cleanerRating != null ? bid.cleanerRating.toFixed(1) : IS_DEV ? '4.8' : 'New'}
                        </Text>
                      </View>
                      <Text className="text-xs text-ink/40 font-medium">{bid.cleanerJobsCompleted ?? 0} jobs</Text>
                    </View>
                  </View>
                  <View className="items-end">
                    <Text className="text-xl font-black text-accent">${bid.bidPrice}</Text>
                    {bid.status === 'COUNTERED' && (
                      <Text className="text-[10px] text-warning font-black uppercase tracking-wider mt-0.5">Negotiating</Text>
                    )}
                  </View>
                </View>

                <View className="flex-row items-center gap-2 bg-ink/[0.03] rounded-2xl px-4 py-3 mb-4">
                  <Clock size={14} color="#9C94C4" />
                  <Text className="text-xs font-bold text-ink/60">Arrives in ~{bid.estimatedArrival} min</Text>
                </View>

                {bid.message && <Text className="text-sm text-ink/60 font-medium mb-4 italic">"{bid.message}"</Text>}

                {isCountering ? (
                  <View className="mb-4">
                    <View className="flex-row items-center gap-2 border-2 border-accent/30 rounded-2xl px-4 py-1 mb-3">
                      <Text className="text-lg font-black text-ink/40">$</Text>
                      <TextInput
                        className="flex-1 py-3 text-lg font-black text-ink"
                        placeholder="Your counter price"
                        placeholderTextColor="#9C94C4"
                        keyboardType="decimal-pad"
                        value={counterValue}
                        onChangeText={setCounterValue}
                        autoFocus
                      />
                    </View>
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        onPress={() => setCounteringId(null)}
                        className="flex-1 py-3 rounded-2xl items-center border border-ink/10"
                      >
                        <Text className="text-xs font-black text-ink/50 uppercase">Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => sendCounter(bid)}
                        disabled={busyBidId === bid.id}
                        className="flex-1 py-3 rounded-2xl items-center bg-accent"
                      >
                        {busyBidId === bid.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text className="text-xs font-black text-white uppercase">Send Offer</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row gap-2 mb-3">
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/messages', params: { jobId, cleanerId: bid.cleanerId } })}
                      className="w-12 h-12 rounded-2xl items-center justify-center bg-ink/5"
                    >
                      <MessageCircle size={18} color="#150256" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setCounteringId(bid.id);
                        setCounterValue(String(bid.bidPrice));
                      }}
                      className="w-12 h-12 rounded-2xl items-center justify-center bg-ink/5"
                    >
                      <ArrowLeftRight size={18} color="#150256" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => rejectBid(bid)}
                      disabled={busyBidId === bid.id}
                      className="flex-1 py-3 rounded-2xl items-center border-2 border-ink/10"
                    >
                      <Text className="text-xs font-black text-ink/50 uppercase tracking-widest">Decline</Text>
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
                          <Text className="text-white font-black text-xs uppercase tracking-widest">Accept</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ListFooterComponent={() => (
            <View className="bg-emerald-50 rounded-3xl p-4 mt-2 flex-row items-center gap-3">
              <ShieldCheck size={20} color="#0FB77A" />
              <Text className="flex-1 text-xs font-bold text-emerald-800 leading-snug">
                Detail Trust Guarantee — all professionals undergo background checks. Payments are held until you confirm the job.
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
