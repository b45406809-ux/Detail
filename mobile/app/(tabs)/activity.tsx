import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingList } from '../../components/LoadingList';
import { ArrowRight, CalendarDays, Clock3, RefreshCw } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../../services/supabase';
import { Job } from '../../types';
import { formatDate } from '../../utils/date';

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Waiting for offers', tone: 'text-amber-700' },
  CONFIRMED: { label: 'Confirmed', tone: 'text-blue-700' },
  ASSIGNED: { label: 'Cleaner assigned', tone: 'text-blue-700' },
  EN_ROUTE: { label: 'Cleaner on the way', tone: 'text-emerald-700' },
  IN_PROGRESS: { label: 'In progress', tone: 'text-violet-700' },
  COMPLETED: { label: 'Completed', tone: 'text-emerald-700' },
  CANCELLED: { label: 'Cancelled', tone: 'text-slate-500' },
};

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    try { return value.toDate().getTime() || 0; } catch { return 0; }
  }
  return 0;
}

export default function ActivityScreen() {
  const { user } = useAuth();
  const [customerJobs, setCustomerJobs] = useState<Job[]>([]);
  const [cleanerJobs, setCleanerJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) { setCustomerJobs([]); setCleanerJobs([]); setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    let customerLoaded = false;
    let cleanerLoaded = false;
    const updateLoading = () => { if (customerLoaded && cleanerLoaded) setLoading(false); };
    const onError = (error: Error) => {
      console.error('Could not load booking activity:', error);
      setLoadError('We could not load your bookings. Check your connection and try again.');
      setLoading(false);
    };
    const customerQuery = query(collection(db, 'jobs'), where('customerId', '==', user.uid), orderBy('createdAt', 'desc'), limit(100));
    const cleanerQuery = query(collection(db, 'jobs'), where('cleanerId', '==', user.uid), orderBy('createdAt', 'desc'), limit(100));
    const stopCustomer = onSnapshot(customerQuery, snapshot => {
      setCustomerJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
      customerLoaded = true;
      updateLoading();
    }, onError);
    const stopCleaner = onSnapshot(cleanerQuery, snapshot => {
      setCleanerJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
      cleanerLoaded = true;
      updateLoading();
    }, onError);
    return () => { stopCustomer(); stopCleaner(); };
  }, [user, reloadKey]);

  const jobs = useMemo(() => {
    const unique = new Map<string, Job>();
    [...customerJobs, ...cleanerJobs].forEach(job => unique.set(job.id, job));
    return [...unique.values()].sort((a, b) => {
      return toMillis(b.createdAt) - toMillis(a.createdAt);
    });
  }, [customerJobs, cleanerJobs]);

  return <SafeAreaView className="flex-1 bg-[#F2F1F5]">
    <View className="px-5 pt-5 pb-4"><Text className="text-2xl font-display font-black text-ink">Your bookings</Text><Text className="mt-1 font-sans text-sm text-ink/50">Pending, active and completed services in one place.</Text></View>
    {loading ? <LoadingList />
      : loadError ? <View className="flex-1 items-center justify-center px-8"><Text className="text-center font-sans text-ink/60 mb-5">{loadError}</Text><Pressable accessibilityRole="button" onPress={() => { setCustomerJobs([]); setCleanerJobs([]); setLoading(true); setLoadError(''); setReloadKey(key => key + 1); }} className="flex-row items-center gap-2 rounded-2xl bg-accent px-5 py-4"><RefreshCw size={17} color="white"/><Text className="font-display font-bold text-white">Retry</Text></Pressable></View>
      : jobs.length === 0 ? <View className="flex-1 items-center justify-center px-8"><CalendarDays size={36} color="#3906d2"/><Text className="mt-4 text-xl font-display font-black text-ink">No bookings yet</Text><Text className="mt-2 text-center font-sans text-sm text-ink/50">Your requests and completed services will show here.</Text></View>
      : <FlatList data={jobs} keyExtractor={job => job.id} contentContainerClassName="px-5 pb-8 gap-3" renderItem={({ item: job }) => {
        const status = STATUS[job.status] ?? { label: job.status.replaceAll('_', ' '), tone: 'text-slate-600' };
        const isScheduledRequest = job.status === 'PENDING' && job.bookingMode !== 'INSTANT';
        const when = job.scheduledDateTime ? formatDate(job.scheduledDateTime, 'Schedule pending') : formatDate(job.createdAt, 'Date unavailable');
        return <Pressable accessibilityRole="button" accessibilityLabel={`${job.category === 'CAR' ? 'Vehicle' : 'Home'} cleaning, ${status.label}, open booking`} onPress={() => router.push(isScheduledRequest ? { pathname: '/booking/offers', params: { jobId: job.id } } : { pathname: '/tracking/[jobId]', params: { jobId: job.id } })} className="rounded-3xl border border-ink/5 bg-white p-4 shadow-sm">
          <View className="flex-row items-start justify-between gap-3"><View className="flex-1"><Text className="font-display text-lg font-black text-ink">{job.serviceType || `${job.category === 'CAR' ? 'Vehicle' : 'Home'} cleaning`}</Text><Text className={`mt-1 font-sans text-sm font-bold ${status.tone}`}>{status.label}</Text></View><ArrowRight size={19} color="#3906d2"/></View>
          <View className="mt-4 flex-row items-center gap-2"><Clock3 size={15} color="#77718b"/><Text className="font-sans text-xs text-ink/55">{when}</Text><Text className="font-sans text-xs text-ink/30">·</Text><Text className="font-sans text-xs text-ink/55">{job.bookingMode === 'INSTANT' ? 'Instant request' : 'Scheduled'}</Text></View>
          {job.paymentStatus && <Text className="mt-2 font-sans text-xs text-ink/45">Payment: {job.paymentStatus.replaceAll('_', ' ').toLowerCase()}</Text>}
        </Pressable>;
      }} />}
  </SafeAreaView>;
}
