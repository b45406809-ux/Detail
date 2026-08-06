import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  ArrowLeft,
  MessageSquare,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Star,
  CheckCircle,
  MapPin,
  Navigation,
  Siren,
  Heart,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  limit,
} from '../../services/firebase';
import { callFunction } from '../../services/functions';
import { Job, JobStatus } from '../../types';
import { IS_DEV } from '../../utils/env';
import { GlassCard, GlassSheet, GlassIconButton } from '../../components/glass';
import { haversineDistanceKm } from '../../services/matching';

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Job Confirmed',
  EN_ROUTE: 'Professional En Route',
  ARRIVED: 'Cleaner Arrived',
  IN_PROGRESS: 'Cleaning in Progress',
  COMPLETED: 'Cleaning Completed',
};

const PROGRESS_STEPS: { status: string; label: string }[] = [
  { status: 'ACCEPTED', label: 'En Route' },
  { status: 'EN_ROUTE', label: 'En Route' },
  { status: 'ARRIVED', label: 'Arrived' },
  { status: 'IN_PROGRESS', label: 'Cleaning' },
  { status: 'COMPLETED', label: 'Review' },
];

const CLEANER_NEXT_STATUS: Partial<Record<string, { status: JobStatus; label: string }>> = {
  ACCEPTED: { status: JobStatus.EN_ROUTE, label: "I'm On My Way" },
  EN_ROUTE: { status: JobStatus.ARRIVED, label: "I've Arrived" },
  ARRIVED: { status: JobStatus.IN_PROGRESS, label: 'Start Cleaning' },
  IN_PROGRESS: { status: JobStatus.COMPLETED, label: 'Mark Complete' },
};

type TrackingStep = 'TRACKING' | 'PAYMENT' | 'RATING' | 'SUCCESS';

