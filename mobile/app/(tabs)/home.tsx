// Home tab — Uber-style live map with a floating glass control panel.
// Customer mode: map + "Request Cleaning" sheet + service shortcuts + favorites.
// Cleaner mode: map + online/offline sheet + live incoming job requests.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Bell,
  Plus,
  MapPin,
  ChevronRight,
  Star,
  Clock,
  CheckCircle,
  Power,
  DollarSign,
  Navigation,
  Home as HomeIcon,
  Car,
  Heart,
  Search,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  orderBy,
  limit,
} from '../../services/supabase';
import { Job, JobStatus, Favorite } from '../../types';
import { Logo } from '../../components/Logo';
import { haversineDistanceKm, rankJobsByProximity } from '../../services/matching';
import { GlassCard, GlassSheet, GlassIconButton, RoleToggle } from '../../components/glass';
import { MapPlaceholder } from '../../components/MapPlaceholder';
import { IS_DEMO } from '../../utils/env';
import { callFunction } from '../../services/functions';
import { Mapbox, IS_MAPBOX_AVAILABLE } from '../../services/mapbox';
import { startCleanerLocationUpdates, stopCleanerLocationUpdates } from '../../services/locationTracking';

const FALLBACK_REGION = { latitude: -17.8252, longitude: 31.0335, latitudeDelta: 0.12, longitudeDelta: 0.12 };

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<React.ElementRef<typeof Mapbox.Camera>>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [viewRole, setViewRole] = useState<'CUSTOMER' | 'CLEANER'>(
    (profile?.role as 'CUSTOMER' | 'CLEANER') ?? 'CUSTOMER'
  );
  const [cleanerStatus, setCleanerStatus] = useState<'AVAILABLE' | 'BUSY' | 'OFFLINE'>(
    (profile?.status as any) ?? 'OFFLINE'
  );

  const isCustomer = viewRole === 'CUSTOMER';

  useEffect(() => {
    if (profile?.role) {
      setViewRole(profile.role as 'CUSTOMER' | 'CLEANER');
    }
  }, [profile?.role]);

  const handleRoleToggle = (newRole: 'CUSTOMER' | 'CLEANER') => {
    if (newRole === 'CLEANER') {
      const isRegistered = profile?.cleanerOnboardingComplete
        && profile?.hasAgreedToTerms
        && profile?.cleanerAgreementAccepted
        && profile?.verificationStatus === 'VERIFIED';
      if (!isRegistered) {
        Alert.alert(
          'Cleaner Registration Required',
          'To start earning and accept cleaning jobs, please complete your cleaner registration first.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Register Now',
              style: 'default',
              onPress: () => router.push('/register-cleaner'),
            },
          ]
        );
        return;
      }
      callFunction('setActiveRole', { role: 'CLEANER' }).then(() => setViewRole('CLEANER')).catch((e:any) => Alert.alert('Could not switch role', e.message ?? 'Try again.'));
    } else {
      callFunction('setActiveRole', { role: 'CUSTOMER' }).then(() => setViewRole('CUSTOMER')).catch((e:any) => Alert.alert('Could not switch role', e.message ?? 'Try again.'));
    }
  };

  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(({ coords }) => {
        const location = { lat: coords.latitude, lng: coords.longitude };
        setCurrentLocation(location);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustomer]);

  useEffect(() => {
    if (!user) return;
    const field = isCustomer ? 'customerId' : 'cleanerId';
    const q = query(
      collection(db, 'jobs'),
      where(field, '==', user.uid),
      where('status', 'in', [JobStatus.ASSIGNED, JobStatus.EN_ROUTE, JobStatus.IN_PROGRESS, JobStatus.IN_PROGRESS]),
      limit(1)
    );
    return onSnapshot(
      q,
      (snap) => {
        setActiveJob(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Job));
      },
      (err) => console.warn('[home] activeJob listener error:', err.message)
    );
  }, [user, isCustomer, refreshNonce]);

  useEffect(() => {
    if (!user) return;
    const field = isCustomer ? 'customerId' : 'cleanerId';
    const q = query(
      collection(db, 'jobs'),
      where(field, '==', user.uid),
      where('status', '==', JobStatus.COMPLETED),
      orderBy('createdAt', 'desc'),
      limit(3)
    );
    return onSnapshot(
      q,
      (snap) => setRecentJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job))),
      (err) => console.warn('[home] recentJobs listener error:', err.message)
    );
  }, [user, isCustomer, refreshNonce]);

  useEffect(() => {
    if (isCustomer) return;
    // Fetch a wider candidate pool than we display — CleanerPanel re-sorts
    // this by distance (nearest first, Uber-style), so a larger pool means
    // a genuinely-nearby job doesn't get missed just because it wasn't one
    // of the 10 most recently posted.
    const q = query(collection(db, 'openJobs'), where('status', '==', JobStatus.PENDING), orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(
      q,
      (snap) => setAvailableJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job))),
      (err) => console.warn('[home] availableJobs listener error:', err.message)
    );
  }, [isCustomer, refreshNonce]);

  useEffect(() => {
    if (!user || !isCustomer) return;
    const q = query(collection(db, 'favorites'), where('customerId', '==', user.uid), limit(10));
    return onSnapshot(
      q,
      (snap) => setFavorites(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Favorite))),
      (err) => console.warn('[home] favorites listener error:', err.message)
    );
  }, [user, isCustomer, refreshNonce]);

  const toggleCleanerStatus = async () => {
    const next = cleanerStatus === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
    try {
      if(next==='AVAILABLE') {
        await startCleanerLocationUpdates();
        const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
        const point={lat:position.coords.latitude,lng:position.coords.longitude};setCurrentLocation(point);
        await callFunction('prepareCleanerLocation',point);
        await callFunction('updateCleanerPresence', { status: next });
      } else {
        await callFunction('updateCleanerPresence', { status: next });
        await stopCleanerLocationUpdates();
      }
      setCleanerStatus(next);
    } catch(error:any) {
      if(next==='AVAILABLE'){
        await stopCleanerLocationUpdates().catch(()=>{});
        await callFunction('updateCleanerPresence',{status:'OFFLINE'}).catch(()=>{});
      }
      Alert.alert('Location permission needed',error?.message||'Detail needs background location permission while you are online.');
    }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshNonce(value => value + 1);
    setTimeout(() => setIsRefreshing(false), 900);
  }, []);

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#3906D2" size="large" />
      </View>
    );
  }

  const region = currentLocation
    ? { latitude: currentLocation.lat, longitude: currentLocation.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : FALLBACK_REGION;

  return (
    <View className="flex-1 bg-[#EDEBFA]">
      {IS_DEMO || !IS_MAPBOX_AVAILABLE ? (
        <MapPlaceholder style={{ flex: 1 }} />
      ) : (
        <Mapbox.MapView
          style={{ flex: 1 }}
          styleURL={Mapbox.StyleURL.Street}
          compassEnabled={false}
          scaleBarEnabled={false}
        >
          <Mapbox.Camera
            ref={mapRef}
            centerCoordinate={[region.longitude, region.latitude]}
            zoomLevel={currentLocation ? 14 : 10}
            defaultSettings={{
              centerCoordinate: [region.longitude, region.latitude],
              zoomLevel: currentLocation ? 14 : 10,
            }}
          />
          <Mapbox.UserLocation visible />
        </Mapbox.MapView>
      )}

      {/* Header overlay */}
      <View
        className="absolute top-0 left-0 right-0"
        style={{
          paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24) + 6,
        }}
        pointerEvents="box-none"
      >
        <View className="flex-row items-center justify-between px-5" pointerEvents="box-none">
          <GlassCard style={{ width: 44, height: 44, borderRadius: 16 }} noBlur={false}>
            <View className="flex-1 items-center justify-center">
              <Logo size={20} color="#3906D2" />
            </View>
          </GlassCard>

          <RoleToggle value={viewRole} onChange={handleRoleToggle} />

          <GlassIconButton size={44} onPress={() => router.push('/notifications')}>
            <Bell size={18} color="#150256" />
          </GlassIconButton>
        </View>

        {/* Active job banner */}
        {activeJob && (
          <TouchableOpacity
            onPress={() => router.push(`/tracking/${activeJob.id}`)}
            activeOpacity={0.9}
            className="mx-5 mt-3"
          >
            <GlassCard variant="brand" style={{ padding: 16 }}>
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 bg-white/20 rounded-2xl items-center justify-center">
                  <Navigation size={18} color="#fff" />
                </View>
                <View className="flex-1">
                  <Text className="text-[10px] font-display font-black text-white/70 uppercase tracking-widest">
                    Active Job
                  </Text>
                  <Text className="text-sm font-display font-black text-white mt-0.5">{activeJob.serviceType}</Text>
                </View>
                <ChevronRight size={18} color="rgba(255,255,255,0.8)" />
              </View>
            </GlassCard>
          </TouchableOpacity>
        )}

        <GlassIconButton
          size={44}
          style={{
            position: 'absolute',
            right: 20,
            top: Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24) + 60,
          }}
          onPress={() => {
            if (currentLocation) {
              mapRef.current?.setCamera({
                centerCoordinate: [currentLocation.lng, currentLocation.lat],
                zoomLevel: 14,
                animationDuration: 400,
              });
            }
          }}
        >
          <MapPin size={18} color="#150256" />
        </GlassIconButton>
      </View>

      {/* Bottom glass sheet */}
      <View className="absolute bottom-0 left-0 right-0" pointerEvents="box-none">
        <GlassSheet style={{ maxHeight: '62%' }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#3906D2" />}
          >
            {isCustomer ? (
              <CustomerPanel favorites={favorites} recentJobs={recentJobs} />
            ) : (
              <CleanerPanel
                profile={profile}
                status={cleanerStatus}
                onToggleStatus={toggleCleanerStatus}
                availableJobs={availableJobs}
                currentLocation={currentLocation}
              />
            )}
          </ScrollView>
        </GlassSheet>
      </View>
    </View>
  );
}

