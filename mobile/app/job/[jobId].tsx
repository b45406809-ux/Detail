import { appAlert } from '@/components/AppDialog';
import { RemoteImage, prefetchPhotos } from '../../components/RemoteImage';
import { goBackSafely } from '@/utils/navigation';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,

  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MapPin, Navigation, Clock, DollarSign, MessageSquare, Hash, Home, Layers, Sparkles, X, CheckCircle2, Car, Image as ImageIcon } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { db, doc, collection, onSnapshot, query, where, getDocs, limit } from '../../services/supabase';
import { callFunction } from '../../services/functions';
import { Job, JobStatus, HouseChecklist, CarChecklist } from '../../types';

export default function CleanerJobDetailScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { user, profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [alreadyBid, setAlreadyBid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');

  const [bidPrice, setBidPrice] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let unavailable = false;
    setPreviewError('');
    setIsLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'openJobs', jobId),
      (snap) => {
        if (!snap.exists()) {
          unavailable = true;
          if (active) { setJob(null); setIsLoading(false); }
          return;
        }
        const status = snap.data()?.status;
        if (active && status) setJob((current) => current ? { ...current, status } : current);
      }
    );
    callFunction('getCleanerBookingPreview', { jobId })
      .then((preview) => { if (active && !unavailable) { const next = preview as Job; prefetchPhotos([...(next?.photos ?? []), ...(next?.completionPhotos ?? [])]); setJob(next); } })
      .catch((error) => { if (active && !unavailable) { setPreviewError(error instanceof Error ? error.message : 'Could not load this booking.'); setJob(null); } })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; unsubscribe(); };
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
      appAlert('Invalid Price', 'Please enter a valid bid price.');
      return;
    }
    if (isNaN(eta) || eta < 1 || eta > 120) {
      appAlert('Invalid ETA', 'Please enter an estimated arrival time in minutes (1–120).');
      return;
    }
    if (!user || !profile) return;
    if (job?.status !== JobStatus.PENDING) {
      appAlert('Too Late', 'This job is no longer accepting bids.');
      return;
    }
    const topupShortfall = commissionTopupShortfall(price, profile.commissionBalance, profile.commissionOwed);
    if (topupShortfall > 0) {
      const suggestedTopup = Math.max(1, topupShortfall);
      appAlert(
        'Top up prepaid commission',
        `A $${price.toFixed(2)} quote needs $${commissionReserve(price).toFixed(2)} in prepaid commission credit. Add $${suggestedTopup.toFixed(2)} to cover the shortfall, then return here to send your quote.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: `Top up $${suggestedTopup.toFixed(2)}`, onPress: () => router.push({ pathname: '/(tabs)/wallet', params: { topupAmount: suggestedTopup.toFixed(2) } }) },
        ],
      );
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
      appAlert('Bid Placed!', "Your offer has been sent to the customer. You'll be notified if they accept.");
    } catch (err: any) {
      const topupMatch = String(err?.message ?? '').match(/PREPAID_TOPUP_REQUIRED:(\d+(?:\.\d{1,2})?)/);
      if (topupMatch) {
        const suggestedTopup = Math.max(1, Number(topupMatch[1]));
        appAlert('Top up prepaid commission', `Add $${suggestedTopup.toFixed(2)} to cover the commission reserve for this quote. You can return here and send it after the top-up clears.`, [
          { text: 'Not now', style: 'cancel' },
          { text: `Top up $${suggestedTopup.toFixed(2)}`, onPress: () => router.push({ pathname: '/(tabs)/wallet', params: { topupAmount: suggestedTopup.toFixed(2) } }) },
        ]);
        return;
      }
      appAlert('Error', err.message || 'Failed to submit bid. Please try again.');
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
    const selfieRequired = /front-camera selfie/i.test(previewError);
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-lg font-display font-black text-ink text-center">{selfieRequired ? 'Cleaner profile selfie required' : 'Booking unavailable'}</Text>
        <Text className="mt-2 text-center font-sans text-sm text-ink/60">{selfieRequired ? 'Take a current selfie with your front camera in Profile. Customers will see it on your cleaner profile.' : previewError || 'This booking may no longer be available.'}</Text>
        {selfieRequired && <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} className="mt-5 rounded-2xl bg-accent px-5 py-3"><Text className="font-display font-black text-white">Open Profile</Text></TouchableOpacity>}
        <TouchableOpacity onPress={() => goBackSafely()} className="mt-4">
          <Text className="text-accent font-display font-black">{selfieRequired ? 'Go back to bookings' : 'Go Back'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isTaken = job.status !== JobStatus.PENDING;
  const isVisitWash = job.category === 'CAR' && job.serviceMode === 'VISIT_WASH';
  const latitude = Number(job.location?.lat);
  const longitude = Number(job.location?.lng);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0);
  const openLocation = () => {
    if (!hasCoordinates && !isVisitWash) {
      appAlert('Location unavailable', 'The customer did not provide a mappable location.');
      return;
    }
    const destination = hasCoordinates ? `${latitude},${longitude}` : job.location?.address ?? job.washSiteName ?? '';
    if (!destination) {
      appAlert('Location unavailable', 'The car wash location is not available yet.');
      return;
    }
    const point = encodeURIComponent(destination);
    const url = isVisitWash
      ? `https://www.google.com/maps/dir/?api=1&destination=${point}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${point}`;
    void Linking.openURL(url).catch(() => appAlert('Maps unavailable', 'Could not open the location on this device.'));
  };

  const budgetLabel = job.budget ? `$${job.budget}` : 'Open — send your best price';
  const numericBidPrice = Number(bidPrice);
  const validBidPrice = Number.isFinite(numericBidPrice) && numericBidPrice >= 1;
  const availableCommission = Math.max(0, Number(profile?.commissionBalance ?? 0) || 0);
  const outstandingCommission = Math.max(0, Number(profile?.commissionOwed ?? 0) || 0);
  const requiredCommission = validBidPrice ? commissionReserve(numericBidPrice) : 0;
  const suggestedCommissionTopup = validBidPrice
    ? Math.max(0, outstandingCommission, outstandingCommission + requiredCommission - availableCommission)
    : 0;

  const checklistTags = getChecklistTags(job);
  const checklist = job.checklist as any;
  const conditionValue = String(checklist?.condition ?? '').replaceAll('_', ' ').toLowerCase();
  const conditionLabel = conditionValue ? conditionValue.replace(/\b\w/g, character => character.toUpperCase()) : 'Not specified';
  const houseLayout = job.category === 'HOUSE'
    ? [checklist?.propertyType, checklist?.propertySize, checklist?.areaSize, checklist?.bedrooms ? `${checklist.bedrooms} bedrooms` : null, checklist?.bathrooms ? `${checklist.bathrooms} bathrooms` : null, checklist?.storiesCount ? `${checklist.storiesCount} stories` : null, checklist?.roomsCount ? `${checklist.roomsCount} rooms` : null, checklist?.bathroomsCount ? `${checklist.bathroomsCount} bathrooms to clean` : null, checklist?.propertySizeSqm ? `${checklist.propertySizeSqm} m²` : null].filter(Boolean).join(' · ')
    : '';

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
          <TouchableOpacity onPress={() => goBackSafely()} className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-ink/5">
            <ArrowLeft size={18} color="#150256" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-display font-black text-ink">{job.serviceType}</Text>
            <Text className="font-sans text-xs text-ink/40 font-medium">#{jobId?.slice(-6).toUpperCase()}</Text>
          </View>
          {isTaken && (
            <View className="bg-amber-100 px-3 py-1.5 rounded-xl">
              <Text className="text-xs font-display font-black text-amber-700 uppercase tracking-wider">{job.status}</Text>
            </View>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="mx-5 bg-white rounded-3xl p-5 border border-ink/5 mb-4">
            <View className="flex-row items-center gap-2 mb-3">
              {job.category === 'CAR' ? <Car size={14} color="#3906D2" /> : <Home size={14} color="#3906D2" />}
              <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest">
                {job.category === 'CAR' ? 'Car Cleaning' : 'House Cleaning'}
              </Text>
            </View>

            <View className="gap-3">
              <DetailRow
                icon={MapPin}
                title={isVisitWash ? 'Car wash location' : 'Customer location'}
                value={isVisitWash ? job.location?.address || job.washSiteName || 'Selected car wash' : 'Exact pin on map'}
                accent={isVisitWash ? undefined : 'Street address is shared after quote acceptance'}
              />
              <DetailRow icon={DollarSign} title="Customer Budget" value={budgetLabel} />
              <DetailRow icon={Clock} title="Estimated Duration" value={formatDuration(job.estimatedDuration)} />
              <DetailRow icon={Sparkles} title={job.category === 'HOUSE' ? 'Property condition' : 'Vehicle condition'} value={conditionLabel} highlight />
              {!!job.suppliesRequired && <DetailRow icon={Sparkles} title="Cleaner supplies" value={job.suppliesFee ? `Customer offers $${Number(job.suppliesFee).toFixed(2)} for supplies` : 'Cleaner should bring supplies'} />}
              {isVisitWash && <DetailRow icon={Home} title="Selected car wash" value={job.washSiteName || 'Customer selected car wash'} />}
              {job.category === 'HOUSE' && (
                <>
                  {Boolean(houseLayout) && (
                    <DetailRow
                      icon={Home}
                      title="Property Layout"
                      value={houseLayout}
                      highlight
                    />
                  )}
                </>
              )}
              {job.category === 'CAR' && checklist?.registrationNumber && (
                <DetailRow
                  icon={Hash}
                  title="Vehicle Registration"
                  value={checklist.registrationNumber}
                  highlight
                />
              )}
              {job.description && <DetailRow icon={MessageSquare} title="Notes" value={job.description} />}
            </View>

            {(hasCoordinates || isVisitWash) && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={isVisitWash ? 'Get directions to the selected car wash' : 'View the customer location on the map'}
                onPress={openLocation}
                activeOpacity={0.8}
                className="mt-4 flex-row items-center gap-3 rounded-2xl border border-accent/15 bg-accent/[0.04] p-4"
              >
                <View className="w-10 h-10 rounded-xl bg-accent items-center justify-center">
                  <Navigation size={17} color="#fff" />
                </View>
                <View className="flex-1">
                  <Text className="font-display font-black text-ink">{isVisitWash ? 'Directions to car wash' : 'View location'}</Text>
                  <Text className="font-sans text-xs text-ink/55 mt-1">
                    {isVisitWash ? 'Open the selected wash location in Maps.' : 'Open the customer’s pin in Maps to estimate travel for your bid.'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {checklistTags.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mt-4 pt-4 border-t border-ink/5">
                {checklistTags.map((tag) => (
                  <View key={tag} className="bg-accent/10 px-3 py-1.5 rounded-full">
                    <Text className="text-[11px] font-display font-black text-accent">{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {job.photos?.length > 0 && (
              <View className="mt-4 pt-4 border-t border-ink/5">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-1.5">
                    <ImageIcon size={13} color="#3906D2" />
                    <Text className="text-xs font-display font-black text-ink/60 uppercase tracking-wider">{job.category === 'CAR' ? 'Vehicle photos' : 'Home photos'} ({job.photos.length})</Text>
                  </View>
                  <Text className="font-sans text-[10px] font-bold text-accent">Tap to enlarge</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {job.photos.map((url) => (
                    <TouchableOpacity
                      key={url}
                      onPress={() => setSelectedPhotoUrl(url)}
                      activeOpacity={0.8}
                      className="relative rounded-2xl overflow-hidden border border-ink/10"
                    >
                      <RemoteImage uri={url} style={{ width: 88, height: 88 }} />
                      <View className="absolute bottom-1 left-1 bg-black/75 px-1.5 py-0.5 rounded-md">
                        <Text className="text-[8px] font-display font-black text-white uppercase">Dirty / Before</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {job.completionPhotos && job.completionPhotos.length > 0 && (
              <View className="mt-4 pt-4 border-t border-ink/5">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-1.5">
                    <CheckCircle2 size={13} color="#047857" />
                    <Text className="text-xs font-display font-black text-emerald-700 uppercase tracking-wider">Photos When Done ({job.completionPhotos.length})</Text>
                  </View>
                  <Text className="font-sans text-[10px] font-bold text-emerald-700">Completed</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {job.completionPhotos.map((url) => (
                    <TouchableOpacity
                      key={url}
                      onPress={() => setSelectedPhotoUrl(url)}
                      activeOpacity={0.8}
                      className="relative rounded-2xl overflow-hidden border border-emerald-200"
                    >
                      <RemoteImage uri={url} style={{ width: 88, height: 88 }} />
                      <View className="absolute bottom-1 left-1 bg-emerald-700/85 px-1.5 py-0.5 rounded-md">
                        <Text className="text-[8px] font-display font-black text-white uppercase">Completed</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {isTaken ? (
            <View className="mx-5 bg-amber-50 rounded-3xl p-5 border border-amber-100">
              <Text className="text-sm font-display font-black text-amber-700 text-center">This job has already been accepted</Text>
            </View>
          ) : alreadyBid ? (
            <View className="mx-5 bg-emerald-50 rounded-3xl p-5 border border-emerald-100 items-center">
              <View className="w-10 h-10 rounded-full bg-emerald-100 items-center justify-center mb-3">
                <CheckCircle2 size={22} color="#15803D" strokeWidth={2.25} />
              </View>
              <Text className="text-sm font-display font-black text-emerald-800 text-center">Bid submitted</Text>
              <Text className="text-xs font-sans text-emerald-700/80 text-center mt-1">Waiting for the customer to accept</Text>
            </View>
          ) : (
            <View className="mx-5 bg-white rounded-3xl p-5 border border-ink/5">
              <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest mb-4">Place Your Bid</Text>

              <Text className="text-xs font-display font-black text-ink/50 uppercase tracking-widest mb-1.5">Your Price (USD)</Text>
              <TextInput
                className="border-2 border-ink/10 rounded-2xl px-4 py-3.5 text-xl font-display font-black text-ink bg-ink/[0.02] mb-4"
                placeholder={`${job.budget ?? '0'}.00`}
                placeholderTextColor="#9C94C4"
                keyboardType="decimal-pad"
                value={bidPrice}
                onChangeText={setBidPrice}
              />

              {validBidPrice && (
                <View className="-mt-2 mb-4 rounded-2xl border border-violet-100 bg-violet-50 p-3">
                  <Text className="font-display text-xs font-black text-violet-900">Required prepaid commission (10%) · ${commissionReserve(Number(bidPrice)).toFixed(2)}</Text>
                  <Text className="mt-1 font-sans text-[11px] leading-4 text-violet-800/80">
                    Available credit: ${availableCommission.toFixed(2)}. You need the full 10% available before submitting. Detail deducts it from your prepaid credit when the customer accepts your bid.
                  </Text>
                  {suggestedCommissionTopup > 0 ? (
                    <>
                      <Text className="mt-1 font-sans-bold text-[11px] leading-4 text-violet-900">
                        {outstandingCommission > 0 ? `Clear $${outstandingCommission.toFixed(2)} commission due and cover the reserve. ` : ''}You are short. Top up $${Math.max(1, suggestedCommissionTopup).toFixed(2)} to unlock this bid.
                      </Text>
                      <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/wallet', params: { topupAmount: Math.max(1, suggestedCommissionTopup).toFixed(2) } })} className="mt-3 self-start rounded-xl bg-accent px-3 py-2">
                        <Text className="font-sans-bold text-xs text-white">Top up ${Math.max(1, suggestedCommissionTopup).toFixed(2)}</Text>
                      </TouchableOpacity>
                    </>
                  ) : <Text className="mt-1 font-sans text-[11px] text-emerald-700">Your prepaid credit covers this quote.</Text>}
                </View>
              )}

              <Text className="text-xs font-display font-black text-ink/50 uppercase tracking-widest mb-1.5">Estimated Arrival (minutes)</Text>
              <TextInput
                className="font-sans border-2 border-ink/10 rounded-2xl px-4 py-3.5 text-base font-bold text-ink bg-ink/[0.02] mb-4"
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

              <Text className="text-xs font-display font-black text-ink/50 uppercase tracking-widest mb-1.5">Message (optional)</Text>
              <TextInput
                className="font-sans border-2 border-ink/10 rounded-2xl px-4 py-3 text-sm font-medium text-ink bg-ink/[0.02] mb-5"
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
                disabled={isSubmitting || !bidPrice || !estimatedArrival || suggestedCommissionTopup > 0}
                activeOpacity={0.85}
                className={`py-5 rounded-[32px] items-center ${bidPrice && estimatedArrival && suggestedCommissionTopup <= 0 ? 'bg-accent shadow-lg shadow-accent/30' : 'bg-ink/10'}`}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className={`font-black text-sm uppercase tracking-widest ${bidPrice && estimatedArrival && suggestedCommissionTopup <= 0 ? 'text-white' : 'text-ink/30'}`}>
                    {suggestedCommissionTopup > 0 ? `Top up $${Math.max(1, suggestedCommissionTopup).toFixed(2)} first` : `Submit Bid $${bidPrice || '—'}`}
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
<RemoteImage uri={selectedPhotoUrl} contentFit="contain" spinnerColor="#fff" style={{ width: '100%', height: '80%' }} />
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
        <Text className="text-sm font-display font-black text-ink">{title}</Text>
        <Text className={`text-sm font-black mt-0.5 tracking-widest ${highlight ? 'text-accent' : 'text-xs text-ink/50 font-medium'}`}>
          {value}
        </Text>
        {accent && <Text className="text-xs text-accent font-display font-black mt-0.5">{accent}</Text>}
      </View>
    </View>
  );
}

function getChecklistTags(job: Job): string[] {
  const checklist = job.checklist;
  if (!checklist) return [];
  if (checklist.category === 'HOUSE') {
    const c = checklist as HouseChecklist;
    const extra = checklist as any;
    return [...(c.cleaningTypes ?? []), ...(c.areas ?? []), ...(extra.addOns ?? []), ...(extra.attentionServices ?? [])];
  }
  const c = checklist as CarChecklist;
  return [...(c.cleaningTypes ?? []), ...(c.exteriorServices ?? []), ...(c.interiorServices ?? []), ...(c.deepServices ?? [])];
}

function formatDuration(minutes?: number): string {
  if (!minutes || !Number.isFinite(minutes)) return 'About 2–3 hours';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function commissionReserve(bidPrice: number): number {
  return roundUsd(bidPrice * 0.1);
}

function commissionTopupShortfall(bidPrice: number, balance?: number, commissionOwed?: number): number {
  if (!Number.isFinite(bidPrice) || bidPrice < 1) return 0;
  const debt = Math.max(0, Number(commissionOwed) || 0);
  const available = Math.max(0, Number(balance) || 0);
  return roundUsd(Math.max(0, debt, debt + commissionReserve(bidPrice) - available));
}
