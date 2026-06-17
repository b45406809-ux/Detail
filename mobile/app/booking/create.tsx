import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MapPin, Clock, DollarSign, ChevronDown } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../../context/AuthContext';
import {
  db,
  addDoc,
  collection,
  serverTimestamp,
} from '../../../services/firebase';
import { JobStatus } from '../../../types';

const SERVICE_TYPES = [
  { id: 'STANDARD', label: 'Standard Clean', emoji: '🧹', desc: 'Regular cleaning of common areas' },
  { id: 'DEEP', label: 'Deep Clean', emoji: '🫧', desc: 'Thorough top-to-bottom cleaning' },
  { id: 'MOVE', label: 'Move In/Out', emoji: '📦', desc: 'Full clean before or after moving' },
  { id: 'OFFICE', label: 'Office Clean', emoji: '🏢', desc: 'Commercial workspace cleaning' },
  { id: 'CARPET', label: 'Carpet Clean', emoji: '🛋️', desc: 'Carpet and upholstery shampooing' },
  { id: 'WINDOW', label: 'Window Clean', emoji: '🪟', desc: 'Interior and exterior windows' },
];

const TIME_OPTIONS = [
  { id: 'NOW', label: 'ASAP', sub: 'Within the hour' },
  { id: 'TODAY', label: 'Today', sub: 'Later today' },
  { id: 'TOMORROW', label: 'Tomorrow', sub: 'Schedule for tomorrow' },
  { id: 'CUSTOM', label: 'Pick Date', sub: 'Choose a specific date' },
];

