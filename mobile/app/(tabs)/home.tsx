import { showPermissionDenied } from '@/utils/permissionPrompt';
import { appAlert } from '@/components/AppDialog';
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
  PanResponder,
  Image,
  Platform,
  Switch,

  AppState,
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
  Brush,
  Image as ImageIcon,
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
import { haversineDistanceKm, rankJobsByProximity } from '../../services/matching';
import { GlassCard, GlassSheet, GlassIconButton, RoleToggle } from '../../components/glass';
import { MapPlaceholder } from '../../components/MapPlaceholder';
import { IS_DEMO } from '../../utils/env';
import { callFunction } from '../../services/functions';
import { Mapbox, IS_MAPBOX_AVAILABLE } from '../../services/mapbox';
import { recordMapboxUsage } from '../../services/usageMetrics';
import { CleanerLocationPermissionError, completeCleanerPresenceStart, startCleanerLocationUpdates, stopCleanerLocationUpdates } from '../../services/locationTracking';
import { needsCleanerVerificationTopUp } from '../../utils/cleanerVerification';

export default function HomeScreen() {
  const { user, profile, locationTrackingError } = useAuth();
  const userId = user?.uid;
  const insets = useSafeAreaInsets();
  const [sheetHeight, setSheetHeight] = useState(0);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const sheetInitialized = useRef(false);
  const sheetTop = useRef(new Animated.Value(0)).current;
  const sheetTopValue = useRef(0);
  const panStartTop = useRef(0);
  const mapRef = useRef<React.ElementRef<typeof Mapbox.Camera>>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCleaners, setMapCleaners] = useState<{id:string;display_name:string;lat:number;lng:number;photo_url?:string|null}[]>([]);
  const [mapVisibility, setMapVisibility] = useState(false);
  const [mapVisibilityBusy, setMapVisibilityBusy] = useState(false);
  const [canUseForegroundLocation, setCanUseForegroundLocation] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [viewRole, setViewRole] = useState<'CUSTOMER' | 'CLEANER'>(
    (profile?.role as 'CUSTOMER' | 'CLEANER') ?? 'CUSTOMER'
  );
  const [cleanerStatus, setCleanerStatus] = useState<'AVAILABLE' | 'BUSY' | 'OFFLINE'>(
    (profile?.status as any) ?? 'OFFLINE'
  );

  const isCustomer = viewRole === 'CUSTOMER';
  const sheetSnapPoints = {
    expanded: Math.max(insets.top + 80, 104),
    normal: sheetHeight * 0.58,
    collapsed: Math.max(0, sheetHeight - 94),
  };
  const mapSearchLat = currentLocation ? Math.round(currentLocation.lat * 100) / 100 : null;
  const mapSearchLng = currentLocation ? Math.round(currentLocation.lng * 100) / 100 : null;

  useEffect(() => {
    const listener = sheetTop.addListener(({ value }) => { sheetTopValue.current = value; });
    return () => sheetTop.removeListener(listener);
  }, [sheetTop]);

  const snapSheet = useCallback((detent: 'expanded' | 'normal' | 'collapsed') => {
    if (!sheetHeight) return;
    if (detent !== 'collapsed') setIsSheetCollapsed(false);
    Animated.spring(sheetTop, {
      toValue: sheetSnapPoints[detent],
      useNativeDriver: false,
      damping: 26,
      stiffness: 230,
      mass: 0.9,
    }).start(({ finished }) => {
      if (finished) setIsSheetCollapsed(detent === 'collapsed');
    });
  }, [sheetHeight, sheetSnapPoints.collapsed, sheetSnapPoints.expanded, sheetSnapPoints.normal, sheetTop]);

  const sheetPanResponder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 7 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      sheetTop.stopAnimation(value => {
        sheetTopValue.current = value;
        panStartTop.current = value;
      });
    },
    onPanResponderMove: (_event, gesture) => {
      const next = Math.max(sheetSnapPoints.expanded, Math.min(sheetSnapPoints.collapsed, panStartTop.current + gesture.dy));
      sheetTop.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      const releasePosition = Math.max(sheetSnapPoints.expanded, Math.min(sheetSnapPoints.collapsed, panStartTop.current + gesture.dy));
      const detents = ['expanded', 'normal', 'collapsed'] as const;
      const nearest = detents.reduce((closest, candidate) =>
        Math.abs(sheetSnapPoints[candidate] - releasePosition) < Math.abs(sheetSnapPoints[closest] - releasePosition) ? candidate : closest,
      'normal');
      snapSheet(nearest);
    },
    onPanResponderTerminate: (_event, gesture) => {
      const releasePosition = Math.max(sheetSnapPoints.expanded, Math.min(sheetSnapPoints.collapsed, panStartTop.current + gesture.dy));
      const detents = ['expanded', 'normal', 'collapsed'] as const;
      const nearest = detents.reduce((closest, candidate) =>
        Math.abs(sheetSnapPoints[candidate] - releasePosition) < Math.abs(sheetSnapPoints[closest] - releasePosition) ? candidate : closest,
      'normal');
      snapSheet(nearest);
    },
  }), [sheetSnapPoints.collapsed, sheetSnapPoints.expanded, sheetSnapPoints.normal, sheetTop, snapSheet]);

  useEffect(() => {
    let active = true;
    if (!userId || isCustomer) { setMapVisibility(false); return; }
    callFunction<{}, {enabled:boolean}>('getCleanerMapVisibility', {}).then(result => { if (active) setMapVisibility(result.enabled); }).catch(() => { if (active) setMapVisibility(false); });
    return () => { active = false; };
  }, [userId, isCustomer]);

  useEffect(() => {
    let active = true;
    if (!userId || !isCustomer || mapSearchLat === null || mapSearchLng === null) { setMapCleaners([]); return; }
    const refresh = () => { void callFunction<{lat:number;lng:number},{cleaners:typeof mapCleaners}>('nearbyCleanersForMap', {lat:mapSearchLat,lng:mapSearchLng}).then(result => { if (active) setMapCleaners(result.cleaners); }).catch(() => { if (active) setMapCleaners([]); }); };
    refresh(); const timer = setInterval(refresh, 120000);
    return () => { active = false; clearInterval(timer); };
  }, [userId, isCustomer, mapSearchLat, mapSearchLng, refreshNonce]);

  const changeMapVisibility = async (enabled:boolean) => {
    setMapVisibilityBusy(true);
    try { const result=await callFunction<{enabled:boolean},{enabled:boolean}>('setCleanerMapVisibility',{enabled}); setMapVisibility(result.enabled); }
    catch (error) { appAlert('Could not update map visibility', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setMapVisibilityBusy(false); }
  };

  useEffect(() => {
    if (profile?.role) {
      setViewRole(profile.role as 'CUSTOMER' | 'CLEANER');
    }
  }, [profile?.role]);

  useEffect(() => {
    if (profile?.role === 'CLEANER') {
      setCleanerStatus(profile.status === 'AVAILABLE' || profile.status === 'BUSY' ? profile.status : 'OFFLINE');
    } else if (profile?.role === 'CUSTOMER') {
      setCleanerStatus('OFFLINE');
    }
  }, [profile?.role, profile?.status]);

  const handleRoleToggle = (newRole: 'CUSTOMER' | 'CLEANER') => {
    if (newRole === 'CLEANER') {
      const isRegistered = profile?.cleanerOnboardingComplete
        && profile?.hasAgreedToTerms
        && profile?.cleanerAgreementAccepted
        && profile?.verificationStatus === 'VERIFIED';
      if (!isRegistered) {
        if (needsCleanerVerificationTopUp(profile)) {
          appAlert('Add verification funds', 'Add at least $0.50 to your Detail wallet before starting cleaner registration. This one-time fee covers identity verification.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Add $0.50', onPress: () => router.push({ pathname: '/(tabs)/wallet', params: { verification: '1', returnToCleaner: '1' } }) },
          ]);
          return;
        }
        appAlert(
          'Cleaner Registration Required',
          'To work as a cleaner, complete registration, pay the one-time $0.50 identity verification fee from your Detail wallet, verify your mobile and email, and accept the cleaner agreement. Once approved, keep enough prepaid credit to cover 10% of each booking you accept.',
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
      callFunction('setActiveRole', { role: 'CLEANER' }).then(() => setViewRole('CLEANER')).catch((e:any) => appAlert('Could not switch role', e.message ?? 'Try again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Cleaner registration', onPress: () => router.push('/register-cleaner') }]));
    } else {
      callFunction('setActiveRole', { role: 'CUSTOMER' }).then(async () => {
        setViewRole('CUSTOMER');
        setCleanerStatus('OFFLINE');
        await stopCleanerLocationUpdates().catch((error) => console.warn('[location] could not stop after role switch:', error));
      }).catch((e:any) => appAlert('Could not switch role', e.message ?? 'Try again.'));
    }
  };

  const handleHomeLayout = (height: number) => {
    if (height <= 0) return;
    setSheetHeight(height);
    if (!sheetInitialized.current) {
      const initialTop = height * 0.58;
      sheetTop.setValue(initialTop);
      sheetTopValue.current = initialTop;
      sheetInitialized.current = true;
    }
  };

  useEffect(() => {
    let active = true;
    const checkPermission = () => {
      void Location.getForegroundPermissionsAsync().then(permission => {
        if (active) setCanUseForegroundLocation(permission.granted);
      }).catch(error => console.warn('[location] unable to check permission:', error));
    };
    checkPermission();
    const appState = AppState.addEventListener('change', state => { if (state === 'active') checkPermission(); });
    return () => { active = false; appState.remove(); };
  }, []);

  useEffect(() => {
    if (!canUseForegroundLocation) return;
    let active = true;
    let subscription: Location.LocationSubscription | undefined;
    void (async () => {
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 10000 },
        ({ coords }) => { if (active) setCurrentLocation({ lat: coords.latitude, lng: coords.longitude }); }
      );
      if (!active) subscription.remove();
    })().catch(error => console.warn('[location] unable to watch location:', error));
    return () => { active = false; subscription?.remove(); };
  }, [canUseForegroundLocation]);

  useEffect(() => {
    if (!userId) { setActiveJob(null); return; }
    const field = isCustomer ? 'customerId' : 'cleanerId';
    const q = query(
      collection(db, 'jobs'),
      where(field, '==', userId),
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
  }, [userId, isCustomer, refreshNonce]);

  useEffect(() => {
    if (!userId) { setRecentJobs([]); return; }
    const field = isCustomer ? 'customerId' : 'cleanerId';
    const q = query(
      collection(db, 'jobs'),
      where(field, '==', userId),
      where('status', '==', JobStatus.COMPLETED),
      orderBy('createdAt', 'desc'),
      limit(3)
    );
    return onSnapshot(
      q,
      (snap) => setRecentJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job))),
      (err) => console.warn('[home] recentJobs listener error:', err.message)
    );
  }, [userId, isCustomer, refreshNonce]);

  useEffect(() => {
    if (isCustomer || !userId || mapSearchLat === null || mapSearchLng === null) { setAvailableJobs([]); setJobsLoading(false); setJobsError(false); return; }
    setJobsLoading(true);
    setJobsError(false);
    // A feed update prompts a geographically scoped refresh; the query itself
    // selects nearest eligible jobs rather than only the newest global jobs.
    const q = query(collection(db, 'openJobs'), where('status', '==', JobStatus.PENDING), orderBy('createdAt', 'desc'), limit(30));
    let active = true;
    let revision = 0;
    let nextRefreshAt = 0;
    let pendingRefresh: ReturnType<typeof setTimeout> | undefined;
    const refreshJobs = () => {
        nextRefreshAt = Date.now() + 15000;
        const currentRevision = ++revision;
        callFunction<{ lat:number;lng:number }, { jobs: Job[] }>('nearbyCleanerJobs', {lat:mapSearchLat,lng:mapSearchLng})
          .then(({ jobs }) => { if (active && currentRevision === revision) { setAvailableJobs(jobs); setJobsLoading(false); setJobsError(false); } })
          .catch((err) => {
            console.warn('[home] availableJobs preview failed:', err instanceof Error ? err.message : String(err));
            if (active && currentRevision === revision) { setAvailableJobs([]); setJobsLoading(false); setJobsError(true); }
          });
    };
    const scheduleRefresh = () => {
      if (pendingRefresh) return;
      pendingRefresh = setTimeout(() => { pendingRefresh = undefined; refreshJobs(); }, Math.max(0, nextRefreshAt - Date.now()));
    };
    const unsubscribe = onSnapshot(
      q,
      () => scheduleRefresh(),
      (err) => { console.warn('[home] availableJobs listener error:', err.message); revision++; if (active) { setAvailableJobs([]); setJobsLoading(false); setJobsError(true); } }
    );
    const timer = setInterval(scheduleRefresh, 120000);
    return () => { active = false; revision++; clearInterval(timer); if (pendingRefresh) clearTimeout(pendingRefresh); unsubscribe(); };
  }, [userId, isCustomer, refreshNonce, mapSearchLat, mapSearchLng]);

  useEffect(() => {
    if (!userId || !isCustomer) { setFavorites([]); return; }
    const q = query(collection(db, 'favorites'), where('customerId', '==', userId), limit(10));
    return onSnapshot(
      q,
      (snap) => setFavorites(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Favorite))),
      (err) => console.warn('[home] favorites listener error:', err.message)
    );
  }, [userId, isCustomer, refreshNonce]);

  const toggleCleanerStatus = async () => {
    const next = cleanerStatus === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
    try {
      if(next==='AVAILABLE') {
        await startCleanerLocationUpdates();
        const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
        const point={lat:position.coords.latitude,lng:position.coords.longitude};setCurrentLocation(point);
        await callFunction('prepareCleanerLocation',point);
        await callFunction('updateCleanerPresence', { status: next });
        completeCleanerPresenceStart();
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
      if (error instanceof CleanerLocationPermissionError) showPermissionDenied(error.message, error.canAskAgain);
      else appAlert('Could not go online', error?.message || 'Please try again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Cleaner registration', onPress: () => router.push('/register-cleaner') }]);
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

  const savedLocation = profile.location && Number.isFinite(profile.location.lat) && Number.isFinite(profile.location.lng)
    ? profile.location
    : null;
  const mapCenter = currentLocation ?? savedLocation;
  const region = mapCenter
    ? { latitude: mapCenter.lat, longitude: mapCenter.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: 0, longitude: 0, latitudeDelta: 120, longitudeDelta: 120 };

  return (
    <View className="flex-1 bg-[#EDEBFA]" onLayout={(event) => handleHomeLayout(event.nativeEvent.layout.height)}>
      {IS_DEMO || !IS_MAPBOX_AVAILABLE ? (
        <MapPlaceholder style={{ flex: 1 }} />
      ) : (
        <Mapbox.MapView
          style={{ flex: 1 }}
          styleURL={Mapbox.StyleURL.Street}
          compassEnabled={false}
          scaleBarEnabled={false}
          onDidFinishLoadingMap={() => recordMapboxUsage('map_view')}
        >
          <Mapbox.Camera
            ref={mapRef}
            centerCoordinate={[region.longitude, region.latitude]}
            zoomLevel={mapCenter ? 15 : 1}
            defaultSettings={{
              centerCoordinate: [region.longitude, region.latitude],
              zoomLevel: mapCenter ? 15 : 1,
            }}
          />
          <Mapbox.UserLocation visible />
          {isCustomer && mapCleaners.filter(cleaner => Number.isFinite(cleaner.lat) && Number.isFinite(cleaner.lng)).map(cleaner => (
            <Mapbox.PointAnnotation key={`cleaner-${cleaner.id}`} id={`cleaner-${cleaner.id}`} coordinate={[cleaner.lng, cleaner.lat]} onSelected={() => appAlert(cleaner.display_name || 'Nearby cleaner', 'This marker shows an approximate area. Open Find a cleaner to browse verified cleaners.', [{text:'Close',style:'cancel'},{text:'Find a cleaner',onPress:()=>router.push('/cleaners')}])}>
            <View accessibilityLabel="Approximate cleaner area" style={{ width:40, height:40, backgroundColor:'#3906D2', borderColor:'#fff', borderWidth:2, borderRadius:20, alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              {cleaner.photo_url
                ? <Image source={{ uri: cleaner.photo_url }} style={{ width:36, height:36, borderRadius:18 }} />
                : <Brush size={18} color="#fff" />}
            </View>
            </Mapbox.PointAnnotation>
          ))}
          {!isCustomer && cleanerStatus === 'AVAILABLE' && currentLocation && rankJobsByProximity(availableJobs, currentLocation)
            .filter((job) => {
              const point = job.location;
              return point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
                && !(point.lat === 0 && point.lng === 0)
                && haversineDistanceKm(currentLocation, point) <= 25;
            })
            .slice(0, 20)
            .map((job) => (
              <Mapbox.PointAnnotation
                key={`nearby-job-${job.id}`}
                id={`nearby-job-${job.id}`}
                coordinate={[job.location.lng, job.location.lat]}
                onSelected={() => router.push({ pathname: '/job/[jobId]', params: { jobId: job.id } })}
              >
                <View accessibilityLabel="Approximate job area" style={{ backgroundColor: '#3906D2', borderColor: '#fff', borderWidth: 2, borderRadius: 20, padding: 8 }}>
                  {job.category === 'CAR' ? <Car size={18} color="#fff" /> : <HomeIcon size={18} color="#fff" />}
                </View>
              </Mapbox.PointAnnotation>
            ))}
        </Mapbox.MapView>
      )}

      {/* Header overlay */}
      <View
        className="absolute top-0 left-0 right-0"
        style={{
          paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24) + 16,
        }}
        pointerEvents="box-none"
      >
        <View className="flex-row items-center justify-between px-5" pointerEvents="box-none">
          <View style={{ width: 44, height: 44 }} />

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
            top: Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24) + 70,
          }}
          onPress={async () => {
            try {
              let location = currentLocation;
              if (!location) {
                const permission = await Location.requestForegroundPermissionsAsync();
                if (!permission.granted) {
                  showPermissionDenied('Allow location access to show your position on the map.', permission.canAskAgain);
                  return;
                }
                setCanUseForegroundLocation(true);
                const position = await Promise.race([
                  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                  new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Location timed out')), 15000)),
                ]);
                location = { lat: position.coords.latitude, lng: position.coords.longitude };
                setCurrentLocation(location);
              }
              mapRef.current?.setCamera({ centerCoordinate: [location.lng, location.lat], zoomLevel: 15, animationDuration: 400 });
            } catch {
              appAlert('Location unavailable', 'Check that location services are enabled and try again. Emulators may need a simulated location.');
            }
          }}
        >
          <MapPin size={18} color="#150256" />
        </GlassIconButton>
      </View>

      {/* Bottom glass sheet */}
      {isCustomer ? (
        <>
          {!isSheetCollapsed && <Animated.View
            className="absolute left-0 right-0 bottom-0"
            style={{ top: sheetTop, zIndex: 20 }}
          >
            <GlassSheet style={{ flex: 1 }}>
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#3906D2" />}
              >
                <CustomerPanel favorites={favorites} recentJobs={recentJobs} />
              </ScrollView>
            </GlassSheet>
            <View
              {...sheetPanResponder.panHandlers}
              accessibilityRole="adjustable"
              accessibilityLabel="Booking panel. Drag up for more details or down to collapse."
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, zIndex: 2, alignItems: 'center', justifyContent: 'center' }}
            />
          </Animated.View>}
          {isSheetCollapsed && <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open booking panel"
            onPress={() => { setIsSheetCollapsed(false); snapSheet('normal'); }}
            activeOpacity={0.9}
            className="absolute left-5 right-5 bottom-3 bg-white rounded-2xl px-4 py-4 flex-row items-center gap-3 border border-white/80"
            style={{ zIndex: 20, shadowColor: '#150256', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 10 }}
          >
            <View className="w-9 h-9 bg-accent rounded-xl items-center justify-center"><Plus size={18} color="#fff" /></View>
            <Text className="flex-1 font-display font-black text-ink">Request cleaning</Text>
            <ChevronRight size={18} color="#3906D2" />
          </TouchableOpacity>}
        </>
      ) : (
        <View className="absolute bottom-0 left-0 right-0" style={{ top: '60%' }} pointerEvents="box-none">
          <GlassSheet style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#3906D2" />}
          >
            <CleanerPanel
                profile={profile}
                status={cleanerStatus}
                trackingIssue={locationTrackingError}
                locationUpdatedAt={profile.locationUpdatedAt}
                onToggleStatus={toggleCleanerStatus}
                availableJobs={availableJobs}
                jobsLoading={jobsLoading}
                jobsError={jobsError}
                onRetryJobs={() => setRefreshNonce(value => value + 1)}
                currentLocation={currentLocation}
                mapVisibility={mapVisibility}
                mapVisibilityBusy={mapVisibilityBusy}
                onChangeMapVisibility={changeMapVisibility}
            />
          </ScrollView>
        </GlassSheet>
        </View>
      )}
    </View>
  );
}

