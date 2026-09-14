import { callFunction } from '../../services/functions';
// Booking wizard — branches into a House or Car cleaning checklist, matching
// the "Book House Cleaning" / "Book Car Cleaning" step-by-step flows.
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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ArrowLeft,
  MapPin,
  Clock,
  Camera,
  X,
  Home as HomeIcon,
  Car,
  CalendarDays,
  DollarSign,
  Sparkles,
  CheckCircle2,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { db, addDoc, collection, serverTimestamp, Timestamp } from '../../services/firebase';
import { uploadJobPhoto } from '../../services/storage';
import { JobStatus, ServiceCategory, HouseChecklist, CarChecklist } from '../../types';
import {
  HOUSE_AREAS,
  HOUSE_CLEANING_TYPES,
  HOUSE_CONDITIONS,
  HOUSE_ADD_ONS,
  CAR_CLEANING_TYPES,
  CAR_CONDITIONS,
  CAR_EXTERIOR_SERVICES,
  CAR_INTERIOR_SERVICES,
  CAR_DEEP_SERVICES,
  TIME_OPTIONS,
} from '../../constants/services';

// A posted job stays open to new bids for 30 minutes — see offers.tsx for
// the countdown UI and the increase-budget/cancel actions available while
// it's running.
const BIDDING_WINDOW_MS = 30 * 60 * 1000;

/** Derive a concrete Date for every schedule preset so every job — not just
 * CUSTOM ones — has one queryable scheduledDateTime for the reminder system. */
function resolveScheduledDate(
  preference: (typeof TIME_OPTIONS)[number]['id'],
  customDate: Date | null
): Date {
  const now = new Date();
  if (preference === 'CUSTOM' && customDate) return customDate;
  if (preference === 'TOMORROW') return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return now; // ASAP / TODAY
}

const STEPS = ['CATEGORY', 'CHECKLIST', 'DETAILS', 'LOCATION', 'SCHEDULE', 'BUDGET'] as const;
type Step = (typeof STEPS)[number];

