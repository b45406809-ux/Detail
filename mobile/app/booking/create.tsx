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
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { db, addDoc, collection, serverTimestamp, Timestamp } from '../../services/supabase';
import { uploadJobPhoto } from '../../services/storage';
import { JobStatus, ServiceCategory, HouseChecklist, CarChecklist } from '../../types';
import * as Catalog from '../../constants/services';

// A posted job stays open to new bids for 30 minutes — see offers.tsx for
// the countdown UI and the increase-budget/cancel actions available while
// it's running.
const BIDDING_WINDOW_MS = 30 * 60 * 1000;
const MIN_CUSTOM_BOOKING_LEAD_MS = 30 * 60 * 1000;
const MAX_CUSTOM_BOOKING_HORIZON_MS = 180 * 24 * 60 * 60 * 1000;

/** Derive a concrete Date for every schedule preset so every job — not just
 * CUSTOM ones — has one queryable scheduledDateTime for the reminder system. */
function resolveScheduledDate(
  preference: (typeof Catalog.TIME_OPTIONS)[number]['id'],
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

  // Keep shortcut-selected categories, but show the category/mode step so
  // House and Car shortcuts still expose the Book Now choice.
  const [stepIndex, setStepIndex] = useState(0);
  const [category, setCategory] = useState<ServiceCategory | null>(preselectedCategory ?? null);

  const [serviceId, setServiceId] = useState('');
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const setGroup = (key: string, value: string[]) => setSelections((prev) => ({ ...prev, [key]: value }));
  const toggleGroup = (key: string, value: string) => setSelections((prev) => ({ ...prev, [key]: toggleItem(prev[key] ?? [], value) }));
  const setChoice = (key: string, value: string) => setChoices((prev) => ({ ...prev, [key]: value }));
  const resetDetails = () => { setSelections({}); setChoices({}); };

  const [description, setDescription] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  const [timePreference, setTimePreference] = useState<(typeof Catalog.TIME_OPTIONS)[number]['id']>('ASAP');
  const [customDateTime, setCustomDateTime] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [budgetOption, setBudgetOption] = useState<'NOT_SURE' | 'FIXED'>('NOT_SURE');
  const [budget, setBudget] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingMode, setBookingMode] = useState<'SCHEDULED'|'INSTANT'>('SCHEDULED');
  const [suppliesRequired, setSuppliesRequired] = useState(false);
  const [suppliesFee, setSuppliesFee] = useState(10);

  useEffect(() => {
    callFunction<{}, {suppliesFeeUsd?:number}>('getBetaConfig',{}).then(value=>{
      if(Number.isFinite(Number(value.suppliesFeeUsd)))setSuppliesFee(Math.max(0,Number(value.suppliesFeeUsd)));
    }).catch(()=>{});
  },[]);

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
        if (!serviceId || !category) return false;
        if (category === 'HOUSE') {
          if (serviceId === 'SPECIFIC_ROOM') return !!choices.areaSize && ((selections.rooms?.length ?? 0) > 0 || (selections.parts?.length ?? 0) > 0);
          return !!choices.propertyType && !!choices.propertySize && !!choices.bedrooms && !!choices.bathrooms && !!choices.condition;
        }
        return !!choices.vehicleType && !!choices.vehicleSize && !!choices.condition && (serviceId === 'EXTERIOR_WASH' || !!choices.seats) && (serviceId !== 'DEEP_DETAIL' || !!choices.exteriorCondition);
      case 'DETAILS':
        return true;
      case 'LOCATION':
        return !!address || !!coordinates;
      case 'SCHEDULE':
        return bookingMode==='INSTANT' || (!!timePreference && (timePreference !== 'CUSTOM' || (!!customDateTime && customDateTime.getTime() >= Date.now() + MIN_CUSTOM_BOOKING_LEAD_MS && customDateTime.getTime() <= Date.now() + MAX_CUSTOM_BOOKING_HORIZON_MS)));
      case 'BUDGET':
        return bookingMode==='INSTANT' || budgetOption === 'NOT_SURE' || (!!budget && Number(budget) > 0);
      default:
        return true;
    }
  };

  const serviceLabel = () => {
    const packages = category ? Catalog.SERVICE_PACKAGES[category] : [];
    return packages.find((item) => item.id === serviceId)?.label ?? 'Cleaning';
  };

  const handleSubmit = async () => {
    if (!user || !category) return;
    setIsSubmitting(true);
    try {
      const checklist: HouseChecklist | CarChecklist = category === 'HOUSE'
        ? { category: 'HOUSE', packageId: serviceId, selections, choices, areas: selections.areas ?? [], cleaningTypes: [serviceId], condition: choices.condition as HouseChecklist['condition'], addOns: selections.additions ?? [] }
        : { category: 'CAR', packageId: serviceId, selections, choices, vehicleType: choices.vehicleType, cleaningTypes: [serviceId], condition: choices.condition as CarChecklist['condition'], exteriorServices: selections.exterior ?? [], interiorServices: selections.interior ?? [], deepServices: selections.deep ?? [] };

      const scheduledDateTime = bookingMode==='INSTANT' ? null : resolveScheduledDate(timePreference, customDateTime);
      if (bookingMode==='SCHEDULED' && timePreference==='CUSTOM' && (!customDateTime || customDateTime.getTime() < Date.now()+MIN_CUSTOM_BOOKING_LEAD_MS || customDateTime.getTime() > Date.now()+MAX_CUSTOM_BOOKING_HORIZON_MS)) {
        Alert.alert('Choose a valid time', 'Custom bookings must be at least 30 minutes from now and within the next 180 days.');
        setIsSubmitting(false);
        return;
      }
      const now = Date.now();
      const finalBudget = budgetOption === 'NOT_SURE' ? 0 : Number(budget);
      let resolvedCoordinates = coordinates;
      if (!resolvedCoordinates && address.trim()) {
        try {
          const [match] = await Location.geocodeAsync(address.trim());
          if (match) resolvedCoordinates = { lat: match.latitude, lng: match.longitude };
        } catch {
          // The server requires a map pin so matching and dispatch never use a
          // fabricated 0,0 coordinate. Ask the customer to resolve the address.
        }
      }
      if (!resolvedCoordinates || !Number.isFinite(resolvedCoordinates.lat) || !Number.isFinite(resolvedCoordinates.lng)
        || Math.abs(resolvedCoordinates.lat) > 90 || Math.abs(resolvedCoordinates.lng) > 180
        || (resolvedCoordinates.lat === 0 && resolvedCoordinates.lng === 0)) {
        Alert.alert('Confirm the job location', 'We could not map that address. Use your current location or enter a more specific address before continuing.');
        return;
      }

      const result = await callFunction<any, { jobId: string }>('createBooking', { idempotencyKey: `booking-${user.uid}-${now}`, booking: {
        customerId: user.uid,
        customerName: profile?.displayName,
        customerPhoto: profile?.photoURL ?? '',
        category,
        serviceId,
        bookingMode,
        suppliesRequired,
        serviceType: serviceLabel(),
        checklist,
        description,
        location: { lat: resolvedCoordinates.lat, lng: resolvedCoordinates.lng, address },
        scheduledTime: timePreference,
        timePreference,
        scheduledDateTime: scheduledDateTime ? Timestamp.fromDate(scheduledDateTime) : null,
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
      if(bookingMode==='INSTANT')router.replace({pathname:'/tracking/[jobId]',params:{jobId:result.jobId}});
      else router.replace({ pathname: '/booking/offers', params: { jobId: result.jobId } });
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
            <Text className="text-xl font-display font-black text-ink">
              Book {category === 'CAR' ? 'Car' : 'House'} Cleaning
            </Text>
            <Text className="font-sans text-[11px] font-bold text-ink/40 uppercase tracking-widest">
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
              <Text className="text-2xl font-display font-black text-ink mb-1">What do you need cleaned?</Text>
              <Text className="font-sans text-sm text-ink/50 font-medium mb-6">Choose a service to get started</Text>
              <View className="gap-3">
                {(
                  [
                    { id: 'HOUSE' as const, label: 'House Cleaning', desc: 'Homes, apartments & offices', icon: HomeIcon },
                    { id: 'CAR' as const, label: 'Car Cleaning', desc: 'Interior, exterior & full detail', icon: Car },
                  ]
                ).map(({ id, label, desc, icon: Icon }) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => { setCategory(id); setServiceId(''); resetDetails(); }}
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
                      <Text className="font-sans text-xs text-ink/50 font-medium mt-0.5">{desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest mt-7 mb-2">How would you like to book?</Text>
              {([
                {id:'SCHEDULED' as const,title:'Schedule and compare quotes',copy:'Cleaners send a price for you to review.'},
                {id:'INSTANT' as const,title:'Book now',copy:'Find an available nearby cleaner at the listed starting price.'},
              ]).map(option=><TouchableOpacity key={option.id} onPress={()=>setBookingMode(option.id)} className={`p-4 rounded-2xl border-2 mb-2 ${bookingMode===option.id?'border-accent bg-accent/5':'border-ink/10 bg-white'}`}><Text className="font-display font-black text-ink">{option.title}</Text><Text className="font-sans text-xs text-ink/50 mt-1">{option.copy}</Text></TouchableOpacity>)}
            </View>
          )}

          {step === 'CHECKLIST' && category && (
            <ServiceChecklist category={category} serviceId={serviceId} setServiceId={(value) => { setServiceId(value); resetDetails(); }} selections={selections} setGroup={setGroup} toggleGroup={toggleGroup} choices={choices} setChoice={setChoice} />
          )}

          {step === 'DETAILS' && (
            <View>
              <Text className="text-2xl font-display font-black text-ink mb-1">Details & Condition</Text>
              <Text className="font-sans text-sm text-ink/50 font-medium mb-6">
                Add notes and photos of dirty areas so cleaners know what needs cleaning and quote accurately
              </Text>

              <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest mb-2">Special Instructions (Optional)</Text>
              <TouchableOpacity onPress={()=>setSuppliesRequired(value=>!value)} className="flex-row items-center gap-3 p-4 rounded-2xl border border-ink/10 bg-white mb-5">
                <View className={`w-5 h-5 rounded border-2 items-center justify-center ${suppliesRequired?'bg-accent border-accent':'border-ink/30'}`}>{suppliesRequired&&<Text className="text-white text-xs font-black">✓</Text>}</View>
                <View className="flex-1"><Text className="font-display font-black text-ink">Cleaner should bring supplies</Text><Text className="font-sans text-xs text-ink/50 mt-1">Adds ${suppliesFee.toFixed(2)} to the booking.</Text></View>
              </TouchableOpacity>
              <TextInput
                className="font-sans border-2 border-ink/10 rounded-2xl px-4 py-4 text-sm font-medium text-ink bg-ink/[0.02] mb-6"
                placeholder="Gate code, pets, stains to focus on, parking instructions…"
                placeholderTextColor="#9C94C4"
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
                textAlignVertical="top"
              />

              <View className="mb-2">
                <Text className="text-xs font-display font-black text-ink/50 uppercase tracking-widest mb-1">
                  Photos of What Needs Cleaning (Dirty areas & vehicle)
                </Text>
                <Text className="font-sans text-xs text-ink/50 font-medium mb-3">
                  Upload photos of dirty rooms, stains, surfaces, pet hair, or vehicle condition ({photoUris.length}/6)
                </Text>
              </View>

              <View className="flex-row flex-wrap gap-3 mb-4">
                {photoUris.map((url) => (
                  <View key={url} className="w-24 h-24 rounded-2xl overflow-hidden border border-ink/10 relative">
                    <Image source={{ uri: url }} style={{ width: 96, height: 96 }} />
                    <View className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded-md">
                      <Text className="text-[9px] font-display font-black text-white uppercase">Needs Cleaning</Text>
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
                        <Text className="text-xs font-display font-black text-accent uppercase">Take Photo</Text>
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
                        <Text className="text-xs font-display font-black text-ink uppercase">Choose from Library</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {step === 'LOCATION' && (
            <View>
              <Text className="text-2xl font-display font-black text-ink mb-1">Where is the job?</Text>
              <Text className="font-sans text-sm text-ink/50 font-medium mb-6">Enter the address or use your current location</Text>

              <View className="mb-4">
                <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest mb-2">Address</Text>
                <View className="border-2 border-ink/10 rounded-2xl bg-ink/[0.02] flex-row items-center gap-3 px-4">
                  <MapPin size={18} color="#9C94C4" />
                  <TextInput
                    className="font-sans flex-1 py-4 text-sm font-medium text-ink"
                    placeholder="Enter an address…"
                    placeholderTextColor="#9C94C4"
                    value={address}
                    onChangeText={(value) => { setAddress(value); setCoordinates(null); }}
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
                <Text className="text-sm font-display font-black text-accent">
                  {isFetchingLocation ? 'Detecting location…' : 'Use my current location'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'SCHEDULE' && (
            <View>
              <Text className="text-2xl font-display font-black text-ink mb-1">{bookingMode==='INSTANT'?'Book now':'When do you need it?'}</Text>
              {bookingMode==='INSTANT'?<Text className="font-sans text-sm text-ink/50 font-medium mb-6">We will notify eligible online cleaners near your address. Your exact address stays private until a cleaner accepts.</Text>:<>
              <Text className="font-sans text-sm text-ink/50 font-medium mb-6">Pick a time that works for you</Text>
              <View className="gap-3">
        {Catalog.TIME_OPTIONS.map(({ id, label, sub }) => (
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
                      <Text className="font-sans text-xs text-ink/50 font-medium mt-0.5">
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
                  minimumDate={new Date(Date.now() + MIN_CUSTOM_BOOKING_LEAD_MS)}
                  maximumDate={new Date(Date.now() + MAX_CUSTOM_BOOKING_HORIZON_MS)}
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
                    minimumDate={new Date(Date.now() + MIN_CUSTOM_BOOKING_LEAD_MS)}
                    maximumDate={new Date(Date.now() + MAX_CUSTOM_BOOKING_HORIZON_MS)}
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
              </>}
            </View>
          )}

          {step === 'BUDGET' && (
            <View>
              {bookingMode==='INSTANT'?<>
                <Text className="text-2xl font-display font-black text-ink mb-2">Confirm your price</Text>
                <Text className="font-sans text-sm text-ink/50 mb-5">Book Now uses the listed starting price. A cleaner can accept or decline; the cleaner’s estimated platform payout is 90% of this amount.</Text>
                <View className="rounded-2xl border border-ink/10 bg-white p-4 gap-2"><Text className="font-sans text-sm text-ink">{serviceLabel()} starting price: ${Number(Catalog.SERVICE_PACKAGES[category!].find(item=>item.id===serviceId)?.price.replace('$','')??0).toFixed(2)}</Text>{suppliesRequired&&<Text className="font-sans text-sm text-ink">Supplies: ${suppliesFee.toFixed(2)}</Text>}<Text className="font-display font-black text-lg text-ink">Total: ${(Number(Catalog.SERVICE_PACKAGES[category!].find(item=>item.id===serviceId)?.price.replace('$','')??0)+(suppliesRequired?suppliesFee:0)).toFixed(2)}</Text></View>
              </>:<>
              <Text className="text-2xl font-display font-black text-ink mb-1">Set your budget</Text>
              <Text className="font-sans text-sm text-ink/50 font-medium mb-6">
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
                      <Text className="text-sm font-display font-black text-ink">
                        Not sure — check cleaner bids
                      </Text>
                      <View className="bg-accent/10 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] font-display font-black text-accent uppercase">Popular</Text>
                      </View>
                    </View>
                    <Text className="font-sans text-xs text-ink/60 font-medium leading-relaxed">
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
                    <Text className="text-sm font-display font-black text-ink mb-1">
                      I have a specific budget in mind
                    </Text>
                    <Text className="font-sans text-xs text-ink/60 font-medium">
                      Set a target amount you are willing to pay for cleaners to bid around.
                    </Text>
                  </View>
                </View>

                {budgetOption === 'FIXED' && (
                  <View className="mt-4 pt-4 border-t border-ink/5">
                    <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest mb-2">
                      Your Target Budget (USD)
                    </Text>
                    <View className="border-2 border-ink/10 rounded-2xl bg-white px-4 py-3 mb-3">
                      <TextInput
                        className="text-2xl font-display font-black text-ink"
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
              </>}

              <View className="bg-ink/[0.03] rounded-3xl p-5 border border-ink/10 gap-3">
                <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest">Review Request</Text>
                <SummaryRow label="Service" value={serviceLabel()} />
                <SummaryRow label={category === 'HOUSE' ? 'Property' : 'Vehicle'} value={choices.propertyType || choices.vehicleType || 'Details added in checklist'} />
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
                      : Catalog.TIME_OPTIONS.find((t) => t.id === timePreference)?.label ?? ''
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

type ChecklistProps = {
  category: ServiceCategory;
  serviceId: string;
  setServiceId: (value: string) => void;
  selections: Record<string, string[]>;
  setGroup: (key: string, value: string[]) => void;
  toggleGroup: (key: string, value: string) => void;
  choices: Record<string, string>;
  setChoice: (key: string, value: string) => void;
};

function ServiceChecklist({ category, serviceId, setServiceId, selections, setGroup, toggleGroup, choices, setChoice }: ChecklistProps) {
  const packages = Catalog.SERVICE_PACKAGES[category] as readonly { id: string; label: string; price: string; description: string }[];
  const isHouse = category === 'HOUSE';
  const service = serviceId;
  const group = (key: string, title: string, options: string[]) => (
    <MultiSelectGroup key={key} title={title} options={options} selected={selections[key] ?? []} onToggle={(value) => toggleGroup(key, value)} onSelectAll={(values) => setGroup(key, values)} />
  );
  const choice = (key: string, title: string, options: string[]) => (
    <ChoiceGroup key={key} title={title} options={options} selected={choices[key] ?? ''} onSelect={(value) => setChoice(key, value)} />
  );
  const conditions = isHouse ? ['Light', 'Normal', 'Heavy'] : ['Light dirt', 'Normal dirt', 'Heavy dirt', 'Very dirty'];
  const propertyBasics = () => <>
    {choice('propertyType', 'Property type', Catalog.PROPERTY_TYPES)}
    {choice('propertySize', 'Property size · approximate total area', Catalog.PROPERTY_SIZES)}
    {choice('bedrooms', 'Bedrooms', Catalog.BEDROOMS)}
    {choice('bathrooms', 'Bathrooms', Catalog.BATHROOMS)}
  </>;
  const vehicleBasics = () => <>
    {choice('vehicleType', 'Vehicle type', Catalog.VEHICLE_TYPES)}
    {choice('vehicleSize', 'Vehicle size', Catalog.VEHICLE_SIZES)}
  </>;

  return <View className="gap-7">
    <View>
      <Text className="text-2xl font-display font-black text-ink mb-1">{isHouse ? 'House Cleaning' : 'Car Cleaning'}</Text>
      <Text className="font-sans text-sm text-ink/50 font-medium mb-4">Choose one service to get started</Text>
      <View className="gap-3">
        {packages.map((item) => <TouchableOpacity key={item.id} onPress={() => setServiceId(item.id)} activeOpacity={0.85} className={`p-4 rounded-3xl border-2 ${serviceId === item.id ? 'border-accent bg-accent/5' : 'border-ink/10 bg-ink/[0.02]'}`}>
          <View className="flex-row items-center justify-between gap-3"><Text className={`flex-1 text-base font-black ${serviceId === item.id ? 'text-accent' : 'text-ink'}`}>{item.label}</Text><Text className="text-sm font-display font-black text-accent">Starting from {item.price}</Text></View>
          <Text className="font-sans text-xs text-ink/50 font-medium mt-1">{item.description}</Text>
        </TouchableOpacity>)}
      </View>
    </View>

    {!!service && isHouse && <>
      {service === 'SPECIFIC_ROOM' ? <>
        {group('rooms', 'What do you want cleaned? · Rooms', Catalog.ROOM_OPTIONS)}
        {group('parts', 'Specific parts', Catalog.ROOM_PARTS)}
        {choice('areaSize', 'Area size', Catalog.AREA_SIZES)}
        <View className="gap-5">
          <Text className="text-sm font-display font-black text-ink">What should be done?</Text>
          {Object.entries(Catalog.ROOM_TASKS).filter(([room]) => room === 'Windows' ? (selections.parts ?? []).includes('Windows') : (selections.rooms ?? []).includes(room)).map(([room, tasks]) => group(`roomTasks:${room}`, room, tasks))}
        </View>
      </> : <>
        {group('included', 'What’s included', Catalog.HOUSE_TASKS[service] ?? [])}
        {propertyBasics()}
        {service === 'BASIC_HOUSE' && group('areas', 'Areas to clean', Catalog.HOUSE_AREAS)}
        {service === 'STANDARD_HOUSE' && group('areas', 'Additional areas', Catalog.STANDARD_AREAS)}
        {service === 'BASIC_HOUSE' && group('additions', 'Optional additions', Catalog.BASIC_ADDITIONS)}
        {service === 'STANDARD_HOUSE' && group('additions', 'Optional additions', Catalog.STANDARD_ADDITIONS)}
        {service === 'DEEP_HOUSE' && <View className="gap-5"><Text className="text-sm font-display font-black text-ink">Areas requiring extra attention</Text>{Object.entries(Catalog.DEEP_HOUSE_ATTENTION).map(([area, options]) => group(`attention:${area}`, area, options))}</View>}
        {service !== 'DEEP_HOUSE' && choice('condition', 'Property condition', conditions)}
        {service === 'DEEP_HOUSE' && choice('condition', 'Condition', ['Light', 'Moderate', 'Heavy', 'Very Heavy'])}
      </>}
    </>}

    {!!service && !isHouse && <>
      {service === 'EXTERIOR_WASH' && group('included', 'Included', Catalog.CAR_EXTERIOR_TASKS)}
      {service === 'FULL_CAR' && <>{group('exterior', 'Exterior', Catalog.FULL_CAR_EXTERIOR)}{group('interior', 'Interior', Catalog.FULL_CAR_INTERIOR)}</>}
      {service === 'DEEP_DETAIL' && <>{group('deepInterior', 'Interior deep detail', Catalog.DEEP_CAR_INTERIOR)}{group('deepExterior', 'Exterior deep detail', Catalog.DEEP_CAR_EXTERIOR)}</>}
      {vehicleBasics()}
      {service !== 'EXTERIOR_WASH' && choice('seats', 'Number of seats', Catalog.CAR_SEATS)}
      {service === 'EXTERIOR_WASH' && choice('condition', 'Exterior condition', conditions)}
      {service !== 'EXTERIOR_WASH' && choice('condition', 'Interior condition', service === 'DEEP_DETAIL' ? ['Light', 'Moderate', 'Heavy', 'Severe'] : ['Light', 'Normal', 'Heavy', 'Very dirty'])}
      {service === 'DEEP_DETAIL' && choice('exteriorCondition', 'Exterior condition', ['Light dirt', 'Normal dirt', 'Heavy dirt', 'Severe'])}
      {service === 'EXTERIOR_WASH' && group('additions', 'Optional additions', Catalog.CAR_EXTERIOR_ADDITIONS)}
      {service === 'FULL_CAR' && group('additions', 'Optional additions', Catalog.FULL_CAR_ADDITIONS)}
      {service === 'DEEP_DETAIL' && group('attention', 'Areas requiring extra attention', Catalog.DEEP_CAR_ATTENTION)}
    </>}
  </View>;
}

function MultiSelectGroup({ title, options, selected, onToggle, onSelectAll }: { title: string; options: string[]; selected: string[]; onToggle: (value: string) => void; onSelectAll: (values: string[]) => void }) {
  const allSelected = options.length > 0 && selected.length === options.length;
  const checkbox = (checked: boolean) => <View className={`w-5 h-5 rounded-md border-2 items-center justify-center ${checked ? 'border-accent bg-accent' : 'border-ink/25 bg-white'}`}>{checked && <Text className="text-[11px] font-display font-black text-white">✓</Text>}</View>;
  return <View>
    <Text className="text-sm font-display font-black text-ink mb-2">{title}</Text>
    <View className="rounded-2xl border border-ink/10 overflow-hidden">
      <TouchableOpacity onPress={() => onSelectAll(allSelected ? [] : options)} className="flex-row items-center gap-3 px-4 py-3 bg-accent/5 border-b border-ink/5">{checkbox(allSelected)}<Text className="text-xs font-display font-black text-accent uppercase tracking-wide">Select All</Text></TouchableOpacity>
      {options.map((option, index) => { const checked = selected.includes(option); return <TouchableOpacity key={option} onPress={() => onToggle(option)} className={`flex-row items-center gap-3 px-4 py-3 ${index < options.length - 1 ? 'border-b border-ink/5' : ''}`}>
        {checkbox(checked)}<Text className={`flex-1 text-sm font-medium ${checked ? 'text-ink' : 'text-ink/70'}`}>{option}</Text>
      </TouchableOpacity>; })}
    </View>
  </View>;
}

function ChoiceGroup({ title, options, selected, onSelect }: { title: string; options: string[]; selected: string; onSelect: (value: string) => void }) {
  return <View><Text className="text-sm font-display font-black text-ink mb-2">{title}</Text><Text className="font-sans text-[11px] text-ink/40 font-medium mb-2">Select one</Text><View className="gap-2">
    {options.map((option) => { const checked = selected === option; return <TouchableOpacity key={option} onPress={() => onSelect(option)} className={`flex-row items-center gap-3 px-4 py-3 rounded-2xl border ${checked ? 'border-accent bg-accent/5' : 'border-ink/10 bg-white'}`}>
      <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${checked ? 'border-accent' : 'border-ink/25'}`}>{checked && <View className="w-2.5 h-2.5 rounded-full bg-accent" />}</View><Text className={`text-sm font-medium ${checked ? 'text-accent' : 'text-ink/70'}`}>{option}</Text>
    </TouchableOpacity>; })}
  </View></View>;
}

function SectionLabel({ n, title, optional }: { n: number; title: string; optional?: boolean }) {
  return (
    <View className="flex-row items-center gap-2 mb-3">
      <View className="w-5 h-5 rounded-full bg-accent items-center justify-center">
        <Text className="text-[10px] font-display font-black text-white">{n}</Text>
      </View>
      <Text className="text-sm font-display font-black text-ink">{title}</Text>
      {optional && <Text className="font-sans text-[10px] font-bold text-ink/30 uppercase">Optional</Text>}
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
      <Text className="font-sans text-xs text-ink/50 font-medium mt-0.5">{desc}</Text>
    </TouchableOpacity>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="font-sans text-xs text-ink/50 font-medium">{label}</Text>
      <Text className="text-xs font-display font-black text-ink flex-1 text-right ml-4" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