function CustomerPanel({ favorites, recentJobs }: { favorites: Favorite[]; recentJobs: Job[] }) {
  return (
    <View className="pb-6">
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

      <TouchableOpacity
        onPress={() => router.push('/booking/create')}
        activeOpacity={0.88}
        className="bg-accent rounded-3xl py-4 px-5 flex-row items-center gap-3 mb-5"
        style={{ shadowColor: '#3906D2', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}
      >
        <View className="w-9 h-9 bg-white/20 rounded-xl items-center justify-center">
          <Plus size={18} color="#fff" />
        </View>
        <Text className="text-white font-display font-black text-sm uppercase tracking-widest flex-1">Request Cleaning</Text>
        <ChevronRight size={18} color="rgba(255,255,255,0.8)" />
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

function LocationFreshness({ updatedAt }: { updatedAt?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  const ageMs = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : null;
  const stale = ageMs === null || ageMs > 5 * 60_000;
  const label = ageMs === null
    ? 'Location update not received yet'
    : ageMs < 10_000
      ? 'Location updated just now'
      : `Location updated ${Math.floor(ageMs / 60_000)} min ago`;
  return (
    <View className={`rounded-xl px-3 py-2 mb-4 ${stale ? 'bg-amber-50' : 'bg-emerald-50'}`}>
      <Text className={`font-sans text-xs font-bold ${stale ? 'text-amber-900' : 'text-emerald-800'}`}>
        {stale ? `${label} · nearby matching may pause until refreshed` : label}
      </Text>
    </View>
  );
}

function CleanerPanel({
  profile,
  status,
  trackingIssue,
  locationUpdatedAt,
  onToggleStatus,
  availableJobs,
  jobsLoading,
  jobsError,
  onRetryJobs,
  currentLocation,
  mapVisibility,
  mapVisibilityBusy,
  onChangeMapVisibility,
}: {
  profile: any;
  status: string;
  trackingIssue: string | null;
  locationUpdatedAt?: string;
  onToggleStatus: () => void;
  availableJobs: Job[];
  jobsLoading: boolean;
  jobsError: boolean;
  onRetryJobs: () => void;
  currentLocation: { lat: number; lng: number } | null;
  mapVisibility: boolean;
  mapVisibilityBusy: boolean;
  onChangeMapVisibility: (enabled:boolean) => void;
}) {
  const isAvailable = status === 'AVAILABLE';
  const [jobSort, setJobSort] = useState<'latest' | 'nearest' | 'budget-high' | 'budget-low' | 'duration'>('latest');
  const [jobCategory, setJobCategory] = useState<'ALL' | 'HOUSE' | 'CAR'>('ALL');
  const eligibleJobs = availableJobs.filter(job => jobCategory === 'ALL' || job.category === jobCategory);
  const timestamp = (value: unknown) => {
    const date = value instanceof Date ? value : new Date(typeof value === 'string' || typeof value === 'number' ? value : 0);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  };
  const displayJobs = jobSort === 'nearest' && currentLocation
    ? rankJobsByProximity(eligibleJobs, currentLocation)
    : [...eligibleJobs].sort((a, b) => {
      if (jobSort === 'latest' || jobSort === 'nearest') return timestamp(b.createdAt) - timestamp(a.createdAt);
      const aValue = Number(jobSort === 'duration' ? a.estimatedDuration : a.budget);
      const bValue = Number(jobSort === 'duration' ? b.estimatedDuration : b.budget);
      const aKnown = Number.isFinite(aValue) && aValue > 0;
      const bKnown = Number.isFinite(bValue) && bValue > 0;
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      if (!aKnown) return timestamp(b.createdAt) - timestamp(a.createdAt);
      return (jobSort === 'budget-high' ? bValue - aValue : aValue - bValue) || timestamp(b.createdAt) - timestamp(a.createdAt);
    });

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
      {trackingIssue && (
        <View className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
          <Text className="font-display font-black text-amber-950">Location sharing needs attention</Text>
          <Text className="font-sans text-xs text-amber-900 mt-1">{trackingIssue} Go offline, then online again after restoring permission.</Text>
        </View>
      )}
      {isAvailable && (
        <LocationFreshness updatedAt={locationUpdatedAt} />
      )}
      <View className="flex-row items-center justify-between rounded-2xl bg-white p-4 mb-4"><View className="flex-1 pr-3"><Text className="font-display font-black text-ink">Show my area on customer maps</Text><Text className="font-sans text-xs text-ink/50 mt-1">When online, customers can see your approximate area. Your exact location is not shown on the map.</Text></View><Switch accessibilityLabel="Show my approximate area on customer maps" value={mapVisibility} disabled={mapVisibilityBusy} onValueChange={onChangeMapVisibility} /></View>
      <TouchableOpacity onPress={()=>router.push('/instant-offers')} className="flex-row items-center justify-between rounded-2xl bg-accent/10 border border-accent/20 px-4 py-3 mb-4">
        <Text className="font-display font-black text-accent">Nearby instant offers</Text><ChevronRight size={18} color="#3906D2"/>
      </TouchableOpacity>

      <View className="flex-row gap-3 mb-5">
        {[
          { label: 'Jobs', value: profile.jobsCompleted ?? 0, icon: CheckCircle },
          { label: 'Rating', value: profile.ratingAverage?.toFixed(1) ?? '—', icon: Star },
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
            Available requests{displayJobs.length > 0 ? ` (${displayJobs.length})` : ''}
          </Text>
          <Text className="font-sans text-xs text-ink/50 mb-2">Nearby requests you can quote on. Budgets are customer estimates.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {([['ALL', 'All services'], ['HOUSE', 'House'], ['CAR', 'Car']] as const).map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: jobCategory === value }} onPress={() => setJobCategory(value)} className={`rounded-full px-4 py-2 ${jobCategory === value ? 'bg-accent' : 'bg-white border border-slate-200'}`}><Text className={`text-xs font-sans-bold ${jobCategory === value ? 'text-white' : 'text-slate-700'}`}>{label}</Text></TouchableOpacity>)}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {([['latest', 'Newest'], ['nearest', 'Nearest'], ['budget-high', 'Budget: high'], ['budget-low', 'Budget: low'], ['duration', 'Shortest job']] as const).map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: jobSort === value }} onPress={() => setJobSort(value)} className={`rounded-full px-4 py-2 ${jobSort === value ? 'bg-accent' : 'bg-white border border-slate-200'}`}><Text className={`text-xs font-sans-bold ${jobSort === value ? 'text-white' : 'text-slate-700'}`}>{label}</Text></TouchableOpacity>)}
          </ScrollView>
          {jobsLoading ? (
            <View accessibilityRole="progressbar" accessibilityLabel="Loading nearby jobs" className="bg-white rounded-2xl p-5 border border-slate-100">
              <View className="h-4 w-2/3 rounded-full bg-[#EBE8F7] mb-3" />
              <View className="h-3 w-4/5 rounded-full bg-canvas" />
            </View>
          ) : jobsError ? (
            <View className="bg-white rounded-2xl p-5 border border-slate-100 items-center">
              <Text accessibilityRole="alert" className="text-center text-sm text-ink/60">Could not load nearby jobs. Check your connection and try again.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={onRetryJobs} className="mt-3 rounded-xl bg-accent px-5 py-3"><Text className="font-display font-bold text-white">Try again</Text></TouchableOpacity>
            </View>
          ) : !currentLocation ? (
            <View className="bg-white rounded-2xl p-5 border border-slate-100"><Text className="text-sm text-ink/60 text-center">Enable location to see nearby jobs.</Text></View>
          ) : displayJobs.length === 0 ? (
            <View className="bg-white rounded-2xl p-8 items-center border border-slate-100">
              <View className="w-14 h-14 bg-accent/10 rounded-2xl items-center justify-center mb-3">
                <CheckCircle size={28} color="#3906D2" />
              </View>
              <Text className="text-sm font-display font-black text-slate-900 text-center">{availableJobs.length ? 'No requests match this filter' : 'No jobs nearby right now'}</Text>
              <Text className="font-sans text-xs text-slate-400 font-medium text-center mt-1">
                {availableJobs.length ? 'Choose another service to see more requests.' : "You'll get a notification as soon as one is posted"}
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {displayJobs.map((job) => {
                const thumbUrl = Array.isArray(job.photos) && job.photos.length > 0 ? job.photos[0] : null;
                const scope = (job.checklist && typeof job.checklist === 'object' ? job.checklist : {}) as Record<string, unknown>;
                const scopeValues = job.category === 'CAR'
                  ? [scope.vehicleType, scope.vehicleSize, scope.seats ? `${scope.seats} seats` : null, ...(Array.isArray(scope.cleaningTypes) ? scope.cleaningTypes : []), ...(Array.isArray(scope.exteriorServices) ? scope.exteriorServices : []), ...(Array.isArray(scope.interiorServices) ? scope.interiorServices : []), ...(Array.isArray(scope.deepServices) ? scope.deepServices : [])]
                  : [scope.propertyType, scope.propertySize, scope.areaSize, ...(Array.isArray(scope.areas) ? scope.areas : []), ...(Array.isArray(scope.cleaningTypes) ? scope.cleaningTypes : []), ...(Array.isArray(scope.addOns) ? scope.addOns : []), ...(Array.isArray(scope.attentionServices) ? scope.attentionServices : []), scope.roomsCount ? `${scope.roomsCount} rooms` : null, scope.bathroomsCount ? `${scope.bathroomsCount} bathrooms` : null, scope.bedrooms ? `${scope.bedrooms} bedrooms` : null];
                const scopeLabel = scopeValues.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').slice(0, 4).join(' · ');
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
                      {!!scopeLabel && (
                        <Text className="font-sans text-[11px] text-slate-600 font-medium mb-1.5" numberOfLines={2}>
                          Scope: {scopeLabel}
                        </Text>
                      )}

                      <View className="flex-row items-center gap-3">
                        <View className="flex-row items-center gap-1">
                          <MapPin size={11} color="#3906D2" />
                          <Text className="font-sans text-[11px] font-bold text-slate-500">Approximate area</Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Clock size={11} color="#94a3b8" />
                          <Text className="font-sans text-[11px] font-bold text-slate-400">
                            {durationLabel}
                          </Text>
                        </View>
                        {Array.isArray(job.photos) && job.photos.length > 0 && (
                          <View className="flex-row items-center gap-1"><ImageIcon size={11} color="#94a3b8" /><Text className="font-sans text-[10px] font-bold text-slate-400">{job.photos.length}</Text></View>
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
        {job.category === 'CAR' ? <Car size={19} color="#3906D2" /> : <Brush size={19} color="#3906D2" />}
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
