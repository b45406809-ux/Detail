import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  Camera,
  Image as ImageIcon,
  Sparkles,
  X,
  Layers,
  CalendarDays,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  doc,
  onSnapshot,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  limit,
} from '../../services/supabase';
import { callFunction } from '../../services/functions';
import { uploadCompletionPhoto } from '../../services/storage';
import { Job, JobStatus } from '../../types';
import { IS_MOCK, IS_DEMO } from '../../utils/env';
import { GlassCard, GlassSheet, GlassIconButton } from '../../components/glass';
import { MapPlaceholder } from '../../components/MapPlaceholder';
import { haversineDistanceKm } from '../../services/matching';
import { Mapbox, IS_MAPBOX_AVAILABLE, getDrivingRoute } from '../../services/mapbox';

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Job Confirmed',
  EN_ROUTE: 'Professional En Route',
  ARRIVED: 'Cleaner Arrived',
  IN_PROGRESS: 'Cleaning in Progress',
  COMPLETED: 'Cleaning Completed',
};

const PROGRESS_STEPS: { status: string; label: string }[] = [
  { status: 'ASSIGNED', label: 'En Route' },
  { status: 'EN_ROUTE', label: 'En Route' },
  { status: 'IN_PROGRESS', label: 'Arrived' },
  { status: 'IN_PROGRESS', label: 'Cleaning' },
  { status: 'COMPLETED', label: 'Review' },
];

const CLEANER_NEXT_STATUS: Partial<Record<string, { status: JobStatus; label: string }>> = {
  ASSIGNED: { status: JobStatus.EN_ROUTE, label: "I'm On My Way" },
  EN_ROUTE: { status: JobStatus.IN_PROGRESS, label: "I've Arrived" },
  IN_PROGRESS: { status: JobStatus.COMPLETED, label: 'Mark Complete' },
};

type TrackingStep = 'TRACKING' | 'PAYMENT' | 'RATING' | 'SUCCESS';

