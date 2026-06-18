import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  ArrowLeft,
  MessageSquare,
  Phone,
  ShieldAlert,
  Settings2,
  ShieldCheck,
  Star,
  CheckCircle,
  MapPin,
  Navigation,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import {
  db,
  doc,
  collection,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  runTransaction,
  increment,
  addDoc,
} from '../../../services/firebase';
import { Job, JobStatus } from '../../../types';
import { IS_DEV } from '../../../utils/env';

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Job Confirmed',
  EN_ROUTE: 'Cleaner Arriving',
  ARRIVED: 'Cleaner Arrived',
  IN_PROGRESS: 'Cleaning in Progress',
  COMPLETED: 'Cleaning Completed',
};

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
  const [selectedPayment, setSelectedPayment] = useState<'CARD' | 'CASH' | 'WALLET'>('WALLET');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  const isCustomer = profile?.role === 'CUSTOMER';
  const isCleaner = profile?.role === 'CLEANER';

  // Live job listener
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

  // Cleaner location broadcasting — only while job is active
  useEffect(() => {
    if (!jobId || !isCleaner || !job) return;

    const activeStatuses = [
      JobStatus.ACCEPTED,
      JobStatus.EN_ROUTE,
      JobStatus.ARRIVED,
      JobStatus.IN_PROGRESS,
    ];
    if (!activeStatuses.includes(job.status as JobStatus)) {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      return;
    }

    let mounted = true;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 20 },
      async (loc) => {
        if (!mounted) return;
        try {
          await updateDoc(doc(db, 'jobs', jobId), {
            cleanerLocation: { lat: loc.coords.latitude, lng: loc.coords.longitude },
          });
        } catch {}
      }
    )
      .then((sub) => {
        if (!mounted) {
          sub.remove();
          return;
        }
        locationSubRef.current?.remove();
        locationSubRef.current = sub;
      })
      .catch(() => {
        // Location permission denied or unavailable — tracking degrades gracefully
      });

    return () => {
      mounted = false;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };
  }, [jobId, isCleaner, job?.status]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 30,
      stiffness: 200,
    }).start();
  }, []);

  const handleCancelJob = () => {
    Alert.alert('Cancel Job?', 'Are you sure you want to cancel this job?', [
      { text: 'Keep Job', style: 'cancel' },
      {
        text: 'Cancel',
        style: 'destructive',
        onPress: async () => {
          await updateDoc(doc(db, 'jobs', jobId!), {
            status: JobStatus.CANCELLED,
            cancelledAt: serverTimestamp(),
          });
          router.replace('/home');
        },
      },
    ]);
  };

  const handleCleanerStatusUpdate = async () => {
    const next = CLEANER_NEXT_STATUS[job?.status ?? ''];
    if (!next) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'jobs', jobId!), {
        status: next.status,
        [`${next.status.toLowerCase()}At`]: serverTimestamp(),
      });
    } catch {
      Alert.alert('Error', 'Failed to update status. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayment = async () => {
    if (!job?.price || !user || !job.cleanerId) return;
    const price = job.price;
    setIsSubmitting(true);

    try {
      if (selectedPayment === 'WALLET') {
        await runTransaction(db, async (transaction) => {
          const customerRef = doc(db, 'users', user.uid);
          const cleanerRef = doc(db, 'users', job.cleanerId!);
          const customerSnap = await transaction.get(customerRef);
          const cleanerSnap = await transaction.get(cleanerRef);

          if (!customerSnap.exists() || !cleanerSnap.exists()) {
            throw new Error('Account data not found');
          }

          const balance = customerSnap.data().balance ?? 0;
          if (balance < price) {
            throw new Error(
              `Insufficient balance. You have $${balance.toFixed(2)} but need $${price.toFixed(2)}.`
            );
          }

          // 85% to cleaner, platform keeps 15%
          const cleanerAmount = parseFloat((price * 0.85).toFixed(2));

          transaction.update(customerRef, { balance: increment(-price) });
          transaction.update(cleanerRef, {
            balance: increment(cleanerAmount),
            jobsCompleted: increment(1),
          });

          const txCustomer = doc(collection(db, 'transactions'));
          transaction.set(txCustomer, {
            userId: user.uid,
            type: 'DEBIT',
            amount: price,
            description: `Payment for ${job.serviceType}`,
            jobId,
            status: 'COMPLETED',
            createdAt: serverTimestamp(),
          });

          const txCleaner = doc(collection(db, 'transactions'));
          transaction.set(txCleaner, {
            userId: job.cleanerId,
            type: 'CREDIT',
            amount: cleanerAmount,
            description: `Earnings from ${job.serviceType}`,
            jobId,
            status: 'COMPLETED',
            createdAt: serverTimestamp(),
          });

          transaction.update(doc(db, 'jobs', jobId!), {
            paidAt: serverTimestamp(),
            paymentMethod: 'WALLET',
          });
        });

        setStep('RATING');
      } else if (selectedPayment === 'CARD') {
        if (IS_DEV) {
          await new Promise((r) => setTimeout(r, 1200));
          await updateDoc(doc(db, 'jobs', jobId!), {
            paidAt: serverTimestamp(),
            paymentMethod: 'CARD',
          });
          setStep('RATING');
        } else {
          const { getFunctions, httpsCallable } = await import('firebase/functions');
          const { getApp } = await import('firebase/app');
          const functions = getFunctions(getApp());
          const createPayment = httpsCallable<
            { amount: number; currency: string; userId: string },
            { redirectUrl: string; referenceNumber: string }
          >(functions, 'createPesePayPayment');
          const { data } = await createPayment({ amount: price, currency: 'USD', userId: user.uid });
          const { openBrowserAsync } = await import('expo-web-browser');
          await openBrowserAsync(data.redirectUrl);
          await updateDoc(doc(db, 'jobs', jobId!), {
            paidAt: serverTimestamp(),
            paymentMethod: 'CARD',
          });
          setStep('RATING');
        }
      } else {
        // Cash — mark paid, no balance changes
        await updateDoc(doc(db, 'jobs', jobId!), {
          paidAt: serverTimestamp(),
          paymentMethod: 'CASH',
        });
        setStep('RATING');
      }
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
      const cleanerRef = doc(db, 'users', job.cleanerId);
      const reviewRef = doc(collection(db, 'reviews'));

      await runTransaction(db, async (transaction) => {
        const cleanerSnap = await transaction.get(cleanerRef);
        const currentAvg = cleanerSnap.data()?.ratingAverage ?? 0;
        const currentCount = cleanerSnap.data()?.ratingCount ?? 0;
        const newCount = currentCount + 1;
        const newAvg = parseFloat(((currentAvg * currentCount + rating) / newCount).toFixed(2));

        transaction.set(reviewRef, {
          jobId,
          cleanerId: job.cleanerId,
          customerId: user.uid,
          customerName: profile?.displayName ?? 'Customer',
          rating,
          createdAt: serverTimestamp(),
        });

        transaction.update(cleanerRef, {
          ratingAverage: newAvg,
          ratingCount: newCount,
        });

        transaction.update(doc(db, 'jobs', jobId!), {
          rating,
          ratedAt: serverTimestamp(),
        });
      });

      setStep('SUCCESS');
    } catch {
      Alert.alert('Error', 'Failed to submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!job) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#3906d2" size="large" />
      </View>
    );
  }

  const mapRegion = job.location
    ? {
        latitude: job.location.lat,
        longitude: job.location.lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }
    : undefined;

  // SUCCESS screen
  if (step === 'SUCCESS') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <View className="w-24 h-24 bg-emerald-50 rounded-4xl items-center justify-center mb-6">
          <CheckCircle size={48} color="#10b981" />
        </View>
        <Text className="text-3xl font-black text-slate-900 text-center mb-2">All done!</Text>
        <Text className="text-base text-slate-500 font-medium text-center mb-10">
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

  // RATING screen
  if (step === 'RATING') {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-12 pb-10">
          <Text className="text-3xl font-black text-slate-900 text-center mb-2">
            Rate your cleaner
          </Text>
          <Text className="text-base text-slate-500 font-medium text-center mb-10">
            How was {job.cleanerName ?? 'your cleaner'}?
          </Text>

          <View className="items-center mb-10">
            <View className="flex-row gap-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                  <Star
                    size={48}
                    color={star <= rating ? '#f59e0b' : '#e2e8f0'}
                    fill={star <= rating ? '#f59e0b' : 'transparent'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text className="text-lg font-black text-slate-700 mt-4">
                {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][rating]}
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={handleRating}
            disabled={isSubmitting || rating === 0}
            activeOpacity={0.85}
            className={`py-5 rounded-[32px] items-center ${
              rating > 0 ? 'bg-accent shadow-lg shadow-accent/30' : 'bg-slate-100'
            }`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                className={`font-black text-sm uppercase tracking-widest ${
                  rating > 0 ? 'text-white' : 'text-slate-400'
                }`}
              >
                Submit Rating
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep('SUCCESS')} className="mt-4 items-center">
            <Text className="text-sm text-slate-400 font-medium">Skip</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // PAYMENT screen (customers only)
  if (step === 'PAYMENT') {
    const PAYMENT_OPTIONS = [
      { id: 'WALLET', label: 'Detail Wallet', emoji: '👛', sub: `Balance: $${profile?.balance?.toFixed(2) ?? '0.00'}` },
      { id: 'CARD', label: 'Card via PesePay', emoji: '💳', sub: 'EcoCash, Visa, Mastercard' },
      { id: 'CASH', label: 'Cash', emoji: '💵', sub: 'Pay cleaner directly' },
    ] as const;

    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-12 pb-10">
          <Text className="text-3xl font-black text-slate-900 mb-2">Complete Payment</Text>
          <Text className="text-base text-slate-500 font-medium mb-8">
            Total: <Text className="font-black text-slate-900">${job.price?.toFixed(2) ?? '—'}</Text>
          </Text>

          <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            Payment Method
          </Text>
          <View className="gap-3 mb-8">
            {PAYMENT_OPTIONS.map(({ id, label, emoji, sub }) => (
              <TouchableOpacity
                key={id}
                onPress={() => setSelectedPayment(id)}
                activeOpacity={0.8}
                className={`flex-row items-center gap-4 p-5 rounded-3xl border-2 ${
                  selectedPayment === id
                    ? 'border-accent bg-accent/5'
                    : 'border-slate-100 bg-slate-50'
                }`}
              >
                <Text className="text-3xl">{emoji}</Text>
                <View className="flex-1">
                  <Text
                    className={`text-sm font-black ${
                      selectedPayment === id ? 'text-accent' : 'text-slate-900'
                    }`}
                  >
                    {label}
                  </Text>
                  <Text className="text-xs text-slate-400 font-medium mt-0.5">{sub}</Text>
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
                {IS_DEV && selectedPayment !== 'WALLET' && selectedPayment !== 'CASH'
                  ? `[DEV] Pay $${job.price?.toFixed(2) ?? '—'}`
                  : `Pay $${job.price?.toFixed(2) ?? '—'} via ${selectedPayment}`}
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
      {/* Map */}
      {mapRegion ? (
        <MapView
          style={{ flex: 1 }}
          provider={PROVIDER_DEFAULT}
          initialRegion={mapRegion}
          showsUserLocation
          showsMyLocationButton={false}
        >
          <Marker
            coordinate={{ latitude: job.location.lat, longitude: job.location.lng }}
            title="Job Location"
          >
            <View className="w-10 h-10 bg-accent rounded-2xl items-center justify-center shadow-lg">
              <MapPin size={20} color="#fff" />
            </View>
          </Marker>

          {/* Real-time cleaner location marker (visible to customer) */}
          {isCustomer && job.cleanerLocation && (
            <Marker
              coordinate={{ latitude: job.cleanerLocation.lat, longitude: job.cleanerLocation.lng }}
              title={job.cleanerName ?? 'Your Cleaner'}
            >
              <View className="w-10 h-10 bg-emerald-500 rounded-2xl items-center justify-center shadow-lg">
                <Navigation size={20} color="#fff" />
              </View>
            </Marker>
          )}
        </MapView>
      ) : (
        <View className="flex-1 bg-slate-100 items-center justify-center">
          <Text className="text-slate-400 font-medium">Loading map…</Text>
        </View>
      )}

      {/* Header overlay */}
      <SafeAreaView
        className="absolute top-0 left-0 right-0"
        edges={['top']}
        pointerEvents="box-none"
      >
        <View className="flex-row items-center justify-between px-5 pt-4" pointerEvents="auto">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-14 h-14 bg-white/90 rounded-3xl items-center justify-center shadow-lg border border-white"
          >
            <ArrowLeft size={22} color="#0f172a" />
          </TouchableOpacity>

          <View className="bg-white/90 backdrop-blur px-6 py-3 rounded-full border border-white/60 shadow-md">
            <Text className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
              {STATUS_LABELS[job.status] ?? job.status}
            </Text>
          </View>

          <View className="w-14 h-14 bg-white/90 rounded-3xl items-center justify-center shadow-lg border border-white">
            <Settings2 size={22} color="#0f172a" />
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom sheet */}
      <Animated.View
        style={{ transform: [{ translateY: slideAnim }] }}
        className="bg-white rounded-t-[40px] shadow-[0_-20px_60px_rgba(0,0,0,0.12)] border-t border-slate-50 pt-6 pb-10 px-6"
      >
        <View className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-6" />

        {/* Cleaner / Customer info card */}
        <View className="flex-row items-center gap-5 bg-slate-50 rounded-3xl p-5 mb-6 border border-slate-100">
          <View className="relative">
            <View className="w-16 h-16 bg-accent/10 rounded-[24px] items-center justify-center">
              <Text className="text-2xl">🧹</Text>
            </View>
            <View className="absolute -bottom-1.5 -right-1.5 w-8 h-8 bg-accent rounded-xl items-center justify-center border-2 border-white">
              <ShieldCheck size={14} color="#fff" />
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-black text-slate-900 tracking-tight">
              {isCustomer ? job.cleanerName ?? 'Your Cleaner' : job.customerName ?? 'Customer'}
            </Text>
            {isCustomer && (
              <View className="flex-row items-center gap-1 mt-0.5">
                <Star size={12} color="#f59e0b" fill="#f59e0b" />
                <Text className="text-xs font-black text-slate-700">
                  {job.cleanerRating != null
                    ? `${job.cleanerRating.toFixed(1)} Rating`
                    : IS_DEV
                    ? '4.95 Excellent'
                    : 'New Cleaner'}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/messages', params: { jobId } })}
            className="w-10 h-10 bg-accent/10 rounded-2xl items-center justify-center"
          >
            <MessageSquare size={18} color="#3906d2" />
          </TouchableOpacity>
        </View>

        {/* Cleaner: status update button */}
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
              <Text className="text-white font-black text-sm uppercase tracking-widest">
                {CLEANER_NEXT_STATUS[job.status]!.label}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Action buttons */}
        <View className="flex-row gap-4">
          {[
            {
              id: 'message',
              label: 'Message',
              icon: MessageSquare,
              color: '#6366f1',
              bg: 'bg-indigo-50',
              action: () => router.push({ pathname: '/messages', params: { jobId } }),
            },
            {
              id: 'call',
              label: 'Call',
              icon: Phone,
              color: '#10b981',
              bg: 'bg-emerald-50',
              action: () => Alert.alert('Calling', 'VoIP calling coming soon'),
            },
            {
              id: 'cancel',
              label: 'Abort',
              icon: ShieldAlert,
              color: '#ef4444',
              bg: 'bg-red-50',
              action: handleCancelJob,
            },
          ].map(({ id, label, icon: Icon, color, bg, action }) => (
            <TouchableOpacity
              key={id}
              onPress={action}
              className="flex-1 items-center gap-2"
              activeOpacity={0.7}
            >
              <View className={`w-14 h-14 ${bg} rounded-[24px] items-center justify-center`}>
                <Icon size={20} color={color} />
              </View>
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
