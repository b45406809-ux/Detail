// Home tab screen — route: /home (first tab in the navigator)
// Full implementation lives here; the (app)/index.tsx stub should be deleted.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Bell,
  Plus,
  MapPin,
  ChevronRight,
  Star,
  Clock,
  CheckCircle,
  Zap,
  Power,
  DollarSign,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from '../../services/firebase';
import { Job, JobStatus } from '../../types';
import { Logo } from '../../components/Logo';

export default function HomeScreen() {
  const { user, profile, updateProfile } = useAuth();
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cleanerStatus, setCleanerStatus] = useState<'AVAILABLE' | 'BUSY' | 'OFFLINE'>(
    (profile?.status as any) ?? 'OFFLINE'
  );

  const isCustomer = profile?.role === 'CUSTOMER';
  const isCleaner = profile?.role === 'CLEANER';

  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(({ coords }) =>
        setCurrentLocation({ lat: coords.latitude, lng: coords.longitude })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const field = isCustomer ? 'customerId' : 'cleanerId';
    const q = query(
      collection(db, 'jobs'),
      where(field, '==', user.uid),
      where('status', 'in', [
        JobStatus.ACCEPTED,
        JobStatus.EN_ROUTE,
        JobStatus.ARRIVED,
        JobStatus.IN_PROGRESS,
      ]),
      limit(1)
    );
    return onSnapshot(q, (snap) => {
      setActiveJob(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Job));
    });
  }, [user, isCustomer]);

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
    return onSnapshot(q, (snap) => {
      setRecentJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job)));
    });
  }, [user, isCustomer]);

  useEffect(() => {
    if (!isCleaner) return;
    const q = query(
      collection(db, 'jobs'),
      where('status', '==', JobStatus.BIDDING),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    return onSnapshot(q, (snap) => {
      setAvailableJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job)));
    });
  }, [isCleaner]);

  const toggleCleanerStatus = async () => {
    const next = cleanerStatus === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
    setCleanerStatus(next);
    await updateProfile({ status: next });
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setIsRefreshing(false);
  }, []);

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#3906d2" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]" edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#3906d2" />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-4">
          <View className="flex-row items-center gap-3">
            <Logo size={32} color="#3906d2" />
            <View>
              <Text className="text-xs font-black text-slate-400 uppercase tracking-widest">
                {isCustomer ? 'Customer' : 'Cleaner'}
              </Text>
              <Text className="text-lg font-black text-slate-900 -mt-0.5">
                {profile.displayName?.split(' ')[0] || 'Welcome'}
              </Text>
            </View>
          </View>
          <TouchableOpacity className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-slate-100 shadow-sm">
            <Bell size={18} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {/* Active job banner */}
        {activeJob && (
          <TouchableOpacity
            onPress={() => router.push(`/tracking/${activeJob.id}`)}
            className="mx-5 mb-4 bg-accent rounded-3xl p-5 flex-row items-center gap-4 shadow-lg shadow-accent/30"
            activeOpacity={0.85}
          >
            <View className="w-12 h-12 bg-white/20 rounded-2xl items-center justify-center">
              <Zap size={24} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-black text-white/70 uppercase tracking-widest">
                Active Job
              </Text>
              <Text className="text-base font-black text-white mt-0.5">{activeJob.serviceType}</Text>
              <Text className="text-xs text-white/70 font-medium">{activeJob.location?.address}</Text>
            </View>
            <ChevronRight size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}

        {isCustomer ? (
          <CustomerHome
            currentLocation={currentLocation}
            recentJobs={recentJobs}
            hasActiveJob={!!activeJob}
          />
        ) : (
          <CleanerHome
            profile={profile}
            status={cleanerStatus}
            onToggleStatus={toggleCleanerStatus}
            availableJobs={availableJobs}
            recentJobs={recentJobs}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CustomerHome({
  currentLocation,
  recentJobs,
  hasActiveJob,
}: {
  currentLocation: { lat: number; lng: number } | null;
  recentJobs: Job[];
  hasActiveJob: boolean;
}) {
  const SERVICES = [
    { id: 'DEEP', label: 'Deep Clean', emoji: '🫧' },
    { id: 'STANDARD', label: 'Standard', emoji: '🧹' },
    { id: 'MOVE', label: 'Move In/Out', emoji: '📦' },
    { id: 'OFFICE', label: 'Office', emoji: '🏢' },
  ];

  return (
    <View className="pb-8">
      {!hasActiveJob && (
        <View className="mx-5 mb-6 bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm">
          <Text className="text-2xl font-black text-slate-900 leading-tight mb-2">
            Book a cleaner{'\n'}in minutes
          </Text>
          <Text className="text-sm text-slate-500 font-medium mb-5">
            Set your price — cleaners will bid for your job
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/booking/create')}
            activeOpacity={0.85}
            className="bg-accent py-4 rounded-2xl flex-row items-center justify-center gap-3 shadow-md shadow-accent/30"
          >
            <Plus size={18} color="#fff" />
            <Text className="text-white font-black text-sm uppercase tracking-widest">
              Post a Job
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text className="text-xs font-black text-slate-400 uppercase tracking-widest px-5 mb-3">
        Service Types
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        className="mb-6"
      >
        {SERVICES.map(({ id, label, emoji }) => (
          <TouchableOpacity
            key={id}
            onPress={() =>
              router.push({ pathname: '/booking/create', params: { serviceType: id } })
            }
            className="bg-white rounded-3xl px-5 py-4 items-center border border-slate-100 w-28"
            activeOpacity={0.8}
          >
            <Text className="text-3xl mb-2">{emoji}</Text>
            <Text className="text-xs font-black text-slate-700 text-center">{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View className="mx-5 mb-6 flex-row items-center gap-3 bg-white rounded-3xl p-4 border border-slate-100">
        <View className="w-10 h-10 bg-accent/10 rounded-2xl items-center justify-center">
          <MapPin size={18} color="#3906d2" />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-black text-slate-400 uppercase tracking-wider">
            Current Location
          </Text>
          <Text className="text-sm font-bold text-slate-800 mt-0.5" numberOfLines={1}>
            {currentLocation
              ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`
              : 'Fetching location…'}
          </Text>
        </View>
      </View>

      {recentJobs.length > 0 && (
        <View className="px-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Recent Jobs
            </Text>
            <TouchableOpacity onPress={() => router.push('/history')}>
              <Text className="text-xs font-black text-accent">View All</Text>
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

function CleanerHome({
  profile,
  status,
  onToggleStatus,
  availableJobs,
  recentJobs,
}: {
  profile: any;
  status: string;
  onToggleStatus: () => void;
  availableJobs: Job[];
  recentJobs: Job[];
}) {
  const isAvailable = status === 'AVAILABLE';

  return (
    <View className="pb-8">
      <View className="mx-5 mb-6 bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
              Your Status
            </Text>
            <View className="flex-row items-center gap-2">
              <View
                className={`w-2.5 h-2.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-slate-300'}`}
              />
              <Text className="text-lg font-black text-slate-900">
                {isAvailable ? 'Available' : 'Offline'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onToggleStatus}
            activeOpacity={0.8}
            className={`flex-row items-center gap-2 px-5 py-3 rounded-2xl ${
              isAvailable ? 'bg-slate-100' : 'bg-accent'
            }`}
          >
            <Power size={16} color={isAvailable ? '#64748b' : '#fff'} />
            <Text
              className={`text-xs font-black uppercase tracking-widest ${
                isAvailable ? 'text-slate-600' : 'text-white'
              }`}
            >
              {isAvailable ? 'Go Offline' : 'Go Online'}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row gap-3">
          {[
            { label: 'Jobs', value: profile.jobsCompleted ?? 0, icon: CheckCircle },
            { label: 'Rating', value: `${profile.ratingAverage?.toFixed(1) ?? '—'}★`, icon: Star },
            { label: 'Earned', value: `$${profile.balance?.toFixed(0) ?? 0}`, icon: DollarSign },
          ].map(({ label, value, icon: Icon }) => (
            <View key={label} className="flex-1 bg-slate-50 rounded-2xl p-3 items-center">
              <Icon size={16} color="#3906d2" />
              <Text className="text-base font-black text-slate-900 mt-1">{String(value)}</Text>
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {isAvailable && (
        <View className="px-5">
          <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            Available Jobs{availableJobs.length > 0 ? ` (${availableJobs.length})` : ''}
          </Text>
          {availableJobs.length === 0 ? (
            <View className="bg-white rounded-3xl p-8 items-center border border-slate-100">
              <Text className="text-3xl mb-3">🧹</Text>
              <Text className="text-sm font-black text-slate-700 text-center">
                No jobs available right now
              </Text>
              <Text className="text-xs text-slate-400 font-medium text-center mt-1">
                Stay online to be notified when jobs are posted nearby
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {availableJobs.map((job) => (
                <TouchableOpacity
                  key={job.id}
                  onPress={() =>
                    router.push({ pathname: '/booking/offers', params: { jobId: job.id } })
                  }
                  className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm"
                  activeOpacity={0.8}
                >
                  <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-1">
                      <Text className="text-base font-black text-slate-900">{job.serviceType}</Text>
                      <Text className="text-xs text-slate-500 font-medium mt-0.5" numberOfLines={1}>
                        {job.location?.address}
                      </Text>
                    </View>
                    <View className="bg-accent/10 px-3 py-1.5 rounded-xl">
                      <Text className="text-sm font-black text-accent">
                        ${job.customerBid ?? '—'}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-4">
                    <View className="flex-row items-center gap-1.5">
                      <MapPin size={12} color="#94a3b8" />
                      <Text className="text-xs text-slate-400 font-bold">2.3 km away</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <Clock size={12} color="#94a3b8" />
                      <Text className="text-xs text-slate-400 font-bold">2–3 hrs</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
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
    <View className="bg-white rounded-3xl p-5 border border-slate-100 flex-row items-center gap-4">
      <View className="w-12 h-12 bg-accent/10 rounded-2xl items-center justify-center">
        <Text className="text-xl">🧹</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-black text-slate-900">{job.serviceType}</Text>
        <Text className="text-xs text-slate-500 font-medium mt-0.5" numberOfLines={1}>
          {job.location?.address}
        </Text>
      </View>
      <View className={`px-3 py-1.5 rounded-xl ${colorClass}`}>
        <Text className="text-[10px] font-black uppercase tracking-wider">{job.status}</Text>
      </View>
    </View>
  );
}