function CustomerPanel({ favorites, recentJobs }: { favorites: Favorite[]; recentJobs: Job[] }) {
  return (
    <View className="pb-6">
      <TouchableOpacity
        onPress={() => router.push('/booking/create')}
        activeOpacity={0.88}
        className="bg-accent rounded-3xl py-4 px-5 flex-row items-center gap-3 mb-4"
        style={{ shadowColor: '#3906D2', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}
      >
        <View className="w-9 h-9 bg-white/20 rounded-xl items-center justify-center">
          <Plus size={18} color="#fff" />
        </View>
        <Text className="text-white font-display font-black text-sm uppercase tracking-widest flex-1">Request Cleaning</Text>
        <ChevronRight size={18} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>

      <View className="flex-row gap-3 mb-5">
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/booking/create', params: { category: 'HOUSE' } })}
          activeOpacity={0.85}
          className="flex-1 bg-white border border-slate-100 rounded-2xl p-4 items-center"
        >
          <View className="w-11 h-11 bg-accent/10 rounded-xl items-center justify-center mb-2">
            <HomeIcon size={20} color="#3906D2" />
          </View>
          <Text className="text-xs font-display font-black text-slate-900">House</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/booking/create', params: { category: 'CAR' } })}
          activeOpacity={0.85}
          className="flex-1 bg-white border border-slate-100 rounded-2xl p-4 items-center"
        >
          <View className="w-11 h-11 bg-accent/10 rounded-xl items-center justify-center mb-2">
            <Car size={20} color="#3906D2" />
          </View>
          <Text className="text-xs font-display font-black text-slate-900">Car</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => router.push('/cleaners')} className="flex-row items-center gap-3 bg-white border border-slate-100 rounded-2xl px-4 py-3.5 mb-5">
        <View className="w-9 h-9 bg-accent/10 rounded-xl items-center justify-center"><Search size={17} color="#3906D2" /></View>
        <View className="flex-1"><Text className="text-sm font-display font-black text-ink">Find a cleaner</Text><Text className="font-sans text-[11px] text-ink/45">Search verified professionals and save favorites</Text></View>
        <ChevronRight size={17} color="#9C94C4" />
      </TouchableOpacity>

      {favorites.length > 0 && (
        <View className="mb-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest">Favorites</Text>
            <TouchableOpacity onPress={() => router.push('/favorites')}>
              <Text className="text-xs font-display font-black text-accent">See All</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {favorites.map((f) => (
              <View key={f.id} className="items-center w-20">
                <View className="w-16 h-16 rounded-full bg-accent/10 items-center justify-center mb-1.5 border-2 border-white overflow-hidden">
                  {f.cleanerPhoto ? (
                    <Image source={{ uri: f.cleanerPhoto }} style={{ width: 64, height: 64 }} />
                  ) : (
                    <Heart size={20} color="#3906D2" />
                  )}
                </View>
                <Text className="font-sans text-[10px] font-bold text-ink text-center" numberOfLines={1}>
                  {f.cleanerName ?? 'Cleaner'}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {recentJobs.length > 0 && (
        <View>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest">Recent Jobs</Text>
            <TouchableOpacity onPress={() => router.push('/history')}>
              <Text className="text-xs font-display font-black text-accent">View All</Text>
            </TouchableOpacity>
          </View>
          <View className="gap-3">
            {recentJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function CleanerPanel({
  profile,
  status,
  onToggleStatus,
  availableJobs,
  currentLocation,
}: {
  profile: any;
  status: string;
  onToggleStatus: () => void;
  availableJobs: Job[];
  currentLocation: { lat: number; lng: number } | null;
}) {
  const isAvailable = status === 'AVAILABLE';
  // Uber-style "match nearby first" — once we know where the cleaner is,
  // show the closest jobs first instead of just the most recently posted.
  const displayJobs = (currentLocation ? rankJobsByProximity(availableJobs, currentLocation) : availableJobs).slice(
    0,
    10
  );

  return (
    <View className="pb-6">
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-[10px] font-display font-black text-ink/40 uppercase tracking-widest mb-1">Your Status</Text>
          <View className="flex-row items-center gap-2">
            <View className={`w-2.5 h-2.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <Text className="text-lg font-display font-black text-ink">{isAvailable ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onToggleStatus}
          activeOpacity={0.85}
          className="flex-row items-center gap-2 px-5 py-3 rounded-2xl"
          style={{ backgroundColor: isAvailable ? 'rgba(21,2,86,0.08)' : '#3906D2' }}
        >
          <Power size={16} color={isAvailable ? '#150256' : '#fff'} />
          <Text
            className="text-xs font-display font-black uppercase tracking-widest"
            style={{ color: isAvailable ? '#150256' : '#fff' }}
          >
            {isAvailable ? 'Go Offline' : 'Go Online'}
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={()=>router.push('/instant-offers')} className="flex-row items-center justify-between rounded-2xl bg-accent/10 border border-accent/20 px-4 py-3 mb-4">
        <Text className="font-display font-black text-accent">Nearby instant offers</Text><ChevronRight size={18} color="#3906D2"/>
      </TouchableOpacity>

      <View className="flex-row gap-3 mb-5">
        {[
          { label: 'Jobs', value: profile.jobsCompleted ?? 0, icon: CheckCircle },
          { label: 'Rating', value: `${profile.ratingAverage?.toFixed(1) ?? '—'}★`, icon: Star },
          { label: 'Earned', value: `$${profile.balance?.toFixed(0) ?? 0}`, icon: DollarSign },
        ].map(({ label, value, icon: Icon }) => (
          <View key={label} className="flex-1 bg-white rounded-2xl p-3 items-center border border-slate-100">
            <Icon size={16} color="#3906D2" />
            <Text className="text-base font-display font-black text-slate-900 mt-1">{String(value)}</Text>
            <Text className="font-sans text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</Text>
          </View>
        ))}
      </View>

      {isAvailable && (
        <View>
          <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest mb-3">
            Incoming Jobs{displayJobs.length > 0 ? ` (${displayJobs.length}) · Nearest first` : ''}
          </Text>
          {displayJobs.length === 0 ? (
            <View className="bg-white rounded-2xl p-8 items-center border border-slate-100">
              <View className="w-14 h-14 bg-accent/10 rounded-2xl items-center justify-center mb-3">
                <CheckCircle size={28} color="#3906D2" />
              </View>
              <Text className="text-sm font-display font-black text-slate-900 text-center">No jobs nearby right now</Text>
              <Text className="font-sans text-xs text-slate-400 font-medium text-center mt-1">
                You'll get a notification as soon as one is posted
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {displayJobs.map((job) => {
                const thumbUrl = Array.isArray(job.photos) && job.photos.length > 0 ? job.photos[0] : null;
                const regNum = (job.checklist as any)?.registrationNumber;
                const dist = currentLocation && job.location?.lat && job.location?.lng
                  ? `${haversineDistanceKm(currentLocation, { lat: job.location.lat, lng: job.location.lng }).toFixed(1)} km`
                  : null;
                const estimatedMinutes = Number(job.estimatedDuration);
                const durationLabel = Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
                  ? estimatedMinutes < 60 ? `${estimatedMinutes} min`
                    : `${Math.floor(estimatedMinutes / 60)} hr${estimatedMinutes % 60 ? ` ${estimatedMinutes % 60} min` : ''}`
                  : 'Review scope';
                return (
                  <TouchableOpacity
                    key={job.id}
                    onPress={() => router.push({ pathname: '/job/[jobId]', params: { jobId: job.id } })}
                    className="bg-white rounded-2xl p-4 border border-slate-100 flex-row items-center gap-3"
                    activeOpacity={0.8}
                  >
                    {/* Thumb or category icon */}
                    {thumbUrl ? (
                      <Image source={{ uri: thumbUrl }} style={{ width: 56, height: 56, borderRadius: 12 }} />
                    ) : (
                      <View className="w-14 h-14 bg-accent/10 rounded-xl items-center justify-center">
                        {job.category === 'CAR'
                          ? <Car size={24} color="#3906D2" />
                          : <HomeIcon size={24} color="#3906D2" />}
                      </View>
                    )}

                    {/* Body */}
                    <View className="flex-1">
                      <View className="flex-row items-center justify-between mb-0.5">
                        <Text className="text-sm font-display font-black text-slate-900 flex-1" numberOfLines={1}>
                          {job.serviceType}
                        </Text>
                        <View className="bg-accent px-2.5 py-1 rounded-lg ml-2">
                          <Text className="text-xs font-display font-black text-white">
                            {job.budget ? `$${job.budget}` : 'Open'}
                          </Text>
                        </View>
                      </View>

                      <Text className="font-sans text-xs text-slate-400 font-medium mb-1.5" numberOfLines={1}>
                        {job.location?.address}
                      </Text>

                      <View className="flex-row items-center gap-3">
                        {dist && (
                          <View className="flex-row items-center gap-1">
                            <MapPin size={11} color="#3906D2" />
                            <Text className="font-sans text-[11px] font-bold text-slate-500">{dist}</Text>
                          </View>
                        )}
                        <View className="flex-row items-center gap-1">
                          <Clock size={11} color="#94a3b8" />
                          <Text className="font-sans text-[11px] font-bold text-slate-400">
                            {durationLabel}
                          </Text>
                        </View>
                        {regNum && (
                          <View className="bg-slate-100 px-2 py-0.5 rounded-md">
                            <Text className="text-[10px] font-display font-black text-slate-600 tracking-wider">{regNum}</Text>
                          </View>
                        )}
                        {Array.isArray(job.photos) && job.photos.length > 0 && (
                          <Text className="font-sans text-[10px] font-bold text-slate-400">📷 {job.photos.length}</Text>
                        )}
                      </View>
                    </View>

                    <ChevronRight size={16} color="#cbd5e1" />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function JobCard({ job }: { job: Job }) {
  const STATUS_COLORS: Record<string, string> = {
    COMPLETED: 'bg-emerald-50 text-emerald-700',
    CANCELLED: 'bg-red-50 text-red-600',
    IN_PROGRESS: 'bg-blue-50 text-blue-700',
  };
  const colorClass = STATUS_COLORS[job.status] ?? 'bg-slate-50 text-slate-600';

  return (
    <View className="bg-white/70 rounded-3xl p-4 border border-white flex-row items-center gap-4">
      <View className="w-11 h-11 bg-accent/10 rounded-2xl items-center justify-center">
        <Text className="font-sans text-lg">{job.category === 'CAR' ? '🚗' : '🧹'}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-display font-black text-ink">{job.serviceType}</Text>
        <Text className="font-sans text-xs text-ink/50 font-medium mt-0.5" numberOfLines={1}>
          {job.location?.address}
        </Text>
      </View>
      <View className={`px-3 py-1.5 rounded-xl ${colorClass}`}>
        <Text className="text-[10px] font-display font-black uppercase tracking-wider">{job.status}</Text>
      </View>
    </View>
  );
}
