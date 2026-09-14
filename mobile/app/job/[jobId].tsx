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
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MapPin, Clock, DollarSign, MessageSquare, Hash, Home, Layers, Sparkles, X } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { db, doc, collection, onSnapshot, query, where, getDocs, limit } from '../../services/firebase';
import { callFunction } from '../../services/functions';
import { Job, JobStatus, HouseChecklist, CarChecklist } from '../../types';
import { IS_MOCK } from '../../utils/env';
import { haversineDistanceKm } from '../../services/matching';
import * as Location from 'expo-location';

export default function CleanerJobDetailScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { user, profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [alreadyBid, setAlreadyBid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  const [bidPrice, setBidPrice] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [message, setMessage] = useState('');

  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(({ coords }) => setCurrentLocation({ lat: coords.latitude, lng: coords.longitude }))
      .catch(() => {});
  }, []);

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
    if (!jobId || !user) return;
    const q = query(collection(db, 'bids'), where('jobId', '==', jobId), where('cleanerId', '==', user.uid), limit(1));
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
    if (job?.status !== JobStatus.PENDING) {
      Alert.alert('Too Late', 'This job is no longer accepting bids.');
      return;
    }

    setIsSubmitting(true);
    try {
      await callFunction('submitBid', {
        jobId,
        bidPrice: price,
        estimatedArrival: eta,
        message: message.trim() || undefined,
      });
      setAlreadyBid(true);
      Alert.alert('Bid Placed!', "Your offer has been sent to the customer. You'll be notified if they accept.");
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit bid. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#3906D2" size="large" />
      </View>
    );
  }

  if (!job) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-lg font-black text-ink text-center">Job not found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-accent font-black">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isTaken = job.status !== JobStatus.PENDING;
  const distance = IS_MOCK
    ? '2.3 km away'
    : currentLocation && job.location?.lat && job.location?.lng
    ? `${haversineDistanceKm(currentLocation, { lat: job.location.lat, lng: job.location.lng }).toFixed(1)} km away`
    : null;

  const budgetLabel = job.budget ? `$${job.budget}` : 'Open — send your best price';

  const checklistTags = getChecklistTags(job);

  return (
    <SafeAreaView className="flex-1 bg-[#F3F1FC]">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-ink/5">
            <ArrowLeft size={18} color="#150256" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-black text-ink">{job.serviceType}</Text>
            <Text className="text-xs text-ink/40 font-medium">#{jobId?.slice(-6).toUpperCase()}</Text>
          </View>
          {isTaken && (
            <View className="bg-amber-100 px-3 py-1.5 rounded-xl">
              <Text className="text-xs font-black text-amber-700 uppercase tracking-wider">{job.status}</Text>
            </View>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="mx-5 bg-white rounded-3xl p-5 border border-ink/5 mb-4">
            <Text className="text-xs font-black text-ink/40 uppercase tracking-widest mb-3">
              {job.category === 'CAR' ? '🚗 Car Cleaning' : '🏠 House Cleaning'}
            </Text>

            <View className="gap-3">
              <DetailRow icon={MapPin} title="Location" value={job.location?.address ?? 'Address not provided'} accent={distance ?? undefined} />
              <DetailRow icon={DollarSign} title="Customer Budget" value={budgetLabel} />
              <DetailRow icon={Clock} title="Estimated Duration" value={job.estimatedDuration ? `${job.estimatedDuration} hours` : '2–3 hours'} />
              {job.category === 'HOUSE' && (
                <>
                  {Boolean((job.checklist as HouseChecklist)?.storiesCount || (job.checklist as HouseChecklist)?.roomsCount) && (
                    <DetailRow
                      icon={Home}
                      title="Property Layout"
                      value={[
                        (job.checklist as HouseChecklist).storiesCount ? `${(job.checklist as HouseChecklist).storiesCount} Story` : null,
                        (job.checklist as HouseChecklist).roomsCount ? `${(job.checklist as HouseChecklist).roomsCount} Rooms to clean` : null,
                        (job.checklist as HouseChecklist).bathroomsCount ? `${(job.checklist as HouseChecklist).bathroomsCount} Baths` : null,
                        (job.checklist as HouseChecklist).propertySizeSqm ? `${(job.checklist as HouseChecklist).propertySizeSqm} m²` : null,
                      ].filter(Boolean).join(' · ')}
                      highlight
                    />
                  )}
                </>
              )}
              {job.category === 'CAR' && (job.checklist as CarChecklist)?.registrationNumber && (
                <DetailRow
                  icon={Hash}
                  title="Vehicle Registration"
                  value={(job.checklist as CarChecklist).registrationNumber!}
                  highlight
                />
              )}
              {job.description && <DetailRow icon={MessageSquare} title="Notes" value={job.description} />}
            </View>

            {checklistTags.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mt-4 pt-4 border-t border-ink/5">
                {checklistTags.map((tag) => (
                  <View key={tag} className="bg-accent/10 px-3 py-1.5 rounded-full">
                    <Text className="text-[11px] font-black text-accent">{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {job.photos?.length > 0 && (
              <View className="mt-4 pt-4 border-t border-ink/5">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-black text-ink/60 uppercase tracking-wider">
                    📸 Photos of What Needs Cleaning ({job.photos.length})
                  </Text>
                  <Text className="text-[10px] font-bold text-accent">Tap to enlarge</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {job.photos.map((url) => (
                    <TouchableOpacity
                      key={url}
                      onPress={() => setSelectedPhotoUrl(url)}
                      activeOpacity={0.8}
                      className="relative rounded-2xl overflow-hidden border border-ink/10"
                    >
                      <Image source={{ uri: url }} style={{ width: 88, height: 88 }} />
                      <View className="absolute bottom-1 left-1 bg-black/75 px-1.5 py-0.5 rounded-md">
                        <Text className="text-[8px] font-black text-white uppercase">Dirty / Before</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {job.completionPhotos && job.completionPhotos.length > 0 && (
              <View className="mt-4 pt-4 border-t border-ink/5">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-black text-emerald-700 uppercase tracking-wider">
                    ✨ Photos When Done ({job.completionPhotos.length})
                  </Text>
                  <Text className="text-[10px] font-bold text-emerald-700">Completed</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {job.completionPhotos.map((url) => (
                    <TouchableOpacity
                      key={url}
                      onPress={() => setSelectedPhotoUrl(url)}
                      activeOpacity={0.8}
                      className="relative rounded-2xl overflow-hidden border border-emerald-200"
                    >
                      <Image source={{ uri: url }} style={{ width: 88, height: 88 }} />
                      <View className="absolute bottom-1 left-1 bg-emerald-700/85 px-1.5 py-0.5 rounded-md">
                        <Text className="text-[8px] font-black text-white uppercase">Completed</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {isTaken ? (
            <View className="mx-5 bg-amber-50 rounded-3xl p-5 border border-amber-100">
              <Text className="text-sm font-black text-amber-700 text-center">This job has already been accepted</Text>
            </View>
          ) : alreadyBid ? (
            <View className="mx-5 bg-emerald-50 rounded-3xl p-5 border border-emerald-100 items-center">
              <Text className="text-2xl mb-2">✅</Text>
              <Text className="text-sm font-black text-emerald-700 text-center">Bid submitted — waiting for customer to accept</Text>
            </View>
          ) : (
            <View className="mx-5 bg-white rounded-3xl p-5 border border-ink/5">
              <Text className="text-xs font-black text-ink/40 uppercase tracking-widest mb-4">Place Your Bid</Text>

              <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-1.5">Your Price (USD)</Text>
              <TextInput
                className="border-2 border-ink/10 rounded-2xl px-4 py-3.5 text-xl font-black text-ink bg-ink/[0.02] mb-4"
                placeholder={`${job.budget ?? '0'}.00`}
                placeholderTextColor="#9C94C4"
                keyboardType="decimal-pad"
                value={bidPrice}
                onChangeText={setBidPrice}
              />

              <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-1.5">Estimated Arrival (minutes)</Text>
              <TextInput
                className="border-2 border-ink/10 rounded-2xl px-4 py-3.5 text-base font-bold text-ink bg-ink/[0.02] mb-4"
                placeholder="e.g. 20"
                placeholderTextColor="#9C94C4"
                keyboardType="number-pad"
                value={estimatedArrival}
                onChangeText={setEstimatedArrival}
              />

              <View className="flex-row gap-2 mb-4">
                {['10', '20', '30', '45'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setEstimatedArrival(t)}
                    className={`flex-1 py-2 rounded-xl items-center border ${estimatedArrival === t ? 'bg-accent border-accent' : 'bg-ink/[0.02] border-ink/10'}`}
                  >
                    <Text className={`text-xs font-black ${estimatedArrival === t ? 'text-white' : 'text-ink/60'}`}>{t} min</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-1.5">Message (optional)</Text>
              <TextInput
                className="border-2 border-ink/10 rounded-2xl px-4 py-3 text-sm font-medium text-ink bg-ink/[0.02] mb-5"
                placeholder="Introduce yourself or mention your experience…"
                placeholderTextColor="#9C94C4"
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
                className={`py-5 rounded-[32px] items-center ${bidPrice && estimatedArrival ? 'bg-accent shadow-lg shadow-accent/30' : 'bg-ink/10'}`}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className={`font-black text-sm uppercase tracking-widest ${bidPrice && estimatedArrival ? 'text-white' : 'text-ink/30'}`}>
                    Submit Bid ${bidPrice || '—'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={!!selectedPhotoUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhotoUrl(null)}
      >
        <View className="flex-1 bg-black/90 items-center justify-center p-4">
          <TouchableOpacity
            onPress={() => setSelectedPhotoUrl(null)}
            className="absolute top-12 right-6 w-10 h-10 rounded-full bg-white/20 items-center justify-center z-10"
          >
            <X size={22} color="#fff" />
          </TouchableOpacity>
          {selectedPhotoUrl && (
            <Image
              source={{ uri: selectedPhotoUrl }}
              style={{ width: '100%', height: '80%', resizeMode: 'contain' }}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({
  icon: Icon, title, value, accent, highlight,
}: {
  icon: any; title: string; value: string; accent?: string; highlight?: boolean;
}) {
  return (
    <View className={`flex-row items-start gap-3 ${highlight ? 'bg-accent/5 -mx-1 px-1 py-1.5 rounded-2xl' : ''}`}>
      <View className={`w-8 h-8 rounded-xl items-center justify-center mt-0.5 ${highlight ? 'bg-accent' : 'bg-accent/10'}`}>
        <Icon size={14} color={highlight ? '#fff' : '#3906D2'} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-black text-ink">{title}</Text>
        <Text className={`text-sm font-black mt-0.5 tracking-widest ${highlight ? 'text-accent' : 'text-xs text-ink/50 font-medium'}`}>
          {value}
        </Text>
        {accent && <Text className="text-xs text-accent font-black mt-0.5">{accent}</Text>}
      </View>
    </View>
  );
}

function getChecklistTags(job: Job): string[] {
  const checklist = job.checklist;
  if (!checklist) return [];
  if (checklist.category === 'HOUSE') {
    const c = checklist as HouseChecklist;
    return [...(c.cleaningTypes ?? []), ...(c.areas ?? []).slice(0, 4)];
  }
  const c = checklist as CarChecklist;
  return [...(c.cleaningTypes ?? []), ...(c.exteriorServices ?? []).slice(0, 2), ...(c.interiorServices ?? []).slice(0, 2)];
}
