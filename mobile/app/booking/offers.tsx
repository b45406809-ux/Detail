import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock, Star, ShieldCheck, X, Check } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import {
  db,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  updateDoc,
} from '../../../services/firebase';
import { Job, Bid, JobStatus } from '../../../types';
import { IS_DEV } from '../../../utils/env';

export default function OffersScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);

  // Live job listener — catches status changes (e.g., another session accepted a bid)
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
    const q = query(
      collection(db, 'bids'),
      where('jobId', '==', jobId),
      where('status', '==', 'PENDING')
    );
    return onSnapshot(q, (snap) => {
      setBids(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Bid)));
    });
  }, [jobId]);

  const acceptBid = async (bid: Bid) => {
    Alert.alert(
      'Accept Offer?',
      `Accept ${bid.cleanerName ?? 'this cleaner'}'s offer of $${bid.bidPrice}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            if (!user) return;
            if (job?.customerId !== user.uid) {
              Alert.alert('Unauthorized', 'Only the job owner can accept offers.');
              return;
            }
            setAcceptingBidId(bid.id);
            try {
              await runTransaction(db, async (transaction) => {
                const jobSnap = await transaction.get(doc(db, 'jobs', jobId!));
                if (!jobSnap.exists()) throw new Error('Job not found');
                if (jobSnap.data().status !== JobStatus.BIDDING) {
                  throw new Error('This job is no longer accepting bids');
                }
                transaction.update(doc(db, 'bids', bid.id), { status: 'ACCEPTED' });
                transaction.update(doc(db, 'jobs', jobId!), {
                  status: JobStatus.ACCEPTED,
                  cleanerId: bid.cleanerId,
                  cleanerName: bid.cleanerName,
                  cleanerPhoto: bid.cleanerPhoto,
                  price: bid.bidPrice,
                  acceptedAt: serverTimestamp(),
                });
              });
              router.replace({ pathname: '/tracking/[jobId]', params: { jobId: jobId! } });
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to accept offer. Please try again.');
            } finally {
              setAcceptingBidId(null);
            }
          },
        },
      ]
    );
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
        <ActivityIndicator color="#3906d2" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-slate-100"
        >
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-black text-slate-900">Incoming Offers</Text>
          <Text className="text-xs text-slate-400 font-medium">
            {job?.serviceType} · #{jobId?.slice(-6).toUpperCase()}
          </Text>
        </View>
        <TouchableOpacity
          onPress={cancelJob}
          className="w-10 h-10 bg-red-50 rounded-2xl items-center justify-center"
        >
          <X size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Waiting state */}
      {bids.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 bg-accent/10 rounded-3xl items-center justify-center mb-4">
            <ActivityIndicator color="#3906d2" size="large" />
          </View>
          <Text className="text-lg font-black text-slate-900 text-center mt-2">
            Waiting for offers…
          </Text>
          <Text className="text-sm text-slate-400 font-medium text-center mt-2">
            Cleaners in your area are reviewing your job and will place bids shortly
          </Text>
        </View>
      ) : (
        <FlatList
          data={bids}
          keyExtractor={(b) => b.id}
          contentContainerClassName="px-5 pb-10 gap-4"
          ListHeaderComponent={() => (
            <View className="bg-white rounded-3xl p-4 border border-slate-100 mb-2">
              <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                Your bid
              </Text>
              <Text className="text-2xl font-black text-slate-900">
                ${job?.customerBid ?? '—'}
              </Text>
              <Text className="text-xs text-slate-500 font-medium">
                {bids.length} offer{bids.length !== 1 ? 's' : ''} received
              </Text>
            </View>
          )}
          renderItem={({ item: bid }) => (
            <View className="bg-white rounded-4xl p-5 border border-slate-100 shadow-sm">
              {/* Cleaner info */}
              <View className="flex-row items-center gap-4 mb-4">
                <View className="w-14 h-14 bg-accent/10 rounded-3xl items-center justify-center">
                  <Text className="text-2xl">🧹</Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-black text-slate-900">
                      {bid.cleanerName ?? 'Professional Cleaner'}
                    </Text>
                    <ShieldCheck size={14} color="#3906d2" />
                  </View>
                  <View className="flex-row items-center gap-3 mt-1">
                    <View className="flex-row items-center gap-1">
                      <Star size={12} color="#f59e0b" fill="#f59e0b" />
                      <Text className="text-xs font-black text-slate-700">
                        {bid.cleanerRating != null
                          ? bid.cleanerRating.toFixed(1)
                          : IS_DEV
                          ? '4.8'
                          : 'New'}
                      </Text>
                    </View>
                    <Text className="text-xs text-slate-400 font-medium">
                      {bid.cleanerJobsCompleted ?? 0} jobs
                    </Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-xl font-black text-accent">${bid.bidPrice}</Text>
                  <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Offer
                  </Text>
                </View>
              </View>

              {/* ETA & message */}
              <View className="flex-row items-center gap-2 bg-slate-50 rounded-2xl px-4 py-3 mb-4">
                <Clock size={14} color="#94a3b8" />
                <Text className="text-xs font-bold text-slate-600">
                  Arrives in ~{bid.estimatedArrival} min
                </Text>
              </View>

              {bid.message && (
                <Text className="text-sm text-slate-600 font-medium mb-4 italic">
                  "{bid.message}"
                </Text>
              )}

              {/* Accept button */}
              <TouchableOpacity
                onPress={() => acceptBid(bid)}
                disabled={!!acceptingBidId}
                activeOpacity={0.85}
                className="bg-accent py-4 rounded-2xl flex-row items-center justify-center gap-2 shadow-md shadow-accent/30"
              >
                {acceptingBidId === bid.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Check size={18} color="#fff" />
                    <Text className="text-white font-black text-sm uppercase tracking-widest">
                      Accept · ${bid.bidPrice}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
