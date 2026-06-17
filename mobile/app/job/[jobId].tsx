import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MapPin, Clock, DollarSign, MessageSquare, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  doc,
  collection,
  onSnapshot,
  query,
  where,
  addDoc,
  serverTimestamp,
  getDocs,
  limit,
} from '../../services/firebase';
import { Job, JobStatus } from '../../types';
import { IS_DEV } from '../../utils/env';
import { haversineDistanceKm } from '../../services/matching';
import * as Location from 'expo-location';

export default function CleanerJobDetailScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { user, profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [alreadyBid, setAlreadyBid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bid form state
  const [bidPrice, setBidPrice] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [message, setMessage] = useState('');

  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(({ coords }) => setCurrentLocation({ lat: coords.latitude, lng: coords.longitude }))
      .catch(() => {});
  }, []);

  // Live job listener
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

  // Check if cleaner already bid on this job
  useEffect(() => {
    if (!jobId || !user) return;
    const q = query(
      collection(db, 'bids'),
      where('jobId', '==', jobId),
      where('cleanerId', '==', user.uid),
      limit(1)
    );
    getDocs(q).then((snap) => setAlreadyBid(!snap.empty));
  }, [jobId, user]);

  const handleSubmitBid = async () => {
    const price = parseFloat(bidPrice);
    const eta = parseInt(estimatedArrival, 10);

    if (isNaN(price) || price < 1) {
      Alert.alert('Invalid Price', 'Please enter a valid bid price.');
      return;
    }
    if (isNaN(eta) || eta < 1 || eta > 120) {
      Alert.alert('Invalid ETA', 'Please enter an estimated arrival time in minutes (1–120).');
      return;
    }
    if (!user || !profile) return;
    if (job?.status !== JobStatus.BIDDING) {
      Alert.alert('Too Late', 'This job is no longer accepting bids.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'bids'), {
        jobId,
        cleanerId: user.uid,
        cleanerName: profile.displayName,
        cleanerPhoto: profile.photoURL ?? '',
        cleanerRating: profile.ratingAverage ?? null,
        cleanerJobsCompleted: profile.jobsCompleted ?? 0,
        bidPrice: price,
        estimatedArrival: eta,
        message: message.trim() || null,
        status: 'PENDING',
        createdAt: serverTimestamp(),
      });
      setAlreadyBid(true);
      Alert.alert('Bid Placed!', 'Your offer has been sent to the customer. You\'ll be notified if they accept.');
    } catch {
      Alert.alert('Error', 'Failed to submit bid. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#3906d2" size="large" />
      </View>
    );
  }

  if (!job) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-lg font-black text-slate-900 text-center">Job not found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-accent font-black">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isTaken = job.status !== JobStatus.BIDDING;
  const distance =
    IS_DEV
      ? '2.3 km away'
      : currentLocation && job.location?.lat && job.location?.lng
      ? `${haversineDistanceKm(currentLocation, { lat: job.location.lat, lng: job.location.lng }).toFixed(1)} km away`
      : null;

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-slate-100"
          >
            <ArrowLeft size={18} color="#0f172a" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-black text-slate-900">{job.serviceType}</Text>
            <Text className="text-xs text-slate-400 font-medium">
              #{jobId?.slice(-6).toUpperCase()}
            </Text>
          </View>
          {isTaken && (
            <View className="bg-amber-100 px-3 py-1.5 rounded-xl">
              <Text className="text-xs font-black text-amber-700 uppercase tracking-wider">
                {job.status}
              </Text>
            </View>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Job details card */}
          <View className="mx-5 bg-white rounded-3xl p-5 border border-slate-100 mb-4">
            <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
              Job Details
            </Text>

            <View className="gap-3">
              <View className="flex-row items-start gap-3">
                <View className="w-8 h-8 bg-accent/10 rounded-xl items-center justify-center mt-0.5">
                  <MapPin size={14} color="#3906d2" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-black text-slate-900">Location</Text>
                  <Text className="text-xs text-slate-500 font-medium mt-0.5">
                    {job.location?.address ?? 'Address not provided'}
                  </Text>
                  {distance && (
                    <Text className="text-xs text-accent font-black mt-0.5">{distance}</Text>
                  )}
                </View>
              </View>

              <View className="flex-row items-start gap-3">
                <View className="w-8 h-8 bg-accent/10 rounded-xl items-center justify-center mt-0.5">
                  <DollarSign size={14} color="#3906d2" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-black text-slate-900">Customer Budget</Text>
                  <Text className="text-xs text-slate-500 font-medium mt-0.5">
                    ${job.customerBid ?? '—'}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-start gap-3">
                <View className="w-8 h-8 bg-accent/10 rounded-xl items-center justify-center mt-0.5">
                  <Clock size={14} color="#3906d2" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-black text-slate-900">Estimated Duration</Text>
                  <Text className="text-xs text-slate-500 font-medium mt-0.5">
                    {job.estimatedDuration ? `${job.estimatedDuration} hours` : '2–3 hours'}
                  </Text>
                </View>
              </View>

              {job.description && (
                <View className="flex-row items-start gap-3">
                  <View className="w-8 h-8 bg-accent/10 rounded-xl items-center justify-center mt-0.5">
                    <MessageSquare size={14} color="#3906d2" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-black text-slate-900">Notes</Text>
                    <Text className="text-xs text-slate-500 font-medium mt-0.5">
                      {job.description}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Bid form or status */}
          {isTaken ? (
            <View className="mx-5 bg-amber-50 rounded-3xl p-5 border border-amber-100">
              <Text className="text-sm font-black text-amber-700 text-center">
                This job has already been accepted
              </Text>
            </View>
          ) : alreadyBid ? (
            <View className="mx-5 bg-emerald-50 rounded-3xl p-5 border border-emerald-100 items-center">
              <Text className="text-2xl mb-2">✅</Text>
              <Text className="text-sm font-black text-emerald-700 text-center">
                Bid submitted — waiting for customer to accept
              </Text>
            </View>
          ) : (
            <View className="mx-5 bg-white rounded-3xl p-5 border border-slate-100">
              <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                Place Your Bid
              </Text>

              {/* Bid price */}
              <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">
                Your Price (USD)
              </Text>
              <TextInput
                className="border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-xl font-black text-slate-900 bg-slate-50 mb-4"
                placeholder={`${job.customerBid ?? '0'}.00`}
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                value={bidPrice}
                onChangeText={setBidPrice}
              />

              {/* ETA */}
              <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">
                Estimated Arrival (minutes)
              </Text>
              <TextInput
                className="border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-base font-bold text-slate-900 bg-slate-50 mb-4"
                placeholder="e.g. 20"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                value={estimatedArrival}
                onChangeText={setEstimatedArrival}
              />

              {/* Quick ETA chips */}
              <View className="flex-row gap-2 mb-4">
                {['10', '20', '30', '45'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setEstimatedArrival(t)}
                    className={`flex-1 py-2 rounded-xl items-center border ${
                      estimatedArrival === t
                        ? 'bg-accent border-accent'
                        : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <Text
                      className={`text-xs font-black ${
                        estimatedArrival === t ? 'text-white' : 'text-slate-600'
                      }`}
                    >
                      {t} min
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Optional message */}
              <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">
                Message (optional)
              </Text>
              <TextInput
                className="border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 bg-slate-50 mb-5"
                placeholder="Introduce yourself or mention your experience…"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                maxLength={200}
                value={message}
                onChangeText={setMessage}
              />

              <TouchableOpacity
                onPress={handleSubmitBid}
                disabled={isSubmitting || !bidPrice || !estimatedArrival}
                activeOpacity={0.85}
                className={`py-5 rounded-[32px] items-center ${
                  bidPrice && estimatedArrival
                    ? 'bg-accent shadow-lg shadow-accent/30'
                    : 'bg-slate-100'
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    className={`font-black text-sm uppercase tracking-widest ${
                      bidPrice && estimatedArrival ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    Submit Bid ${bidPrice || '—'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