export default function TrackingScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { user, profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [jobLoadState, setJobLoadState] = useState<'LOADING' | 'READY' | 'MISSING' | 'ERROR'>('LOADING');
  const [jobLoadAttempt, setJobLoadAttempt] = useState(0);
  const [step, setStep] = useState<TrackingStep>('TRACKING');
  const [rating, setRating] = useState(0);
  const [problemDescription, setProblemDescription] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<'WALLET' | 'CASH' | 'ECOCASH' | 'INNBUCKS'>('WALLET');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCompletionDispute, setShowCompletionDispute] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteDocId, setFavoriteDocId] = useState<string | null>(null);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null);
  const [isUploadingDonePhoto, setIsUploadingDonePhoto] = useState(false);
  const [routeCoordinates,setRouteCoordinates]=useState<[number,number][]|null>(null);
  const [etaMinutes,setEtaMinutes]=useState<number|null>(null);
  const [routeIsRoadBased,setRouteIsRoadBased]=useState(false);
  const [instantCleanerAccepted,setInstantCleanerAccepted]=useState(false);
  const [photoTab, setPhotoTab] = useState<'BEFORE' | 'AFTER'>('BEFORE');
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  const isCustomer = profile?.role === 'CUSTOMER';
  const isCleaner = profile?.role === 'CLEANER';
  const rescheduleProposal = job?.rescheduleProposal;

  useEffect(()=>{
    let active=true;
    const origin=job?.cleanerLocation,destination=job?.location;
    if(!isCustomer||!origin||!destination){setRouteCoordinates(null);setEtaMinutes(null);setRouteIsRoadBased(false);return()=>{active=false;};}
    getDrivingRoute(origin,destination).then(route=>{if(active){setEtaMinutes(route.durationMinutes);setRouteCoordinates(route.coordinates);setRouteIsRoadBased(true);}}).catch(()=>{
      if(active){setEtaMinutes(Math.max(1,Math.round(haversineDistanceKm(origin,destination)/28*60)));setRouteCoordinates([[origin.lng,origin.lat],[destination.lng,destination.lat]]);setRouteIsRoadBased(false);}
    });
    return()=>{active=false;};
  },[isCustomer,job?.cleanerLocation?.lat,job?.cleanerLocation?.lng,job?.location?.lat,job?.location?.lng]);

  useEffect(()=>{
    if(!isCustomer||job?.bookingMode!=='INSTANT'||job.status!=='PENDING')return;
    let active=true;
    const refresh=()=>callFunction('refreshInstantMatching',{jobId}).catch(error=>{if(active)console.warn('[instant-match]',String(error));});
    void refresh();const timer=setInterval(refresh,25000);
    return()=>{active=false;clearInterval(timer);};
  },[isCustomer,job?.bookingMode,job?.status,jobId]);

  useEffect(()=>{
    if(!isCustomer||job?.bookingMode!=='INSTANT'||job.status!=='PENDING'||!jobId){setInstantCleanerAccepted(false);return;}
    return onSnapshot(query(collection(db,'bids'),where('jobId','==',jobId),where('status','==','PENDING'),limit(1)),snapshot=>setInstantCleanerAccepted(!snapshot.empty),()=>setInstantCleanerAccepted(false));
  },[isCustomer,job?.bookingMode,job?.status,jobId]);

  const handleUploadDonePhoto = async (fromCamera: boolean) => {
    if (!jobId) return;
    const currentCount = job?.completionPhotos?.length ?? 0;
    if (currentCount >= 6) {
      Alert.alert('Limit Reached', 'You can upload up to 6 completion photos.');
      return;
    }
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow camera / gallery access to add completion photos.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: false });

    if (result.canceled || !result.assets?.[0]) return;

    setIsUploadingDonePhoto(true);
    try {
      const url = await uploadCompletionPhoto(result.assets[0].uri, jobId);
      await callFunction('addCompletionPhoto', { jobId, url });
      setPhotoTab('AFTER');
      Alert.alert('Photo Uploaded', 'Completion proof photo added to the job.');
    } catch {
      Alert.alert('Upload Failed', 'Could not upload completion photo. Please try again.');
    } finally {
      setIsUploadingDonePhoto(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    setJobLoadState('LOADING');
    const unsubscribe = onSnapshot(
      doc(db, 'jobs', jobId),
      (snap) => {
        if (!active) return;
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as Job;
          setJob(data);
          setJobLoadState('READY');
          if (data.status === JobStatus.COMPLETED && step === 'TRACKING') {
            const completionResponse = data.data?.customerCompletionResponse?.status;
            if (isCustomer && data.completionSubmittedAt && !data.customerResponseAt) return;
            if (!isCustomer) setStep('SUCCESS');
            else if (completionResponse === 'DISPUTED' || data.rating != null) setStep('SUCCESS');
            else setStep('PAYMENT');
          }
        } else {
          setJob(null);
          setJobLoadState('MISSING');
        }
      },
      (err) => {
        if (!active) return;
        console.error('Job listener error:', err);
        setJobLoadState('ERROR');
      }
    );
    return () => { active = false; unsubscribe(); };
  }, [jobId, isCustomer, step, jobLoadAttempt]);

  useEffect(() => {
    if (['WALLET', 'CASH', 'ECOCASH', 'INNBUCKS'].includes(String(job?.paymentMethod))) setSelectedPayment(job!.paymentMethod as any);
  }, [job?.paymentMethod]);

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
    const activeStatuses = [JobStatus.ASSIGNED, JobStatus.EN_ROUTE, JobStatus.IN_PROGRESS, JobStatus.IN_PROGRESS];
    if (!activeStatuses.includes(job.status as JobStatus)) {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      return;
    }

    let mounted = true;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 20 }, async (loc) => {
      if (!mounted) return;
      try {
        await callFunction('updateActiveJobLocation', { jobId, lat: loc.coords.latitude, lng: loc.coords.longitude });
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
          try {
            const result=await callFunction<{jobId:string;reason:string;idempotencyKey:string},{refund?:{status?:string}}>('cancelBooking', { jobId, reason: 'Cancelled by participant', idempotencyKey: `cancel-${jobId}-${Date.now()}` });
            if(result.refund?.status==='REVIEW_REQUIRED'){Alert.alert('Review opened','Paynow BuySafe needs support review before this booking can be cancelled. We have opened a case for you.');return;}
            router.replace('/home');
          } catch(error:any) { Alert.alert('Could not cancel booking',error.message||'Please try again.'); }
        },
      },
    ]);
  };

  const handleSOS = () => {
    Alert.alert(
      'Emergency SOS',
      'This sends an urgent safety report to Detail for review. If anyone is in immediate danger, contact local emergency services as well.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS', style: 'destructive', onPress: async () => {
          setIsSubmitting(true);
          try {
            await callFunction('reportEmergency', { jobId, description: 'Emergency alert sent from the active booking safety control.' });
            Alert.alert('Safety report recorded', 'Your urgent report has been saved for Detail to review. If you are in immediate danger, contact local emergency services too.');
          } catch (error: any) { Alert.alert('Could not send alert', error.message || 'Try again or contact Detail support directly.'); }
          finally { setIsSubmitting(false); }
        } },
      ]
    );
  };

  const submitReschedule = async () => {
    setIsSubmitting(true);
    try {
      await callFunction('rescheduleBooking', { jobId, scheduledDateTime: rescheduleDate.toISOString(), idempotencyKey: `reschedule-${jobId}-${rescheduleDate.toISOString()}` });
      setShowRescheduleModal(false);
      Alert.alert('Request sent', `The other participant must accept ${rescheduleDate.toLocaleString()} before the booking time changes.`);
    } catch (error: any) { Alert.alert('Could not reschedule', error.message || 'Please try again.'); }
    finally { setIsSubmitting(false); }
  };

  const respondToReschedule = async (accept: boolean) => {
    if (!jobId || !rescheduleProposal) return;
    setIsSubmitting(true);
    try {
      await callFunction<{jobId:string;accept:boolean;idempotencyKey:string}, {status:string}>('respondRescheduleProposal', {
        jobId,
        accept,
        idempotencyKey: `reschedule-response-${rescheduleProposal.id}-${accept?'accept':'decline'}`,
      });
      Alert.alert(accept ? 'Time updated' : 'Proposal declined', accept ? 'Both participants agreed to the new booking time.' : 'The existing booking time remains in place.');
    } catch (error: any) {
      Alert.alert('Could not respond', error?.message || 'Refresh the booking and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCleanerStatusUpdate = async () => {
    const next = CLEANER_NEXT_STATUS[job?.status ?? ''];
    if (!next) return;
    setIsSubmitting(true);
    try {
      if(job?.status===JobStatus.EN_ROUTE&&!job.arrivalAt){
        const location=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
        await callFunction('markBookingArrived',{jobId,idempotencyKey:`arrival-${jobId}`,latitude:location.coords.latitude,longitude:location.coords.longitude});
      }
      else await callFunction(next.status === JobStatus.COMPLETED ? 'completeBooking' : 'transitionBooking', { jobId, newState: next.status, idempotencyKey: `status-${jobId}-${next.status}` });
    } catch(error:any) {
      Alert.alert('Could not update booking', error?.message||'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitCompletionResponse=async(response:'CONFIRMED'|'DISPUTED')=>{
    setIsSubmitting(true);
    try{
      await callFunction('respondToCompletion',{jobId,response,reason:response==='DISPUTED'?problemDescription.trim():''});
      setShowCompletionDispute(false);setProblemDescription('');
      if(response==='CONFIRMED')setStep('PAYMENT');
      Alert.alert(response==='DISPUTED'?'Support case opened':'Completion confirmed',response==='DISPUTED'?'Detail support will review the booking.':'Thank you for confirming the cleaning.');
    }catch(error:any){Alert.alert('Could not send response',error.message||'Try again shortly.');}
    finally{setIsSubmitting(false);}
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

  const handlePaynowRefresh = async () => {
    if (!jobId) return;
    setIsSubmitting(true);
    try {
      const result = await callFunction<{ jobId: string }, { success: boolean; status: string }>('refreshPaynowBookingPayment', { jobId });
      Alert.alert('Paynow status', `Current status: ${result.status.replace(/_/g, ' ')}.`);
    } catch (err: any) {
      Alert.alert('Could not refresh', err.message || 'Please try again shortly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaynowResume = async () => {
    if (!jobId) return;
    setIsSubmitting(true);
    try {
      const result = await callFunction<{ jobId: string }, { redirectUrl: string }>('resumePaynowBookingPayment', { jobId });
      await WebBrowser.openBrowserAsync(result.redirectUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET });
      await handlePaynowRefresh();
    } catch (err: any) {
      Alert.alert('Could not resume Paynow', err.message || 'Refresh the payment status and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaynowRetry = async () => {
    if (!jobId) return;
    setIsSubmitting(true);
    const keyStorage = user ? `detail:paynow-retry:${user.uid}:${jobId}` : '';
    try {
      let idempotencyKey = '';
      try { idempotencyKey = keyStorage ? (await AsyncStorage.getItem(keyStorage)) ?? '' : ''; } catch { /* create a fresh retry key */ }
      if (!idempotencyKey) {
        idempotencyKey = Crypto.randomUUID();
        if (keyStorage) await AsyncStorage.setItem(keyStorage, idempotencyKey);
      }
      const result = await callFunction<{ jobId: string; idempotencyKey: string }, { success: boolean; redirectUrl: string }>('retryPaynowBookingPayment', { jobId, idempotencyKey });
      if (keyStorage) await AsyncStorage.removeItem(keyStorage);
      if (result.redirectUrl) await WebBrowser.openBrowserAsync(result.redirectUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET });
    } catch (err: any) {
      if (keyStorage && String(err?.message ?? '').includes('already failed')) await AsyncStorage.removeItem(keyStorage).catch(() => undefined);
      Alert.alert('Paynow unavailable', err.message || 'Could not start payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRating = async () => {
    if (rating === 0) {
      Alert.alert('Rate your cleaner', 'Please select a star rating before submitting.');
      return;
    }
    if (rating < 3 && !problemDescription.trim()) { Alert.alert('Tell us what happened', 'A problem description is required for ratings below three stars.'); return; }
    if (!job?.cleanerId || !user) return;
    setIsSubmitting(true);
    try {
      await callFunction('submitRating', { jobId, rating, problemDescription });
      setStep('SUCCESS');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!job) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-8">
        {jobLoadState === 'LOADING' ? <ActivityIndicator color="#3906D2" size="large" /> : <>
          <Text className="font-display font-black text-ink text-lg text-center">{jobLoadState === 'MISSING' ? 'Booking unavailable' : 'Could not load booking'}</Text>
          <Text className="font-sans text-ink/60 text-center mt-2">{jobLoadState === 'MISSING' ? 'This booking may have been removed or you may not have access.' : 'Check your connection and try again.'}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => { setJobLoadState('LOADING'); setJobLoadAttempt(value => value + 1); }} className="mt-5 rounded-xl bg-accent px-5 py-3">
            <Text className="font-display font-bold text-white">Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} className="mt-3 px-5 py-3">
            <Text className="font-display font-bold text-accent">Go back</Text>
          </TouchableOpacity>
        </>}
      </View>
    );
  }

  const mapRegion = job.location && (job.location.lat !== 0 || job.location.lng !== 0)
    ? { latitude: job.location.lat, longitude: job.location.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 }
    : { latitude: -17.8252, longitude: 31.0335, latitudeDelta: 0.12, longitudeDelta: 0.12 };

  if (step === 'SUCCESS') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <View className="w-24 h-24 bg-emerald-50 rounded-4xl items-center justify-center mb-6">
          <CheckCircle size={48} color="#0FB77A" />
        </View>
        <Text className="text-3xl font-display font-black text-ink text-center mb-2">All done!</Text>
        <Text className="font-sans text-base text-ink/50 font-medium text-center mb-10">
          {isCleaner ? (job?.data?.customerCompletionResponse?.status === 'DISPUTED'
            ? 'The customer reported an issue with this completion. Detail support will review the case before earnings are released.'
            : 'Your work is marked complete. The customer has been asked to review it. Earnings will appear in your wallet after payment settles.')
            : job?.data?.customerCompletionResponse?.status === 'DISPUTED'
              ? 'Your report is recorded. Detail support will review the issue and update you in Support.'
              : 'Thanks for using Detail. We hope your space is sparkling clean.'}
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/home')}
          className="w-full bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
          activeOpacity={0.85}
        >
          <Text className="text-white font-display font-black text-sm uppercase tracking-widest">Back to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (step === 'RATING') {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-12 pb-10">
          <Text className="text-3xl font-display font-black text-ink text-center mb-2">Rate your cleaner</Text>
          <Text className="font-sans text-base text-ink/50 font-medium text-center mb-10">How was {job.cleanerName ?? 'your cleaner'}?</Text>

          {rating > 0 && rating < 3 && (
            <TextInput value={problemDescription} onChangeText={setProblemDescription} placeholder="Describe the problem (required)" multiline className="font-sans border border-red-200 bg-red-50 rounded-2xl p-4 mb-6 min-h-24" />
          )}

          <View className="items-center mb-10">
            <View className="flex-row gap-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                  <Star size={48} color={star <= rating ? '#f59e0b' : '#e2e8f0'} fill={star <= rating ? '#f59e0b' : 'transparent'} />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text className="text-lg font-display font-black text-ink/70 mt-4">{['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][rating]}</Text>
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
            <Text className="font-sans text-sm text-ink/40 font-medium">Skip</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'PAYMENT') {
    if (job.paymentMethod === 'PAYNOW') {
      const status = String(job.paymentStatus ?? 'PENDING');
      const statusText: Record<string, string> = {
        INITIATING: 'Starting secure checkout…', PENDING: 'Complete checkout in Paynow to place the payment in BuySafe escrow.',
        ESCROWED: 'BuySafe is holding your payment. After the cleaning, confirm delivery in your Paynow account. Paynow releases funds after its 24-hour dispute window.',
        DELIVERED: 'You confirmed delivery in Paynow. Funds remain in the 24-hour dispute period.',
        PAID: 'Paynow released the funds to Detail after the dispute window. Cleaner earnings are being finalized.',
        DISPUTED: 'A Paynow dispute is open. Detail will review the booking and coordinate with Paynow.',
        REFUNDED: 'Paynow reports this payment was refunded.', FAILED: 'Paynow could not start the checkout. Retry to continue this booking.',
      };
      return (
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-1 px-6 pt-12 pb-10">
            <Text className="text-3xl font-display font-black text-ink mb-2">Paynow BuySafe</Text>
            <Text className="font-sans text-base text-ink/50 font-medium mb-4">Booking total: <Text className="font-display font-black text-ink">${job.price?.toFixed(2) ?? '—'}</Text></Text>
            <View className="rounded-3xl bg-accent/5 border border-accent/10 p-5 mb-6">
              <Text className="text-xs font-display font-black text-accent uppercase tracking-widest mb-2">{status.replace(/_/g, ' ')}</Text>
              <Text className="font-sans text-sm text-ink/70 leading-6">{statusText[status] ?? 'Paynow is processing this booking payment.'}</Text>
            </View>
            {status === 'FAILED' ? (
              <TouchableOpacity onPress={handlePaynowRetry} disabled={isSubmitting} className="bg-accent py-5 rounded-[32px] items-center mb-3">
                {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-display font-black text-sm uppercase tracking-widest">Retry Paynow Checkout</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handlePaynowRefresh} disabled={isSubmitting} className="bg-accent py-5 rounded-[32px] items-center mb-3">
                {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-display font-black text-sm uppercase tracking-widest">Refresh Paynow Status</Text>}
              </TouchableOpacity>
            )}
            {status === 'PENDING' && <TouchableOpacity onPress={handlePaynowResume} disabled={isSubmitting} className="border border-accent/20 bg-accent/5 py-4 rounded-[32px] items-center mb-3">
              <Text className="font-display font-black text-sm uppercase tracking-widest text-accent">Resume Paynow Checkout</Text>
            </TouchableOpacity>}
            <TouchableOpacity onPress={() => Linking.openURL('https://www.paynow.co.zw/').catch(() => Alert.alert('Could not open Paynow', 'Open paynow.co.zw in your browser.'))} className="py-4 items-center">
              <Text className="font-sans text-accent font-bold">Open Paynow Customer Portal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('RATING')} className="mt-auto py-4 items-center">
              <Text className="font-sans text-sm text-ink/40 font-medium">Continue to rating</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    const PAYMENT_OPTIONS = [
      { id: 'WALLET', label: 'Detail Wallet', emoji: '👛', sub: `Balance: $${profile?.balance?.toFixed(2) ?? '0.00'} · top up in Wallet` },
      { id: 'CASH', label: 'Cash', emoji: '💵', sub: 'Pay cleaner directly' },
      { id: 'ECOCASH', label: 'EcoCash', emoji: '📱', sub: 'Transfer directly to cleaner' },
      { id: 'INNBUCKS', label: 'InnBucks', emoji: '📱', sub: 'Transfer directly to cleaner' },
    ] as const;

    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-12 pb-10">
          <Text className="text-3xl font-display font-black text-ink mb-2">Complete Payment</Text>
          <Text className="font-sans text-base text-ink/50 font-medium mb-8">
            Total: <Text className="font-display font-black text-ink">${job.price?.toFixed(2) ?? '—'}</Text>
          </Text>

          <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest mb-3">Payment Method</Text>
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
                <Text className="font-sans text-3xl">{emoji}</Text>
                <View className="flex-1">
                  <Text className={`text-sm font-black ${selectedPayment === id ? 'text-accent' : 'text-ink'}`}>{label}</Text>
                  <Text className="font-sans text-xs text-ink/40 font-medium mt-0.5">{sub}</Text>
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
              <Text className="text-white font-display font-black text-sm uppercase tracking-widest">
                {IS_MOCK ? '[DEV] ' : ''}Pay ${job.price?.toFixed(2) ?? '—'} via {selectedPayment}
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
      {IS_DEMO || !IS_MAPBOX_AVAILABLE ? (
        <MapPlaceholder style={{ flex: 1 }} />
      ) : mapRegion ? (
        <Mapbox.MapView style={{ flex: 1 }} styleURL={Mapbox.StyleURL.Street} compassEnabled={false} scaleBarEnabled={false}>
          <Mapbox.Camera
            defaultSettings={{
              centerCoordinate: [mapRegion.longitude, mapRegion.latitude],
              zoomLevel: mapRegion.latitudeDelta < 0.02 ? 15 : 10,
            }}
          />
          <Mapbox.UserLocation visible />
          {job.location && (
            <Mapbox.PointAnnotation id="job-location" coordinate={[job.location.lng, job.location.lat]} title="Job Location">
              <View className="w-10 h-10 bg-accent rounded-2xl items-center justify-center shadow-lg">
                <MapPin size={20} color="#fff" />
              </View>
            </Mapbox.PointAnnotation>
          )}

          {isCustomer && job.cleanerLocation && job.location && (
            <>
              <Mapbox.PointAnnotation id="cleaner-location" coordinate={[job.cleanerLocation.lng, job.cleanerLocation.lat]} title={job.cleanerName ?? 'Your Cleaner'}>
                <View className="w-10 h-10 bg-emerald-500 rounded-2xl items-center justify-center shadow-lg">
                  <Navigation size={20} color="#fff" />
                </View>
              </Mapbox.PointAnnotation>
              <Mapbox.ShapeSource
                id="cleaner-route-source"
                shape={{
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                      coordinates: routeCoordinates??[[job.cleanerLocation.lng,job.cleanerLocation.lat],[job.location.lng,job.location.lat]],
                  },
                }}
              >
                <Mapbox.LineLayer id="cleaner-route-line" style={{ lineColor: '#3906D2', lineWidth: 3, lineDasharray: [2, 1] }} />
              </Mapbox.ShapeSource>
            </>
          )}
        </Mapbox.MapView>
      ) : (
        <View className="flex-1 bg-ink/5 items-center justify-center">
          <Text className="font-sans text-ink/40 font-medium">Loading map…</Text>
        </View>
      )}

      <SafeAreaView className="absolute top-0 left-0 right-0" edges={['top']} pointerEvents="box-none">
        <View className="flex-row items-center justify-between px-5 pt-4" pointerEvents="box-none">
          <GlassIconButton size={48} onPress={() => router.back()}>
            <ArrowLeft size={20} color="#150256" />
          </GlassIconButton>

          <GlassCard style={{ borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
            <Text className="text-[10px] font-display font-black text-ink uppercase tracking-widest">
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
        {isCustomer && job.paymentMethod === 'PAYNOW' && job.paymentStatus === 'FAILED' && (
          <TouchableOpacity onPress={handlePaynowRetry} disabled={isSubmitting} className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4">
            <Text className="text-sm font-display font-black text-rose-700">Paynow checkout needs attention</Text>
            <Text className="font-sans text-xs text-rose-700/80 mt-1">The cleaner cannot start until BuySafe confirms the payment.</Text>
            <Text className="text-xs font-display font-black text-rose-700 uppercase mt-3">{isSubmitting ? 'Opening…' : 'Retry checkout'}</Text>
          </TouchableOpacity>
        )}
        {isCustomer&&job.status===JobStatus.COMPLETED&&job.completionSubmittedAt&&!job.customerResponseAt&&(
          <View className="bg-white rounded-2xl border border-accent/20 p-4 mb-4"><Text className="font-display font-black text-ink">Was the cleaning completed as requested?</Text><Text className="font-sans text-xs text-ink/50 mt-1 mb-3">You have 24 hours to confirm or report a problem. Paynow BuySafe funds still follow Paynow’s own status.</Text><View className="flex-row gap-3"><TouchableOpacity disabled={isSubmitting} onPress={()=>setShowCompletionDispute(true)} className="flex-1 rounded-xl bg-rose-50 border border-rose-200 p-3 items-center"><Text className="font-display font-black text-rose-700">Report an issue</Text></TouchableOpacity><TouchableOpacity disabled={isSubmitting} onPress={()=>submitCompletionResponse('CONFIRMED')} className="flex-1 rounded-xl bg-accent p-3 items-center"><Text className="font-display font-black text-white">Confirm completed</Text></TouchableOpacity></View></View>
        )}
        {isCustomer&&job.bookingMode==='INSTANT'&&job.status==='PENDING'&&<View className="bg-white rounded-2xl border border-accent/20 p-4 mb-4"><Text className="font-display font-black text-ink">{instantCleanerAccepted?'A cleaner accepted your request':'Finding a nearby cleaner'}</Text><Text className="font-sans text-xs text-ink/50 mt-1">Only verified cleaners who are online and within their travel radius receive your request. You will review the price and payment before the booking is confirmed.</Text>{instantCleanerAccepted&&<TouchableOpacity onPress={()=>router.push({pathname:'/booking/offers',params:{jobId:job.id}})} className="mt-3 rounded-xl bg-accent px-4 py-3 items-center"><Text className="font-display font-black text-white">Review cleaner and choose payment</Text></TouchableOpacity>}{job.matchExpiresAt&&Date.parse(job.matchExpiresAt)<=Date.now()&&!instantCleanerAccepted&&<Text className="font-sans text-xs text-rose-600 mt-2">No cleaner has accepted yet. You can cancel this request and create a scheduled booking.</Text>}</View>}
        {isCustomer&&job.bookingMode==='INSTANT'&&job.status==='CANCELLED'&&job.instantMatchingExpired&&<View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4"><Text className="font-display font-black text-amber-900">This instant request has expired</Text><Text className="font-sans text-xs text-amber-800 mt-1">No cleaner accepted in time, or the accepted offer was not confirmed. Create a new booking to try again.</Text><TouchableOpacity onPress={()=>router.replace('/booking/create')} className="mt-3 rounded-xl bg-accent px-4 py-3 items-center"><Text className="font-display font-black text-white">Create another booking</Text></TouchableOpacity></View>}
        {rescheduleProposal&&<View className="bg-violet-50 border border-violet-200 rounded-2xl p-4 mb-4"><Text className="font-display font-black text-violet-950">Proposed booking time</Text><Text className="font-sans text-sm text-violet-900 mt-1">{new Date(rescheduleProposal.proposedDateTime).toLocaleString()}</Text>{rescheduleProposal.status==='PENDING'&&Date.parse(rescheduleProposal.expiresAt)>Date.now()?user?.uid===rescheduleProposal.recipientId?<><Text className="font-sans text-xs text-violet-800 mt-2">The other participant proposed this change. The existing time stays in place until you respond.</Text><View className="flex-row gap-3 mt-3"><TouchableOpacity disabled={isSubmitting} onPress={()=>respondToReschedule(false)} className="flex-1 rounded-xl bg-white border border-violet-200 p-3 items-center"><Text className="font-display font-black text-violet-900">Decline</Text></TouchableOpacity><TouchableOpacity disabled={isSubmitting} onPress={()=>respondToReschedule(true)} className="flex-1 rounded-xl bg-accent p-3 items-center"><Text className="font-display font-black text-white">Accept new time</Text></TouchableOpacity></View></>:<Text className="font-sans text-xs text-violet-800 mt-2">Waiting for the other participant to respond. The current time is still confirmed.</Text>:rescheduleProposal.status==='ACCEPTED'?<Text className="font-sans text-xs text-emerald-800 mt-2">Accepted. The booking time has been updated.</Text>:<Text className="font-sans text-xs text-slate-600 mt-2">{rescheduleProposal.status==='DECLINED'?'Declined. The original time remains in place.':'This proposal expired. The original time remains in place.'}</Text>}</View>}
        {isCustomer&&job.customerResponseAt&&<Text className="font-sans text-xs text-ink/50 mb-4">Your completion response has been recorded.</Text>}
        {isCustomer && etaMinutes != null && (
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-[10px] font-display font-black text-ink/40 uppercase tracking-widest mb-1">{routeIsRoadBased?'Mapbox route ETA':'Approximate arrival'}</Text>
              <Text className="text-3xl font-display font-black text-accent">{etaMinutes} mins</Text>
            </View>
            <View className="bg-emerald-50 px-3 py-1.5 rounded-full">
              <Text className="text-[10px] font-display font-black text-emerald-700 uppercase">On Schedule</Text>
            </View>
          </View>
        )}

        <View className="flex-row items-center gap-4 bg-white/60 rounded-3xl p-4 mb-4 border border-white">
          <View className="relative">
            <View className="w-14 h-14 bg-accent/10 rounded-[22px] items-center justify-center">
              <Text className="font-sans text-2xl">🧹</Text>
            </View>
            <View className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-accent rounded-lg items-center justify-center border-2 border-white">
              <ShieldCheck size={12} color="#fff" />
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-base font-display font-black text-ink tracking-tight">
              {isCustomer ? job.cleanerName ?? 'Your Cleaner' : job.customerName ?? 'Customer'}
            </Text>
            {isCustomer && (
              <View className="flex-row items-center gap-1 mt-0.5">
                <Star size={12} color="#f59e0b" fill="#f59e0b" />
                <Text className="text-xs font-display font-black text-ink/60">
                  {job.cleanerRating != null ? `${job.cleanerRating.toFixed(1)} Rating` : IS_MOCK ? '4.95 Excellent' : 'New Cleaner'}
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
            const order = ['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED'];
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

        {/* Job Photos quick access row */}
        {((job.photos && job.photos.length > 0) || (job.completionPhotos && job.completionPhotos.length > 0)) && (
          <TouchableOpacity
            onPress={() => setShowPhotosModal(true)}
            activeOpacity={0.8}
            className="flex-row items-center justify-between bg-ink/[0.04] p-3 rounded-2xl mb-4 border border-ink/5"
          >
            <View className="flex-row items-center gap-2">
              <Camera size={16} color="#3906D2" />
              <Text className="text-xs font-display font-black text-ink">
                Job Photos ({job.photos?.length ?? 0} Before · {job.completionPhotos?.length ?? 0} After)
              </Text>
            </View>
            <Text className="text-[11px] font-display font-black text-accent">View Photos →</Text>
          </TouchableOpacity>
        )}

        {/* Cleaner proof-of-work upload during cleaning */}
        {isCleaner && (job.status === JobStatus.IN_PROGRESS || job.status === JobStatus.IN_PROGRESS) && (
          <View className="bg-accent/5 p-4 rounded-2xl border border-accent/15 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} color="#3906D2" />
                <Text className="text-xs font-display font-black text-ink uppercase tracking-wider">
                  Photos When Done (Proof of Work)
                </Text>
              </View>
              <Text className="font-sans text-[10px] font-bold text-accent">
                {job.completionPhotos?.length ?? 0}/6
              </Text>
            </View>
            <Text className="font-sans text-xs text-ink/50 font-medium mb-3">
              Take photos of the clean space/car before marking the job complete.
            </Text>

            {job.completionPhotos && job.completionPhotos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8 }}>
                {job.completionPhotos.map((url) => (
                  <TouchableOpacity
                    key={url}
                    onPress={() => setSelectedPhotoModal(url)}
                    className="relative rounded-xl overflow-hidden border border-emerald-200"
                  >
                    <Image source={{ uri: url }} style={{ width: 64, height: 64 }} />
                    <View className="absolute bottom-1 left-1 bg-emerald-700/80 px-1 rounded">
                      <Text className="text-[8px] font-display font-black text-white">Done</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => handleUploadDonePhoto(true)}
                disabled={isUploadingDonePhoto}
                activeOpacity={0.8}
                className="flex-1 py-2.5 rounded-xl bg-accent items-center justify-center flex-row gap-2"
              >
                {isUploadingDonePhoto ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Camera size={14} color="#fff" />
                    <Text className="text-xs font-display font-black text-white uppercase">Take Done Photo</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleUploadDonePhoto(false)}
                disabled={isUploadingDonePhoto}
                activeOpacity={0.8}
                className="flex-1 py-2.5 rounded-xl bg-white border border-accent/30 items-center justify-center flex-row gap-2"
              >
                {isUploadingDonePhoto ? (
                  <ActivityIndicator color="#3906D2" size="small" />
                ) : (
                  <>
                    <ImageIcon size={14} color="#3906D2" />
                    <Text className="text-xs font-display font-black text-accent uppercase">Upload Gallery</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

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
              <Text className="text-white font-display font-black text-sm uppercase tracking-widest">{job.status===JobStatus.EN_ROUTE?job.arrivalAt?'Start Cleaning':"I've Arrived":CLEANER_NEXT_STATUS[job.status]!.label}</Text>
            )}
          </TouchableOpacity>
        )}

        <View className="flex-row gap-4 mb-4">
          {[
            { id: 'message', label: 'Message', icon: MessageSquare, color: '#3906D2', action: () => router.push({ pathname: '/messages', params: { jobId } }) },
            ...(['PENDING','CONFIRMED','ASSIGNED'].includes(job.status) ? [{ id: 'reschedule', label: 'Reschedule', icon: CalendarDays, color: '#0B8F65', action: () => { setRescheduleDate(new Date(Date.now() + 24 * 60 * 60 * 1000)); setShowRescheduleModal(true); } }] : []),
            { id: 'call', label: 'Call', icon: Phone, color: '#0FB77A', action: () => {
              const phone = isCleaner ? job.customerPhone : job.cleanerPhone;
              if (!phone) { Alert.alert('Phone unavailable', 'This account has not added a phone number.'); return; }
              Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Call unavailable', 'Your device could not start a phone call.'));
            } },
            { id: 'cancel', label: 'Abort', icon: ShieldAlert, color: '#E5484D', action: handleCancelJob },
          ].map(({ id, label, icon: Icon, color, action }) => (
            <TouchableOpacity key={id} onPress={action} className="flex-1 items-center gap-2" activeOpacity={0.7}>
              <View className="w-14 h-14 rounded-[22px] items-center justify-center bg-white/60 border border-white">
                <Icon size={20} color={color} />
              </View>
              <Text className="text-[9px] font-display font-black text-ink/40 uppercase tracking-widest">{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="bg-emerald-50 rounded-2xl px-4 py-3 flex-row items-center gap-2">
          <ShieldCheck size={16} color="#0FB77A" />
          <Text className="font-sans flex-1 text-[11px] font-bold text-emerald-800">
            Detail Secure Service — your payment is protected until you review the service.
          </Text>
        </View>
      </GlassSheet>

      {/* Before & After Photos Modal */}
      <Modal
        visible={showPhotosModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPhotosModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-[36px] px-6 pt-6 pb-10 max-h-[85%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-display font-black text-ink">Job Photos</Text>
              <TouchableOpacity
                onPress={() => setShowPhotosModal(false)}
                className="w-9 h-9 rounded-full bg-ink/5 items-center justify-center"
              >
                <X size={18} color="#150256" />
              </TouchableOpacity>
            </View>

            {/* Photo Tabs */}
            <View className="flex-row bg-ink/5 p-1 rounded-2xl mb-5">
              <TouchableOpacity
                onPress={() => setPhotoTab('BEFORE')}
                className={`flex-1 py-2.5 rounded-xl items-center ${
                  photoTab === 'BEFORE' ? 'bg-white shadow-sm' : ''
                }`}
              >
                <Text
                  className={`text-xs font-black ${
                    photoTab === 'BEFORE' ? 'text-ink' : 'text-ink/40'
                  }`}
                >
                  Before Cleaning ({job.photos?.length ?? 0})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPhotoTab('AFTER')}
                className={`flex-1 py-2.5 rounded-xl items-center ${
                  photoTab === 'AFTER' ? 'bg-white shadow-sm' : ''
                }`}
              >
                <Text
                  className={`text-xs font-black ${
                    photoTab === 'AFTER' ? 'text-emerald-700' : 'text-ink/40'
                  }`}
                >
                  When Done ({job.completionPhotos?.length ?? 0})
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {photoTab === 'BEFORE' ? (
                <View>
                  <Text className="font-sans text-xs text-ink/50 font-medium mb-3">
                    Customer uploaded these photos showing dirty areas / condition needing cleaning.
                  </Text>
                  {job.photos && job.photos.length > 0 ? (
                    <View className="flex-row flex-wrap gap-3">
                      {job.photos.map((url) => (
                        <TouchableOpacity
                          key={url}
                          onPress={() => setSelectedPhotoModal(url)}
                          activeOpacity={0.85}
                          className="w-[47%] aspect-square rounded-2xl overflow-hidden border border-ink/10 relative"
                        >
                          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} />
                          <View className="absolute bottom-2 left-2 bg-black/75 px-2 py-1 rounded-lg">
                            <Text className="text-[10px] font-display font-black text-white uppercase">Dirty / Before</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View className="py-10 items-center">
                      <Text className="font-sans text-sm font-bold text-ink/40">No before photos attached</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View>
                  <Text className="font-sans text-xs text-ink/50 font-medium mb-3">
                    Cleaner uploaded these photos as proof of completed, sparkling clean work.
                  </Text>
                  {job.completionPhotos && job.completionPhotos.length > 0 ? (
                    <View className="flex-row flex-wrap gap-3">
                      {job.completionPhotos.map((url) => (
                        <TouchableOpacity
                          key={url}
                          onPress={() => setSelectedPhotoModal(url)}
                          activeOpacity={0.85}
                          className="w-[47%] aspect-square rounded-2xl overflow-hidden border border-emerald-300 relative"
                        >
                          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} />
                          <View className="absolute bottom-2 left-2 bg-emerald-700/85 px-2 py-1 rounded-lg">
                            <Text className="text-[10px] font-display font-black text-white uppercase">✨ Clean / Done</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View className="py-10 items-center">
                      <Text className="font-sans text-sm font-bold text-ink/40 mb-3">No completion photos uploaded yet</Text>
                      {isCleaner && (
                        <TouchableOpacity
                          onPress={() => {
                            setShowPhotosModal(false);
                            handleUploadDonePhoto(true);
                          }}
                          className="bg-accent px-4 py-2.5 rounded-xl"
                        >
                          <Text className="text-xs font-display font-black text-white uppercase">Take First Done Photo</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showRescheduleModal} transparent animationType="slide" onRequestClose={() => setShowRescheduleModal(false)}>
        <View className="flex-1 justify-end bg-black/50"><View className="rounded-t-[32px] bg-white p-5 pb-9">
          <Text className="font-display text-xl font-black text-ink">Reschedule booking</Text>
          <Text className="mt-1 font-sans text-sm text-ink/55">Choose a new date and time. The other participant will be notified.</Text>
          <View className="mt-4 flex-row gap-3"><TouchableOpacity onPress={() => { setShowDatePicker(true); setShowTimePicker(false); }} className="flex-1 rounded-2xl border border-violet-100 bg-[#F7F4FF] p-4"><Text className="font-sans text-xs text-ink/45">DATE</Text><Text className="mt-1 font-display font-black text-ink">{rescheduleDate.toLocaleDateString()}</Text></TouchableOpacity><TouchableOpacity onPress={() => { setShowTimePicker(true); setShowDatePicker(false); }} className="flex-1 rounded-2xl border border-violet-100 bg-[#F7F4FF] p-4"><Text className="font-sans text-xs text-ink/45">TIME</Text><Text className="mt-1 font-display font-black text-ink">{rescheduleDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text></TouchableOpacity></View>
          {showDatePicker && <DateTimePicker value={rescheduleDate} mode="date" minimumDate={new Date(Date.now()+2*60*60*1000)} onChange={(_event,date)=>{setShowDatePicker(false);if(date)setRescheduleDate(current=>{const next=new Date(current);next.setFullYear(date.getFullYear(),date.getMonth(),date.getDate());return next;});}}/>}
          {showTimePicker && <DateTimePicker value={rescheduleDate} mode="time" onChange={(_event,date)=>{setShowTimePicker(false);if(date)setRescheduleDate(current=>{const next=new Date(current);next.setHours(date.getHours(),date.getMinutes(),0,0);return next;});}}/>}
          <TouchableOpacity disabled={isSubmitting} onPress={() => void submitReschedule()} className="mt-5 items-center rounded-2xl bg-accent py-4">{isSubmitting?<ActivityIndicator color="white"/>:<Text className="font-display font-black text-white">Confirm new time</Text>}</TouchableOpacity>
          <TouchableOpacity onPress={() => setShowRescheduleModal(false)} className="pt-4"><Text className="text-center font-sans font-bold text-ink/40">Keep current time</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showCompletionDispute} transparent animationType="slide" onRequestClose={()=>setShowCompletionDispute(false)}>
        <View className="flex-1 justify-end bg-black/50"><View className="rounded-t-[32px] bg-white p-5 pb-9"><Text className="font-display text-xl font-black text-ink">Report a problem</Text><Text className="font-sans text-sm text-ink/55 mt-1">Tell Detail what needs review. Your cleaner will be notified that support is reviewing the booking.</Text><TextInput value={problemDescription} onChangeText={setProblemDescription} multiline textAlignVertical="top" placeholder="Describe what was missed or damaged…" placeholderTextColor="#9C94C4" className="mt-4 min-h-28 rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 font-sans text-sm text-ink"/><TouchableOpacity disabled={isSubmitting||problemDescription.trim().length<5} onPress={()=>void submitCompletionResponse('DISPUTED')} className="mt-4 items-center rounded-2xl bg-rose-600 py-4">{isSubmitting?<ActivityIndicator color="white"/>:<Text className="font-display font-black text-white">Send to support</Text>}</TouchableOpacity><TouchableOpacity onPress={()=>setShowCompletionDispute(false)} className="pt-4"><Text className="text-center font-sans font-bold text-ink/40">Cancel</Text></TouchableOpacity></View></View>
      </Modal>

      {/* Full screen photo zoom modal */}
      <Modal
        visible={!!selectedPhotoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhotoModal(null)}
      >
        <View className="flex-1 bg-black/95 items-center justify-center p-4">
          <TouchableOpacity
            onPress={() => setSelectedPhotoModal(null)}
            className="absolute top-12 right-6 w-10 h-10 rounded-full bg-white/20 items-center justify-center z-10"
          >
            <X size={22} color="#fff" />
          </TouchableOpacity>
          {selectedPhotoModal && (
            <Image
              source={{ uri: selectedPhotoModal }}
              style={{ width: '100%', height: '80%', resizeMode: 'contain' }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
