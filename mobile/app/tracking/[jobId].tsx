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
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import {
  db,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from '../../../services/firebase';
import { Job, JobStatus } from '../../../types';
import { StarRating } from '../../../components/StarRating';

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Job Confirmed',
  EN_ROUTE: 'Cleaner Arriving',
  ARRIVED: 'Cleaner Arrived',
  IN_PROGRESS: 'Cleaning in Progress',
  COMPLETED: 'Cleaning Completed',
};

type TrackingStep = 'TRACKING' | 'PAYMENT' | 'RATING' | 'SUCCESS';

export default function TrackingScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { user, profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [step, setStep] = useState<TrackingStep>('TRACKING');
  const [rating, setRating] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState<'CARD' | 'CASH' | 'WALLET'>('CARD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;

  const isCustomer = profile?.role === 'CUSTOMER';

  // Listen to job updates
  useEffect(() => {
    if (!jobId) return;
    return onSnapshot(doc(db, 'jobs', jobId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Job;
        setJob(data);
        if (data.status === JobStatus.COMPLETED && step === 'TRACKING') {
          setStep(isCustomer ? 'PAYMENT' : 'RATING');
        }
      }
    });
  }, [jobId, isCustomer]);

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
          router.replace('/(app)');
        },
      },
    ]);
  };

  const handlePayment = async () => {
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setIsSubmitting(false);
    setStep('RATING');
  };

  const handleRating = async () => {
    if (rating === 0) {
      Alert.alert('Rate your cleaner', 'Please select a star rating before submitting.');
      return;
    }
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'jobs', jobId!), {
        rating,
        ratedAt: serverTimestamp(),
      });
      setStep('SUCCESS');
    } catch {
      Alert.alert('Error', 'Failed to submit rating.');
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
          onPress={() => router.replace('/(app)')}
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

          {/* Star selector */}
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

  // PAYMENT screen
  if (step === 'PAYMENT') {
    const PAYMENT_OPTIONS = [
      { id: 'CARD', label: 'Card', emoji: '💳' },
      { id: 'CASH', label: 'Cash', emoji: '💵' },
      { id: 'WALLET', label: 'Wallet', emoji: '👛' },
    ] as const;

    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-12 pb-10">
          <Text className="text-3xl font-black text-slate-900 mb-2">Complete Payment</Text>
          <Text className="text-base text-slate-500 font-medium mb-8">
            Total: <Text className="font-black text-slate-900">${job.price ?? '—'}</Text>
          </Text>

          <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            Payment Method
          </Text>
          <View className="gap-3 mb-8">
            {PAYMENT_OPTIONS.map(({ id, label, emoji }) => (
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
                <Text
                  className={`text-sm font-black ${
                    selectedPayment === id ? 'text-accent' : 'text-slate-900'
                  }`}
                >
                  {label}
                </Text>
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
                Pay ${job.price ?? '—'} via {selectedPayment}
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

        {/* Cleaner info */}
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
              {job.cleanerName ?? 'Your Cleaner'}
            </Text>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Star size={12} color="#f59e0b" fill="#f59e0b" />
              <Text className="text-xs font-black text-slate-700">4.95 Excellent</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/messages', params: { jobId } })}
            className="w-10 h-10 bg-accent/10 rounded-2xl items-center justify-center"
          >
            <MessageSquare size={18} color="#3906d2" />
          </TouchableOpacity>
        </View>

        {/* Action buttons */}
        <View className="flex-row gap-4 mb-2">
          {[
            {
              id: 'message',
              label: 'Message',
              icon: MessageSquare,
              color: 'text-indigo-500',
              bg: 'bg-indigo-50',
              action: () => router.push({ pathname: '/messages', params: { jobId } }),
            },
            {
              id: 'call',
              label: 'Call',
              icon: Phone,
              color: 'text-emerald-500',
              bg: 'bg-emerald-50',
              action: () => Alert.alert('Calling', 'VoIP calling coming soon'),
            },
            {
              id: 'cancel',
              label: 'Abort',
              icon: ShieldAlert,
              color: 'text-red-500',
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
                <Icon size={20} className={color} color={undefined} />
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