function toggleItem(list: string[], item: string) {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

export default function CreateBookingScreen() {
  const { category: preselectedCategory } = useLocalSearchParams<{ category?: ServiceCategory }>();
  const { user, profile } = useAuth();

  const [stepIndex, setStepIndex] = useState(preselectedCategory ? 1 : 0);
  const [category, setCategory] = useState<ServiceCategory | null>(preselectedCategory ?? null);

  // House checklist state
  const [propertySizeSqm, setPropertySizeSqm] = useState('');
  const [storiesCount, setStoriesCount] = useState('1');
  const [roomsCount, setRoomsCount] = useState('3');
  const [bathroomsCount, setBathroomsCount] = useState('2');
  const [areas, setAreas] = useState<string[]>([]);
  const [houseCleaningTypes, setHouseCleaningTypes] = useState<string[]>([]);
  const [houseCondition, setHouseCondition] = useState<HouseChecklist['condition']>();
  const [addOns, setAddOns] = useState<string[]>([]);

  // Car checklist state
  const [carCleaningTypes, setCarCleaningTypes] = useState<string[]>([]);
  const [carCondition, setCarCondition] = useState<CarChecklist['condition']>();
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [exteriorServices, setExteriorServices] = useState<string[]>([]);
  const [interiorServices, setInteriorServices] = useState<string[]>([]);
  const [deepServices, setDeepServices] = useState<string[]>([]);

  const [description, setDescription] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  const [timePreference, setTimePreference] = useState<(typeof TIME_OPTIONS)[number]['id']>('ASAP');
  const [customDateTime, setCustomDateTime] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [budgetOption, setBudgetOption] = useState<'NOT_SURE' | 'FIXED'>('NOT_SURE');
  const [budget, setBudget] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const step = STEPS[stepIndex];

  useEffect(() => {
    if (preselectedCategory) setCategory(preselectedCategory);
  }, [preselectedCategory]);

  const useCurrentLocation = async () => {
    setIsFetchingLocation(true);
    try {
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoordinates({ lat: coords.latitude, lng: coords.longitude });
      const [place] = await Location.reverseGeocodeAsync({ latitude: coords.latitude, longitude: coords.longitude });
      if (place) {
        setAddress([place.streetNumber, place.street, place.city, place.region].filter(Boolean).join(', '));
      }
    } catch {
      Alert.alert('Location Error', 'Could not fetch your current location.');
    } finally {
      setIsFetchingLocation(false);
    }
  };

  const pickPhoto = async (fromCamera: boolean) => {
    if (photoUris.length >= 6) {
      Alert.alert('Limit reached', 'You can add up to 6 photos.');
      return;
    }
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to add photos.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: false });
    if (result.canceled || !result.assets?.[0]) return;

    setIsUploadingPhoto(true);
    try {
      const url = await uploadJobPhoto(result.assets[0].uri);
      setPhotoUris((prev) => [...prev, url]);
    } catch {
      Alert.alert('Upload failed', 'Could not upload that photo. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const removePhoto = (url: string) => setPhotoUris((prev) => prev.filter((p) => p !== url));

  const goBack = () => {
    if (stepIndex === 0) return router.back();
    setStepIndex((i) => i - 1);
  };
  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));

  const canProceed = (): boolean => {
    switch (step) {
      case 'CATEGORY':
        return !!category;
      case 'CHECKLIST':
        return category === 'HOUSE' ? houseCleaningTypes.length > 0 : carCleaningTypes.length > 0;
      case 'DETAILS':
        return true;
      case 'LOCATION':
        return !!address || !!coordinates;
      case 'SCHEDULE':
        return !!timePreference && (timePreference !== 'CUSTOM' || !!customDateTime);
      case 'BUDGET':
        return budgetOption === 'NOT_SURE' || (!!budget && Number(budget) > 0);
      default:
        return true;
    }
  };

  const serviceLabel = () => {
    if (category === 'HOUSE') {
      return houseCleaningTypes.map((id) => HOUSE_CLEANING_TYPES.find((t) => t.id === id)?.label).filter(Boolean).join(' + ') || 'House Cleaning';
    }
    return carCleaningTypes.map((id) => CAR_CLEANING_TYPES.find((t) => t.id === id)?.label).filter(Boolean).join(' + ') || 'Car Cleaning';
  };

  const handleSubmit = async () => {
    if (!user || !category) return;
    setIsSubmitting(true);
    try {
      const checklist: HouseChecklist | CarChecklist =
        category === 'HOUSE'
          ? {
              category: 'HOUSE',
              propertySizeSqm: propertySizeSqm ? Number(propertySizeSqm) : undefined,
              storiesCount: storiesCount ? Number(storiesCount) : undefined,
              roomsCount: roomsCount ? Number(roomsCount) : undefined,
              bathroomsCount: bathroomsCount ? Number(bathroomsCount) : undefined,
              areas,
              cleaningTypes: houseCleaningTypes,
              condition: houseCondition,
              addOns,
            }
          : {
              category: 'CAR',
              registrationNumber: registrationNumber.trim() || undefined,
              cleaningTypes: carCleaningTypes,
              condition: carCondition,
              exteriorServices,
              interiorServices,
              deepServices,
            };

      const scheduledDateTime = resolveScheduledDate(timePreference, customDateTime);
      const now = Date.now();
      const finalBudget = budgetOption === 'NOT_SURE' ? 0 : Number(budget);

      const result = await callFunction<any, { jobId: string }>('createBooking', { idempotencyKey: `booking-${user.uid}-${now}`, booking: {
        customerId: user.uid,
        customerName: profile?.displayName,
        customerPhoto: profile?.photoURL ?? '',
        category,
        serviceType: serviceLabel(),
        checklist,
        description,
        location: { lat: coordinates?.lat ?? 0, lng: coordinates?.lng ?? 0, address },
        scheduledTime: timePreference,
        timePreference,
        scheduledDateTime: Timestamp.fromDate(scheduledDateTime),
        status: JobStatus.PENDING,
        // Only pricing strategy left is client-vetted bidding — the field
        // stays on the doc for forward-compatibility, just not user-chosen.
        pricingStrategy: 'RECEIVE_BIDS',
        budget: finalBudget,
        // Jobs stay open to new bids for 30 minutes; the customer can
        // increase the budget (which extends this window) or cancel any
        // time while it's running — see offers.tsx.
        biddingExpiresAt: Timestamp.fromMillis(now + BIDDING_WINDOW_MS),
        reminderSent: false,
        photos: photoUris,
        createdAt: serverTimestamp(),
      } });
      router.replace({ pathname: '/booking/offers', params: { jobId: result.jobId } });
    } catch (err) {
      Alert.alert('Error', 'Failed to post job. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-2">
          <TouchableOpacity onPress={goBack} className="w-10 h-10 bg-ink/5 rounded-2xl items-center justify-center">
            <ArrowLeft size={18} color="#150256" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-black text-ink">
              Book {category === 'CAR' ? 'Car' : 'House'} Cleaning
            </Text>
            <Text className="text-[11px] font-bold text-ink/40 uppercase tracking-widest">
              Step {stepIndex + 1} of {STEPS.length}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-1.5 px-5 py-3">
          {STEPS.map((s, i) => (
            <View key={s} className={`h-1.5 flex-1 rounded-full ${stepIndex >= i ? 'bg-accent' : 'bg-ink/10'}`} />
          ))}
        </View>

        <ScrollView contentContainerClassName="px-5 pt-4 pb-10" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 'CATEGORY' && (
            <View>
              <Text className="text-2xl font-black text-ink mb-1">What do you need cleaned?</Text>
              <Text className="text-sm text-ink/50 font-medium mb-6">Choose a service to get started</Text>
              <View className="gap-3">
                {(
                  [
                    { id: 'HOUSE' as const, label: 'House Cleaning', desc: 'Homes, apartments & offices', icon: HomeIcon },
                    { id: 'CAR' as const, label: 'Car Cleaning', desc: 'Interior, exterior & full detail', icon: Car },
                  ]
                ).map(({ id, label, desc, icon: Icon }) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setCategory(id)}
                    activeOpacity={0.85}
                    className={`flex-row items-center gap-4 p-5 rounded-3xl border-2 ${
                      category === id ? 'border-accent bg-accent/5' : 'border-ink/10 bg-ink/[0.02]'
                    }`}
                  >
                    <View className={`w-14 h-14 rounded-2xl items-center justify-center ${category === id ? 'bg-accent' : 'bg-white border border-ink/10'}`}>
                      <Icon size={26} color={category === id ? '#fff' : '#150256'} />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-base font-black ${category === id ? 'text-accent' : 'text-ink'}`}>{label}</Text>
                      <Text className="text-xs text-ink/50 font-medium mt-0.5">{desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {step === 'CHECKLIST' && category === 'HOUSE' && (
            <View className="gap-7">
              <View>
                <SectionLabel n={1} title="Property Size & Stories" />
                <View className="gap-4">
                  <View>
                    <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">
                      Number of Stories (Floors)
                    </Text>
                    <View className="flex-row gap-2 flex-wrap">
                      {[
                        { id: '1', label: '1 Story (Single Level)' },
                        { id: '2', label: '2 Stories' },
                        { id: '3', label: '3 Stories' },
                        { id: '4', label: '4+ Stories' },
                      ].map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => setStoriesCount(item.id)}
                          className={`px-4 py-3 rounded-2xl border ${
                            storiesCount === item.id
                              ? 'border-accent bg-accent/10'
                              : 'border-ink/10 bg-ink/[0.02]'
                          }`}
                        >
                          <Text
                            className={`text-xs font-black ${
                              storiesCount === item.id ? 'text-accent' : 'text-ink/70'
                            }`}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View>
                    <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">
                      Number of Rooms to Clean
                    </Text>
                    <View className="flex-row gap-2 flex-wrap">
                      {['1 Room', '2 Rooms', '3 Rooms', '4 Rooms', '5 Rooms', '6+ Rooms'].map((label, idx) => {
                        const val = String(idx + 1);
                        return (
                          <TouchableOpacity
                            key={label}
                            onPress={() => setRoomsCount(val)}
                            className={`px-4 py-3 rounded-2xl border ${
                              roomsCount === val
                                ? 'border-accent bg-accent/10'
                                : 'border-ink/10 bg-ink/[0.02]'
                            }`}
                          >
                            <Text
                              className={`text-xs font-black ${
                                roomsCount === val ? 'text-accent' : 'text-ink/70'
                              }`}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View>
                    <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">
                      Number of Bathrooms
                    </Text>
                    <View className="flex-row gap-2 flex-wrap">
                      {['1 Bath', '2 Baths', '3 Baths', '4+ Baths'].map((label, idx) => {
                        const val = String(idx + 1);
                        return (
                          <TouchableOpacity
                            key={label}
                            onPress={() => setBathroomsCount(val)}
                            className={`px-4 py-3 rounded-2xl border ${
                              bathroomsCount === val
                                ? 'border-accent bg-accent/10'
                                : 'border-ink/10 bg-ink/[0.02]'
                            }`}
                          >
                            <Text
                              className={`text-xs font-black ${
                                bathroomsCount === val ? 'text-accent' : 'text-ink/70'
                              }`}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View>
                    <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">
                      Approximate Property Size (m²) · Optional
                    </Text>
                    <TextInput
                      className="border-2 border-ink/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-ink bg-ink/[0.02]"
                      placeholder="e.g. 120"
                      placeholderTextColor="#9C94C4"
                      keyboardType="number-pad"
                      value={propertySizeSqm}
                      onChangeText={setPropertySizeSqm}
                    />
                  </View>
                </View>
              </View>
              <View>
                <SectionLabel n={2} title="Areas to Clean" />
                <ChipGrid options={HOUSE_AREAS as unknown as string[]} selected={areas} onToggle={(v) => setAreas(toggleItem(areas, v))} />
              </View>
              <View>
                <SectionLabel n={3} title="Cleaning Required" />
                <View className="gap-3">
                  {HOUSE_CLEANING_TYPES.map(({ id, label, desc }) => (
                    <OptionRow key={id} label={label} desc={desc} selected={houseCleaningTypes.includes(id)} onPress={() => setHouseCleaningTypes(toggleItem(houseCleaningTypes, id))} />
                  ))}
                </View>
              </View>
              <View>
                <SectionLabel n={4} title="House Condition" />
                <View className="flex-row gap-2">
                  {HOUSE_CONDITIONS.map(({ id, label }) => (
                    <Pill key={id} label={label} selected={houseCondition === id} onPress={() => setHouseCondition(id)} />
                  ))}
                </View>
              </View>
              <View>
                <SectionLabel n={5} title="Additional Services" optional />
                <ChipGrid options={HOUSE_ADD_ONS as unknown as string[]} selected={addOns} onToggle={(v) => setAddOns(toggleItem(addOns, v))} />
              </View>
            </View>
          )}

          {step === 'CHECKLIST' && category === 'CAR' && (
            <View className="gap-7">
              <View>
                <SectionLabel n={1} title="Type of Cleaning Required" />
                <View className="gap-3">
                  {CAR_CLEANING_TYPES.map(({ id, label, desc }) => (
                    <OptionRow key={id} label={label} desc={desc} selected={carCleaningTypes.includes(id)} onPress={() => setCarCleaningTypes(toggleItem(carCleaningTypes, id))} />
                  ))}
                </View>
              </View>
              <View>
                <SectionLabel n={2} title="Vehicle Condition" />
                <View className="flex-row gap-2 flex-wrap">
                  {CAR_CONDITIONS.map(({ id, label }) => (
                    <Pill key={id} label={label} selected={carCondition === id} onPress={() => setCarCondition(id)} />
                  ))}
                </View>
              </View>
              <View>
                <SectionLabel n={3} title="Registration Number" optional />
                <View className="border-2 border-ink/10 rounded-2xl bg-ink/[0.02] flex-row items-center gap-3 px-4">
                  <Text className="text-sm font-black text-ink/30">#</Text>
                  <TextInput
                    className="flex-1 py-4 text-sm font-bold text-ink uppercase"
                    placeholder="e.g. ABC 1234"
                    placeholderTextColor="#9C94C4"
                    autoCapitalize="characters"
                    value={registrationNumber}
                    onChangeText={(v) => setRegistrationNumber(v.toUpperCase())}
                  />
                </View>
                <Text className="text-[11px] text-ink/40 font-medium mt-1.5 ml-1">
                  Helps the cleaner identify your car on arrival
                </Text>
              </View>

              <View>
                <SectionLabel n={4} title="Exterior Cleaning" optional />
                <ChipGrid options={CAR_EXTERIOR_SERVICES as unknown as string[]} selected={exteriorServices} onToggle={(v) => setExteriorServices(toggleItem(exteriorServices, v))} />
              </View>
              <View>
                <SectionLabel n={5} title="Interior Cleaning" optional />
                <ChipGrid options={CAR_INTERIOR_SERVICES as unknown as string[]} selected={interiorServices} onToggle={(v) => setInteriorServices(toggleItem(interiorServices, v))} />
              </View>
              <View>
                <SectionLabel n={6} title="Deep Cleaning" optional />
                <ChipGrid options={CAR_DEEP_SERVICES as unknown as string[]} selected={deepServices} onToggle={(v) => setDeepServices(toggleItem(deepServices, v))} />
              </View>
            </View>
          )}

          {step === 'DETAILS' && (
            <View>
              <Text className="text-2xl font-black text-ink mb-1">Details & Condition</Text>
              <Text className="text-sm text-ink/50 font-medium mb-6">
                Add notes and photos of dirty areas so cleaners know what needs cleaning and quote accurately
              </Text>

              <Text className="text-xs font-black text-ink/40 uppercase tracking-widest mb-2">Special Instructions (Optional)</Text>
              <TextInput
                className="border-2 border-ink/10 rounded-2xl px-4 py-4 text-sm font-medium text-ink bg-ink/[0.02] mb-6"
                placeholder="Gate code, pets, stains to focus on, parking instructions…"
                placeholderTextColor="#9C94C4"
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
                textAlignVertical="top"
              />

              <View className="mb-2">
                <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-1">
                  Photos of What Needs Cleaning (Dirty areas & vehicle)
                </Text>
                <Text className="text-xs text-ink/50 font-medium mb-3">
                  Upload photos of dirty rooms, stains, surfaces, pet hair, or vehicle condition ({photoUris.length}/6)
                </Text>
              </View>

              <View className="flex-row flex-wrap gap-3 mb-4">
                {photoUris.map((url) => (
                  <View key={url} className="w-24 h-24 rounded-2xl overflow-hidden border border-ink/10 relative">
                    <Image source={{ uri: url }} style={{ width: 96, height: 96 }} />
                    <View className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded-md">
                      <Text className="text-[9px] font-black text-white uppercase">Needs Cleaning</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removePhoto(url)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/70 rounded-full items-center justify-center"
                    >
                      <X size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {photoUris.length < 6 && (
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => pickPhoto(true)}
                    disabled={isUploadingPhoto}
                    activeOpacity={0.8}
                    className="flex-1 py-3.5 px-4 rounded-2xl border-2 border-dashed border-accent/40 bg-accent/5 flex-row items-center justify-center gap-2"
                  >
                    {isUploadingPhoto ? (
                      <ActivityIndicator color="#3906D2" size="small" />
                    ) : (
                      <>
                        <Camera size={18} color="#3906D2" />
                        <Text className="text-xs font-black text-accent uppercase">Take Photo</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => pickPhoto(false)}
                    disabled={isUploadingPhoto}
                    activeOpacity={0.8}
                    className="flex-1 py-3.5 px-4 rounded-2xl border-2 border-dashed border-ink/20 bg-ink/[0.02] flex-row items-center justify-center gap-2"
                  >
                    {isUploadingPhoto ? (
                      <ActivityIndicator color="#3906D2" size="small" />
                    ) : (
                      <>
                        <Sparkles size={18} color="#150256" />
                        <Text className="text-xs font-black text-ink uppercase">Choose from Library</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {step === 'LOCATION' && (
            <View>
              <Text className="text-2xl font-black text-ink mb-1">Where is the job?</Text>
              <Text className="text-sm text-ink/50 font-medium mb-6">Enter the address or use your current location</Text>

              <View className="mb-4">
                <Text className="text-xs font-black text-ink/40 uppercase tracking-widest mb-2">Address</Text>
                <View className="border-2 border-ink/10 rounded-2xl bg-ink/[0.02] flex-row items-center gap-3 px-4">
                  <MapPin size={18} color="#9C94C4" />
                  <TextInput
                    className="flex-1 py-4 text-sm font-medium text-ink"
                    placeholder="Enter an address…"
                    placeholderTextColor="#9C94C4"
                    value={address}
                    onChangeText={setAddress}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={useCurrentLocation}
                disabled={isFetchingLocation}
                className="flex-row items-center gap-3 bg-accent/10 border border-accent/20 rounded-2xl px-4 py-4"
                activeOpacity={0.8}
              >
                {isFetchingLocation ? <ActivityIndicator size="small" color="#3906D2" /> : <MapPin size={18} color="#3906D2" />}
                <Text className="text-sm font-black text-accent">
                  {isFetchingLocation ? 'Detecting location…' : 'Use my current location'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'SCHEDULE' && (
            <View>
              <Text className="text-2xl font-black text-ink mb-1">When do you need it?</Text>
              <Text className="text-sm text-ink/50 font-medium mb-6">Pick a time that works for you</Text>
              <View className="gap-3">
                {TIME_OPTIONS.map(({ id, label, sub }) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => {
                      setTimePreference(id);
                      // Android's picker is a modal dialog (one field at a time,
                      // auto-advance date -> time on confirm). iOS renders both
                      // compact pickers inline below instead — see the block
                      // after this list.
                      if (id === 'CUSTOM' && Platform.OS === 'android') setPickerMode('date');
                    }}
                    activeOpacity={0.8}
                    className={`flex-row items-center gap-4 p-4 rounded-3xl border-2 ${
                      timePreference === id ? 'border-accent bg-accent/5' : 'border-ink/10 bg-ink/[0.02]'
                    }`}
                  >
                    <View className={`w-10 h-10 rounded-2xl items-center justify-center ${timePreference === id ? 'bg-accent' : 'bg-white border border-ink/10'}`}>
                      <Clock size={18} color={timePreference === id ? '#fff' : '#9C94C4'} />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-sm font-black ${timePreference === id ? 'text-accent' : 'text-ink'}`}>{label}</Text>
                      <Text className="text-xs text-ink/50 font-medium mt-0.5">
                        {id === 'CUSTOM' && customDateTime
                          ? customDateTime.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                          : sub}
                      </Text>
                    </View>
                    {id === 'CUSTOM' && timePreference === 'CUSTOM' && Platform.OS === 'android' && (
                      <TouchableOpacity onPress={() => setPickerMode('date')} className="p-2">
                        <CalendarDays size={18} color="#3906D2" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Android: modal dialog, one field at a time, auto-advances date -> time. */}
              {Platform.OS === 'android' && pickerMode && (
                <DateTimePicker
                  value={customDateTime ?? new Date()}
                  mode={pickerMode}
                  minimumDate={new Date()}
                  onChange={(event, selected) => {
                    setPickerMode(null);
                    if (event.type === 'dismissed' || !selected) return;
                    if (pickerMode === 'date') {
                      const base = customDateTime ?? new Date();
                      const merged = new Date(selected);
                      merged.setHours(base.getHours(), base.getMinutes());
                      setCustomDateTime(merged);
                      setPickerMode('time');
                    } else {
                      const merged = new Date(customDateTime ?? selected);
                      merged.setHours(selected.getHours(), selected.getMinutes());
                      setCustomDateTime(merged);
                    }
                  }}
                />
              )}

              {/* iOS: two compact inline pickers (tap to open a sheet), no modal juggling. */}
              {Platform.OS === 'ios' && timePreference === 'CUSTOM' && (
                <View className="flex-row gap-3 mt-3">
                  <DateTimePicker
                    value={customDateTime ?? new Date()}
                    mode="date"
                    display="compact"
                    minimumDate={new Date()}
                    onChange={(_, selected) => {
                      if (!selected) return;
                      const base = customDateTime ?? new Date();
                      const merged = new Date(selected);
                      merged.setHours(base.getHours(), base.getMinutes());
                      setCustomDateTime(merged);
                    }}
                  />
                  <DateTimePicker
                    value={customDateTime ?? new Date()}
                    mode="time"
                    display="compact"
                    onChange={(_, selected) => {
                      if (!selected) return;
                      const merged = new Date(customDateTime ?? selected);
                      merged.setHours(selected.getHours(), selected.getMinutes());
                      setCustomDateTime(merged);
                    }}
                  />
                </View>
              )}
            </View>
          )}

          {step === 'BUDGET' && (
            <View>
              <Text className="text-2xl font-black text-ink mb-1">Set your budget</Text>
              <Text className="text-sm text-ink/50 font-medium mb-6">
                Choose how you want to price your job. Your request stays open for 30 minutes to receive competitive bids from local pros.
              </Text>

              {/* Option 1: Not sure - check cleaner bids */}
              <TouchableOpacity
                onPress={() => setBudgetOption('NOT_SURE')}
                activeOpacity={0.85}
                className={`p-4 rounded-3xl border-2 mb-3 ${
                  budgetOption === 'NOT_SURE'
                    ? 'border-accent bg-accent/5'
                    : 'border-ink/10 bg-white'
                }`}
              >
                <View className="flex-row items-start gap-3">
                  <View
                    className={`w-10 h-10 rounded-2xl items-center justify-center ${
                      budgetOption === 'NOT_SURE' ? 'bg-accent' : 'bg-ink/5'
                    }`}
                  >
                    <Sparkles size={20} color={budgetOption === 'NOT_SURE' ? '#fff' : '#150256'} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text className="text-sm font-black text-ink">
                        Not sure — check cleaner bids
                      </Text>
                      <View className="bg-accent/10 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] font-black text-accent uppercase">Popular</Text>
                      </View>
                    </View>
                    <Text className="text-xs text-ink/60 font-medium leading-relaxed">
                      Cleaners will review your checklist and submit their best quotes. You compare prices, ratings, and choose the pro you like.
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Option 2: I have a specific budget */}
              <TouchableOpacity
                onPress={() => setBudgetOption('FIXED')}
                activeOpacity={0.85}
                className={`p-4 rounded-3xl border-2 mb-4 ${
                  budgetOption === 'FIXED'
                    ? 'border-accent bg-accent/5'
                    : 'border-ink/10 bg-white'
                }`}
              >
                <View className="flex-row items-start gap-3">
                  <View
                    className={`w-10 h-10 rounded-2xl items-center justify-center ${
                      budgetOption === 'FIXED' ? 'bg-accent' : 'bg-ink/5'
                    }`}
                  >
                    <DollarSign size={20} color={budgetOption === 'FIXED' ? '#fff' : '#150256'} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-black text-ink mb-1">
                      I have a specific budget in mind
                    </Text>
                    <Text className="text-xs text-ink/60 font-medium">
                      Set a target amount you are willing to pay for cleaners to bid around.
                    </Text>
                  </View>
                </View>

                {budgetOption === 'FIXED' && (
                  <View className="mt-4 pt-4 border-t border-ink/5">
                    <Text className="text-xs font-black text-ink/40 uppercase tracking-widest mb-2">
                      Your Target Budget (USD)
                    </Text>
                    <View className="border-2 border-ink/10 rounded-2xl bg-white px-4 py-3 mb-3">
                      <TextInput
                        className="text-2xl font-black text-ink"
                        placeholder="$0"
                        placeholderTextColor="#9C94C4"
                        keyboardType="decimal-pad"
                        value={budget}
                        onChangeText={setBudget}
                        autoFocus
                      />
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {['30', '50', '75', '100', '150'].map((preset) => (
                        <TouchableOpacity
                          key={preset}
                          onPress={() => setBudget(preset)}
                          className={`px-3.5 py-2 rounded-xl border ${
                            budget === preset ? 'border-accent bg-accent/10' : 'border-ink/10 bg-white'
                          }`}
                        >
                          <Text
                            className={`text-xs font-black ${
                              budget === preset ? 'text-accent' : 'text-ink/70'
                            }`}
                          >
                            ${preset}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              <View className="bg-ink/[0.03] rounded-3xl p-5 border border-ink/10 gap-3">
                <Text className="text-xs font-black text-ink/40 uppercase tracking-widest">Review Request</Text>
                <SummaryRow label="Service" value={serviceLabel()} />
                {category === 'HOUSE' && (
                  <SummaryRow
                    label="Layout"
                    value={`${storiesCount} ${Number(storiesCount) > 1 ? 'Stories' : 'Story'} · ${roomsCount} Rooms · ${bathroomsCount} Baths`}
                  />
                )}
                <SummaryRow
                  label="Budget"
                  value={budgetOption === 'NOT_SURE' ? 'Open to cleaner bids' : budget ? `$${budget}` : 'Not set'}
                />
                <SummaryRow label="Location" value={address || 'Not set'} />
                <SummaryRow
                  label="Time"
                  value={
                    timePreference === 'CUSTOM' && customDateTime
                      ? customDateTime.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                      : TIME_OPTIONS.find((t) => t.id === timePreference)?.label ?? ''
                  }
                />
                <SummaryRow
                  label="Condition Photos"
                  value={photoUris.length > 0 ? `${photoUris.length} photos of dirty areas` : 'None'}
                />
              </View>
            </View>
          )}
        </ScrollView>

        <View className="px-5 pb-8 pt-4 border-t border-ink/5 bg-white">
          <TouchableOpacity
            onPress={step === 'BUDGET' ? handleSubmit : goNext}
            disabled={!canProceed() || isSubmitting}
            activeOpacity={0.85}
            className={`py-5 rounded-[28px] items-center ${canProceed() ? 'bg-accent shadow-lg shadow-accent/30' : 'bg-ink/10'}`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`font-black text-sm uppercase tracking-widest ${canProceed() ? 'text-white' : 'text-ink/30'}`}>
                {step === 'BUDGET' ? 'Submit Request' : 'Next'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionLabel({ n, title, optional }: { n: number; title: string; optional?: boolean }) {
  return (
    <View className="flex-row items-center gap-2 mb-3">
      <View className="w-5 h-5 rounded-full bg-accent items-center justify-center">
        <Text className="text-[10px] font-black text-white">{n}</Text>
      </View>
      <Text className="text-sm font-black text-ink">{title}</Text>
      {optional && <Text className="text-[10px] font-bold text-ink/30 uppercase">Optional</Text>}
    </View>
  );
}

function ChipGrid({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => (
        <Pill key={opt} label={opt} selected={selected.includes(opt)} onPress={() => onToggle(opt)} />
      ))}
    </View>
  );
}

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`px-4 py-2.5 rounded-full border-2 ${selected ? 'border-accent bg-accent' : 'border-ink/10 bg-white'}`}
    >
      <Text className={`text-xs font-black ${selected ? 'text-white' : 'text-ink/70'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

function OptionRow({ label, desc, selected, onPress }: { label: string; desc: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`p-4 rounded-2xl border-2 ${selected ? 'border-accent bg-accent/5' : 'border-ink/10 bg-ink/[0.02]'}`}
    >
      <Text className={`text-sm font-black ${selected ? 'text-accent' : 'text-ink'}`}>{label}</Text>
      <Text className="text-xs text-ink/50 font-medium mt-0.5">{desc}</Text>
    </TouchableOpacity>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-xs text-ink/50 font-medium">{label}</Text>
      <Text className="text-xs font-black text-ink flex-1 text-right ml-4" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