export default function CreateBookingScreen() {
  const { serviceType: preselectedType } = useLocalSearchParams<{ serviceType?: string }>();
  const { user, profile } = useAuth();

  const [step, setStep] = useState<'SERVICE' | 'LOCATION' | 'BID'>('SERVICE');
  const [serviceType, setServiceType] = useState(preselectedType ?? '');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedTime, setSelectedTime] = useState('NOW');
  const [bid, setBid] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  useEffect(() => {
    if (preselectedType) setStep('LOCATION');
  }, [preselectedType]);

  const useCurrentLocation = async () => {
    setIsFetchingLocation(true);
    try {
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoordinates({ lat: coords.latitude, lng: coords.longitude });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      if (place) {
        setAddress(
          [place.streetNumber, place.street, place.city, place.region]
            .filter(Boolean)
            .join(', ')
        );
      }
    } catch {
      Alert.alert('Location Error', 'Could not fetch your current location.');
    } finally {
      setIsFetchingLocation(false);
    }
  };

  const handleSubmit = async () => {
    const bidValue = parseFloat(bid);
    if (isNaN(bidValue) || bidValue <= 0) {
      Alert.alert('Invalid Bid', 'Please enter a valid bid amount.');
      return;
    }
    if (!coordinates && !address) {
      Alert.alert('Location Required', 'Please set a location for your job.');
      return;
    }
    if (!user) return;

    setIsSubmitting(true);
    try {
      const jobRef = await addDoc(collection(db, 'jobs'), {
        customerId: user.uid,
        customerName: profile?.displayName,
        customerPhoto: profile?.photoURL ?? '',
        serviceType,
        description,
        location: {
          lat: coordinates?.lat ?? 0,
          lng: coordinates?.lng ?? 0,
          address,
        },
        scheduledTime: selectedTime,
        status: JobStatus.BIDDING,
        customerBid: bidValue,
        photos: [],
        createdAt: serverTimestamp(),
      });
      router.replace({ pathname: '/booking/offers', params: { jobId: jobRef.id } });
    } catch (err) {
      Alert.alert('Error', 'Failed to post job. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceedToLocation = !!serviceType;
  const canProceedToBid = !!address || !!coordinates;
  const canSubmit = !!bid && parseFloat(bid) > 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-2">
          <TouchableOpacity
            onPress={() => (step === 'SERVICE' ? router.back() : setStep(step === 'BID' ? 'LOCATION' : 'SERVICE'))}
            className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center"
          >
            <ArrowLeft size={18} color="#0f172a" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-black text-slate-900">Post a Job</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View className="flex-row gap-2 px-5 py-3">
          {(['SERVICE', 'LOCATION', 'BID'] as const).map((s, i) => (
            <View
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                ['SERVICE', 'LOCATION', 'BID'].indexOf(step) >= i ? 'bg-accent' : 'bg-slate-100'
              }`}
            />
          ))}
        </View>

        <ScrollView
          contentContainerClassName="px-5 pt-4 pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step 1 — Service type */}
          {step === 'SERVICE' && (
            <View>
              <Text className="text-2xl font-black text-slate-900 mb-1">What needs cleaning?</Text>
              <Text className="text-sm text-slate-500 font-medium mb-6">
                Choose the type of cleaning service you need
              </Text>
              <View className="gap-3">
                {SERVICE_TYPES.map(({ id, label, emoji, desc }) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setServiceType(id)}
                    activeOpacity={0.8}
                    className={`flex-row items-center gap-4 p-5 rounded-3xl border-2 ${
                      serviceType === id
                        ? 'border-accent bg-accent/5'
                        : 'border-slate-100 bg-slate-50'
                    }`}
                  >
                    <Text className="text-3xl">{emoji}</Text>
                    <View className="flex-1">
                      <Text
                        className={`text-sm font-black ${
                          serviceType === id ? 'text-accent' : 'text-slate-900'
                        }`}
                      >
                        {label}
                      </Text>
                      <Text className="text-xs text-slate-500 font-medium mt-0.5">{desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="mt-6">
                <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                  Describe the job (optional)
                </Text>
                <TextInput
                  className="border-2 border-slate-100 rounded-2xl px-4 py-4 text-sm font-medium text-slate-900 bg-slate-50"
                  placeholder="Any special requirements, access instructions, etc."
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={3}
                  value={description}
                  onChangeText={setDescription}
                  textAlignVertical="top"
                />
              </View>
            </View>
          )}

          {/* Step 2 — Location & time */}
          {step === 'LOCATION' && (
            <View>
              <Text className="text-2xl font-black text-slate-900 mb-1">Where is the job?</Text>
              <Text className="text-sm text-slate-500 font-medium mb-6">
                Enter the address or use your current location
              </Text>

              <View className="mb-4">
                <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                  Address
                </Text>
                <View className="border-2 border-slate-100 rounded-2xl bg-slate-50 flex-row items-center gap-3 px-4">
                  <MapPin size={18} color="#94a3b8" />
                  <TextInput
                    className="flex-1 py-4 text-sm font-medium text-slate-900"
                    placeholder="Enter an address…"
                    placeholderTextColor="#94a3b8"
                    value={address}
                    onChangeText={setAddress}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={useCurrentLocation}
                disabled={isFetchingLocation}
                className="flex-row items-center gap-3 bg-accent/10 border border-accent/20 rounded-2xl px-4 py-4 mb-6"
                activeOpacity={0.8}
              >
                {isFetchingLocation ? (
                  <ActivityIndicator size="small" color="#3906d2" />
                ) : (
                  <MapPin size={18} color="#3906d2" />
                )}
                <Text className="text-sm font-black text-accent">
                  {isFetchingLocation ? 'Detecting location…' : 'Use my current location'}
                </Text>
              </TouchableOpacity>

              {/* Time selection */}
              <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                When?
              </Text>
              <View className="gap-3">
                {TIME_OPTIONS.map(({ id, label, sub }) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setSelectedTime(id)}
                    activeOpacity={0.8}
                    className={`flex-row items-center gap-4 p-4 rounded-3xl border-2 ${
                      selectedTime === id
                        ? 'border-accent bg-accent/5'
                        : 'border-slate-100 bg-slate-50'
                    }`}
                  >
                    <View
                      className={`w-10 h-10 rounded-2xl items-center justify-center ${
                        selectedTime === id ? 'bg-accent' : 'bg-white border border-slate-100'
                      }`}
                    >
                      <Clock size={18} color={selectedTime === id ? '#fff' : '#94a3b8'} />
                    </View>
                    <View>
                      <Text
                        className={`text-sm font-black ${
                          selectedTime === id ? 'text-accent' : 'text-slate-900'
                        }`}
                      >
                        {label}
                      </Text>
                      <Text className="text-xs text-slate-500 font-medium mt-0.5">{sub}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Step 3 — Bid */}
          {step === 'BID' && (
            <View>
              <Text className="text-2xl font-black text-slate-900 mb-1">Set your price</Text>
              <Text className="text-sm text-slate-500 font-medium mb-6">
                Cleaners will bid on your job — set a fair price to attract the best
              </Text>

              <View className="bg-slate-50 rounded-3xl p-5 mb-6 border border-slate-100">
                <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                  Suggested range for {SERVICE_TYPES.find((s) => s.id === serviceType)?.label}
                </Text>
                <Text className="text-sm font-bold text-slate-700">$80 — $150</Text>
                <Text className="text-xs text-slate-400 font-medium mt-1">
                  Based on typical market rates in your area
                </Text>
              </View>

              <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                Your Offer (USD)
              </Text>
              <View className="border-2 border-slate-100 rounded-2xl bg-slate-50 flex-row items-center gap-3 px-4 mb-6">
                <DollarSign size={20} color="#94a3b8" />
                <TextInput
                  className="flex-1 py-4 text-3xl font-black text-slate-900"
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  value={bid}
                  onChangeText={setBid}
                  autoFocus
                />
              </View>

              {/* Summary */}
              <View className="bg-slate-50 rounded-3xl p-5 border border-slate-100 gap-3">
                <Text className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Job Summary
                </Text>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-slate-500 font-medium">Service</Text>
                  <Text className="text-xs font-black text-slate-900">
                    {SERVICE_TYPES.find((s) => s.id === serviceType)?.label ?? serviceType}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-slate-500 font-medium">Location</Text>
                  <Text className="text-xs font-black text-slate-900 flex-1 text-right ml-4" numberOfLines={1}>
                    {address || 'Current location'}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-slate-500 font-medium">Time</Text>
                  <Text className="text-xs font-black text-slate-900">
                    {TIME_OPTIONS.find((t) => t.id === selectedTime)?.label}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer CTA */}
        <View className="px-5 pb-8 pt-4 border-t border-slate-50 bg-white">
          {step === 'SERVICE' && (
            <TouchableOpacity
              onPress={() => setStep('LOCATION')}
              disabled={!canProceedToLocation}
              activeOpacity={0.85}
              className={`py-5 rounded-[32px] items-center ${
                canProceedToLocation ? 'bg-accent shadow-lg shadow-accent/30' : 'bg-slate-100'
              }`}
            >
              <Text
                className={`font-black text-sm uppercase tracking-widest ${
                  canProceedToLocation ? 'text-white' : 'text-slate-400'
                }`}
              >
                Next: Set Location
              </Text>
            </TouchableOpacity>
          )}

          {step === 'LOCATION' && (
            <TouchableOpacity
              onPress={() => setStep('BID')}
              disabled={!canProceedToBid}
              activeOpacity={0.85}
              className={`py-5 rounded-[32px] items-center ${
                canProceedToBid ? 'bg-accent shadow-lg shadow-accent/30' : 'bg-slate-100'
              }`}
            >
              <Text
                className={`font-black text-sm uppercase tracking-widest ${
                  canProceedToBid ? 'text-white' : 'text-slate-400'
                }`}
              >
                Next: Set Your Bid
              </Text>
            </TouchableOpacity>
          )}

          {step === 'BID' && (
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              activeOpacity={0.85}
              className={`py-5 rounded-[32px] items-center ${
                canSubmit ? 'bg-accent shadow-lg shadow-accent/30' : 'bg-slate-100'
              }`}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  className={`font-black text-sm uppercase tracking-widest ${
                    canSubmit ? 'text-white' : 'text-slate-400'
                  }`}
                >
                  Post Job · ${bid || '0'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