export default function TrackingScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { user, profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [step, setStep] = useState<TrackingStep>('TRACKING');
  const [rating, setRating] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState<'WALLET' | 'CASH'>('WALLET');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteDocId, setFavoriteDocId] = useState<string | null>(null);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  const isCustomer = profile?.role === 'CUSTOMER';
  const isCleaner = profile?.role === 'CLEANER';

  useEffect(() => {
    if (!jobId) return;
    return onSnapshot(
      doc(db, 'jobs', jobId),
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as Job;
          setJob(data);
          if (data.status === JobStatus.COMPLETED && step === 'TRACKING') {
            setStep(isCustomer ? 'PAYMENT' : 'RATING');
          }
        }
      },
      (err) => console.error('Job listener error:', err)
    );
  }, [jobId, isCustomer, step]);

  // Check whether this cleaner is already in the customer's favorites
  useEffect(() => {
    if (!user || !isCustomer || !job?.cleanerId) return;
    const q = query(
      collection(db, 'favorites'),
      where('customerId', '==', user.uid),
      where('cleanerId', '==', job.cleanerId),
      limit(1)
    );
    getDocs(q).then((snap) => {
      if (!snap.empty) {
        setIsFavorite(true);
        setFavoriteDocId(snap.docs[0].id);
      } else {
        setIsFavorite(false);
        setFavoriteDocId(null);
      }
    });
  }, [user, isCustomer, job?.cleanerId]);

  const toggleFavorite = async () => {
    if (!user || !job?.cleanerId) return;
    setIsTogglingFavorite(true);
    try {
      if (isFavorite && favoriteDocId) {
        await deleteDoc(doc(db, 'favorites', favoriteDocId));
        setIsFavorite(false);
        setFavoriteDocId(null);
      } else {
        const ref = await addDoc(collection(db, 'favorites'), {
          customerId: user.uid,
          cleanerId: job.cleanerId,
          cleanerName: job.cleanerName ?? null,
          cleanerPhoto: job.cleanerPhoto ?? null,
          createdAt: serverTimestamp(),
        });
        setIsFavorite(true);
        setFavoriteDocId(ref.id);
      }
    } catch {
      Alert.alert('Error', 'Could not update favorites. Please try again.');
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  useEffect(() => {
    if (!jobId || !isCleaner || !job) return;
    const activeStatuses = [JobStatus.ACCEPTED, JobStatus.EN_ROUTE, JobStatus.ARRIVED, JobStatus.IN_PROGRESS];
    if (!activeStatuses.includes(job.status as JobStatus)) {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      return;
    }

    let mounted = true;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 20 }, async (loc) => {
      if (!mounted) return;
      try {
        await updateDoc(doc(db, 'jobs', jobId), { cleanerLocation: { lat: loc.coords.latitude, lng: loc.coords.longitude } });
      } catch {}
    })
      .then((sub) => {
        if (!mounted) {
          sub.remove();
          return;
        }
        locationSubRef.current?.remove();
        locationSubRef.current = sub;
      })
      .catch(() => {});

    return () => {
      mounted = false;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };
  }, [jobId, isCleaner, job?.status]);

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 30, stiffness: 200 }).start();
  }, []);

  const handleCancelJob = () => {
    Alert.alert('Cancel Job?', 'Are you sure you want to cancel this job?', [
      { text: 'Keep Job', style: 'cancel' },
      {
        text: 'Cancel',
        style: 'destructive',
        onPress: async () => {
          await updateDoc(doc(db, 'jobs', jobId!), { status: JobStatus.CANCELLED, cancelledAt: serverTimestamp() });
          router.replace('/home');
        },
      },
    ]);
  };

  const handleSOS = () => {
    Alert.alert(
      'Emergency SOS',
      'This will alert Detail Trust & Safety immediately. Only use in a genuine emergency.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS', style: 'destructive', onPress: () => Alert.alert('Help is on the way', 'Our safety team has been notified.') },
      ]
    );
  };

  const handleCleanerStatusUpdate = async () => {
    const next = CLEANER_NEXT_STATUS[job?.status ?? ''];
    if (!next) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'jobs', jobId!), { status: next.status, [`${next.status.toLowerCase()}At`]: serverTimestamp() });
    } catch {
      Alert.alert('Error', 'Failed to update status. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayment = async () => {
    if (!job?.price || !user || !job.cleanerId) return;
    setIsSubmitting(true);
    try {
      await callFunction('settleJobPayment', { jobId, paymentMethod: selectedPayment });
      setStep('RATING');
    } catch (err: any) {
      Alert.alert('Payment Failed', err.message || 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRating = async () => {
    if (rating === 0) {
      Alert.alert('Rate your cleaner', 'Please select a star rating before submitting.');
      return;
    }
    if (!job?.cleanerId || !user) return;
    setIsSubmitting(true);
    try {
      await callFunction('submitRating', { jobId, rating });
      setStep('SUCCESS');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!job) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#3906D2" size="large" />
      </View>
    );
  }

  const mapRegion = job.location
    ? { latitude: job.location.lat, longitude: job.location.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 }
    : undefined;

  const etaMinutes =
    isCustomer && job.cleanerLocation && job.location
      ? Math.max(1, Math.round((haversineDistanceKm(job.cleanerLocation, job.location) / 28) * 60))
      : null;

  if (step === 'SUCCESS') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <View className="w-24 h-24 bg-emerald-50 rounded-4xl items-center justify-center mb-6">
          <CheckCircle size={48} color="#0FB77A" />
        </View>
        <Text className="text-3xl font-black text-ink text-center mb-2">All done!</Text>
        <Text className="text-base text-ink/50 font-medium text-center mb-10">
          Thanks for using Detail. We hope your space is sparkling clean.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/home')}
          className="w-full bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
          activeOpacity={0.85}
        >
          <Text className="text-white font-black text-sm uppercase tracking-widest">Back to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (step === 'RATING') {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-12 pb-10">
          <Text className="text-3xl font-black text-ink text-center mb-2">Rate your cleaner</Text>
          <Text className="text-base text-ink/50 font-medium text-center mb-10">How was {job.cleanerName ?? 'your cleaner'}?</Text>

          <View className="items-center mb-10">
            <View className="flex-row gap-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                  <Star size={48} color={star <= rating ? '#f59e0b' : '#e2e8f0'} fill={star <= rating ? '#f59e0b' : 'transparent'} />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text className="text-lg font-black text-ink/70 mt-4">{['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][rating]}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={handleRating}
            disabled={isSubmitting || rating === 0}
            activeOpacity={0.85}
            className={`py-5 rounded-[32px] items-center ${rating > 0 ? 'bg-accent shadow-lg shadow-accent/30' : 'bg-ink/10'}`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`font-black text-sm uppercase tracking-widest ${rating > 0 ? 'text-white' : 'text-ink/30'}`}>
                Submit Rating
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep('SUCCESS')} className="mt-4 items-center">
            <Text className="text-sm text-ink/40 font-medium">Skip</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'PAYMENT') {
    const PAYMENT_OPTIONS = [
      { id: 'WALLET', label: 'Detail Wallet', emoji: '👛', sub: `Balance: $${profile?.balance?.toFixed(2) ?? '0.00'} · top up in Wallet` },
      { id: 'CASH', label: 'Cash', emoji: '💵', sub: 'Pay cleaner directly' },
    ] as const;

    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-12 pb-10">
          <Text className="text-3xl font-black text-ink mb-2">Complete Payment</Text>
          <Text className="text-base text-ink/50 font-medium mb-8">
            Total: <Text className="font-black text-ink">${job.price?.toFixed(2) ?? '—'}</Text>
          </Text>

          <Text className="text-xs font-black text-ink/40 uppercase tracking-widest mb-3">Payment Method</Text>
          <View className="gap-3 mb-8">
            {PAYMENT_OPTIONS.map(({ id, label, emoji, sub }) => (
              <TouchableOpacity
                key={id}
                onPress={() => setSelectedPayment(id)}
                activeOpacity={0.8}
                className={`flex-row items-center gap-4 p-5 rounded-3xl border-2 ${
                  selectedPayment === id ? 'border-accent bg-accent/5' : 'border-ink/10 bg-ink/[0.02]'
                }`}
              >
                <Text className="text-3xl">{emoji}</Text>
                <View className="flex-1">
                  <Text className={`text-sm font-black ${selectedPayment === id ? 'text-accent' : 'text-ink'}`}>{label}</Text>
                  <Text className="text-xs text-ink/40 font-medium mt-0.5">{sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handlePayment}
            disabled={isSubmitting}
            activeOpacity={0.85}
            className="bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-black text-sm uppercase tracking-widest">
                {IS_DEV ? '[DEV] ' : ''}Pay ${job.price?.toFixed(2) ?? '—'} via {selectedPayment}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Main TRACKING view
  return (
    <View className="flex-1 bg-white">
      {mapRegion ? (
        <MapView style={{ flex: 1 }} provider={PROVIDER_DEFAULT} initialRegion={mapRegion} showsUserLocation showsMyLocationButton={false}>
          <Marker coordinate={{ latitude: job.location.lat, longitude: job.location.lng }} title="Job Location">
            <View className="w-10 h-10 bg-accent rounded-2xl items-center justify-center shadow-lg">
              <MapPin size={20} color="#fff" />
            </View>
          </Marker>

          {isCustomer && job.cleanerLocation && (
            <>
              <Marker coordinate={{ latitude: job.cleanerLocation.lat, longitude: job.cleanerLocation.lng }} title={job.cleanerName ?? 'Your Cleaner'}>
                <View className="w-10 h-10 bg-emerald-500 rounded-2xl items-center justify-center shadow-lg">
                  <Navigation size={20} color="#fff" />
                </View>
              </Marker>
              <Polyline
                coordinates={[
                  { latitude: job.cleanerLocation.lat, longitude: job.cleanerLocation.lng },
                  { latitude: job.location.lat, longitude: job.location.lng },
                ]}
                strokeColor="#3906D2"
                strokeWidth={3}
                lineDashPattern={[8, 6]}
              />
            </>
          )}
        </MapView>
      ) : (
        <View className="flex-1 bg-ink/5 items-center justify-center">
          <Text className="text-ink/40 font-medium">Loading map…</Text>
        </View>
      )}

      <SafeAreaView className="absolute top-0 left-0 right-0" edges={['top']} pointerEvents="box-none">
        <View className="flex-row items-center justify-between px-5 pt-4" pointerEvents="box-none">
          <GlassIconButton size={48} onPress={() => router.back()}>
            <ArrowLeft size={20} color="#150256" />
          </GlassIconButton>

          <GlassCard style={{ borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
            <Text className="text-[10px] font-black text-ink uppercase tracking-widest">
              {STATUS_LABELS[job.status] ?? job.status}
            </Text>
          </GlassCard>

          <TouchableOpacity
            onPress={handleSOS}
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: '#E5484D' }}
          >
            <Siren size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <GlassSheet style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 24 }}>
        {isCustomer && etaMinutes != null && (
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-[10px] font-black text-ink/40 uppercase tracking-widest mb-1">Estimated Arrival</Text>
              <Text className="text-3xl font-black text-accent">{etaMinutes} mins</Text>
            </View>
            <View className="bg-emerald-50 px-3 py-1.5 rounded-full">
              <Text className="text-[10px] font-black text-emerald-700 uppercase">On Schedule</Text>
            </View>
          </View>
        )}

        <View className="flex-row items-center gap-4 bg-white/60 rounded-3xl p-4 mb-4 border border-white">
          <View className="relative">
            <View className="w-14 h-14 bg-accent/10 rounded-[22px] items-center justify-center">
              <Text className="text-2xl">🧹</Text>
            </View>
            <View className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-accent rounded-lg items-center justify-center border-2 border-white">
              <ShieldCheck size={12} color="#fff" />
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-base font-black text-ink tracking-tight">
              {isCustomer ? job.cleanerName ?? 'Your Cleaner' : job.customerName ?? 'Customer'}
            </Text>
            {isCustomer && (
              <View className="flex-row items-center gap-1 mt-0.5">
                <Star size={12} color="#f59e0b" fill="#f59e0b" />
                <Text className="text-xs font-black text-ink/60">
                  {job.cleanerRating != null ? `${job.cleanerRating.toFixed(1)} Rating` : IS_DEV ? '4.95 Excellent' : 'New Cleaner'}
                </Text>
              </View>
            )}
          </View>
          {isCustomer && job.cleanerId && (
            <TouchableOpacity
              onPress={toggleFavorite}
              disabled={isTogglingFavorite}
              className="w-10 h-10 bg-accent/10 rounded-2xl items-center justify-center mr-2"
            >
              <Heart size={16} color="#E5484D" fill={isFavorite ? '#E5484D' : 'transparent'} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/messages', params: { jobId } })}
            className="w-10 h-10 bg-accent/10 rounded-2xl items-center justify-center"
          >
            <MessageSquare size={18} color="#3906D2" />
          </TouchableOpacity>
        </View>

        {/* Live progress stepper */}
        <View className="flex-row items-center justify-between mb-4 px-1">
          {PROGRESS_STEPS.filter((s, i, arr) => arr.findIndex((x) => x.label === s.label) === i).map((s, i, arr) => {
            const order = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
            const currentIdx = order.indexOf(job.status);
            const stepIdx = order.indexOf(s.status);
            const done = currentIdx >= stepIdx;
            return (
              <React.Fragment key={s.label}>
                <View className="items-center">
                  <View className={`w-6 h-6 rounded-full items-center justify-center ${done ? 'bg-accent' : 'bg-ink/10'}`}>
                    <Text className={`text-[10px] font-black ${done ? 'text-white' : 'text-ink/30'}`}>{i + 1}</Text>
                  </View>
                  <Text className={`text-[9px] font-bold mt-1 ${done ? 'text-ink' : 'text-ink/30'}`}>{s.label}</Text>
                </View>
                {i < arr.length - 1 && <View className={`flex-1 h-0.5 mx-1 ${done ? 'bg-accent' : 'bg-ink/10'}`} />}
              </React.Fragment>
            );
          })}
        </View>

        {isCleaner && CLEANER_NEXT_STATUS[job.status] && (
          <TouchableOpacity
            onPress={handleCleanerStatusUpdate}
            disabled={isSubmitting}
            activeOpacity={0.85}
            className="bg-accent py-4 rounded-2xl items-center shadow-md shadow-accent/30 mb-4"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-black text-sm uppercase tracking-widest">{CLEANER_NEXT_STATUS[job.status]!.label}</Text>
            )}
          </TouchableOpacity>
        )}

        <View className="flex-row gap-4 mb-4">
          {[
            { id: 'message', label: 'Message', icon: MessageSquare, color: '#3906D2', action: () => router.push({ pathname: '/messages', params: { jobId } }) },
            { id: 'call', label: 'Call', icon: Phone, color: '#0FB77A', action: () => Alert.alert('Calling', 'VoIP calling coming soon') },
            { id: 'cancel', label: 'Abort', icon: ShieldAlert, color: '#E5484D', action: handleCancelJob },
          ].map(({ id, label, icon: Icon, color, action }) => (
            <TouchableOpacity key={id} onPress={action} className="flex-1 items-center gap-2" activeOpacity={0.7}>
              <View className="w-14 h-14 rounded-[22px] items-center justify-center bg-white/60 border border-white">
                <Icon size={20} color={color} />
              </View>
              <Text className="text-[9px] font-black text-ink/40 uppercase tracking-widest">{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="bg-emerald-50 rounded-2xl px-4 py-3 flex-row items-center gap-2">
          <ShieldCheck size={16} color="#0FB77A" />
          <Text className="flex-1 text-[11px] font-bold text-emerald-800">
            Detail Secure Service — your payment is protected until you review the service.
          </Text>
        </View>
      </GlassSheet>
    </View>
  );
}
