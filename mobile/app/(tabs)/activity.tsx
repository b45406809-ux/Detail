import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CalendarDays, ChevronRight, Clock3, History, MapPin, RefreshCw } from 'lucide-react-native';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { Job } from '../../types';

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'];
const STATUS_STYLE: Record<string, { label: string; color: string; background: string }> = {
  PENDING: { label: 'Waiting for quotes', color: '#92400e', background: '#fef3c7' },
  CONFIRMED: { label: 'Confirmed', color: '#5b21b6', background: '#ede9fe' },
  ASSIGNED: { label: 'Cleaner assigned', color: '#1d4ed8', background: '#dbeafe' },
  EN_ROUTE: { label: 'Cleaner on the way', color: '#1d4ed8', background: '#dbeafe' },
  IN_PROGRESS: { label: 'In progress', color: '#047857', background: '#d1fae5' },
};

export default function ActivityScreen() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!user) { setJobs([]); setIsLoading(false); return; }
    setHasError(false);
    setIsLoading(true);
    let customerJobs: Job[] = [];
    let cleanerJobs: Job[] = [];
    let loaded = 0;
    const publish = () => {
      const unique = new Map<string, Job>();
      [...customerJobs, ...cleanerJobs].forEach((job) => unique.set(job.id, job));
      setJobs([...unique.values()].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)));
      loaded += 1;
      if (loaded >= 2) setIsLoading(false);
    };
    const onError = () => { setHasError(true); setIsLoading(false); };
    const customerQuery = query(collection(db, 'jobs'), where('customerId', '==', user.uid), where('status', 'in', ACTIVE_STATUSES), orderBy('createdAt', 'desc'), limit(100));
    const cleanerQuery = query(collection(db, 'jobs'), where('cleanerId', '==', user.uid), where('status', 'in', ACTIVE_STATUSES), orderBy('createdAt', 'desc'), limit(100));
    const stopCustomer = onSnapshot(customerQuery, (snapshot) => {
      customerJobs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Job));
      publish();
    }, onError);
    const stopCleaner = onSnapshot(cleanerQuery, (snapshot) => {
      cleanerJobs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Job));
      publish();
    }, onError);
    return () => { stopCustomer(); stopCleaner(); };
  }, [user]);

  const openJob = (job: Job) => {
    if (job.customerId === user?.uid && job.status === 'PENDING') {
      router.push({ pathname: '/booking/offers', params: { jobId: job.id } });
    } else {
      router.push({ pathname: '/tracking/[jobId]', params: { jobId: job.id } });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F4F2FA]">
      <View className="flex-row items-center justify-between px-5 pt-5 pb-4">
        <View>
          <Text className="font-display text-2xl font-black text-ink">Activity</Text>
          <Text className="mt-1 font-sans text-sm text-ink/50">Your pending and upcoming bookings</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open service history" onPress={() => router.push('/history')} className="h-11 w-11 items-center justify-center rounded-2xl bg-white">
          <History size={19} color="#3906D2" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#3906D2" size="large" /></View>
      ) : hasError && jobs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-7">
          <RefreshCw size={28} color="#3906D2" />
          <Text className="mt-4 text-center font-display text-lg font-black text-ink">Could not load activity</Text>
          <Text className="mt-2 text-center font-sans text-sm text-ink/55">Check your connection and try again.</Text>
        </View>
      ) : jobs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-7">
          <CalendarDays size={30} color="#9B93C9" />
          <Text className="mt-4 text-center font-display text-lg font-black text-ink">No active bookings</Text>
          <Text className="mt-2 text-center font-sans text-sm text-ink/55">New quotes, scheduled visits, and active jobs will show up here.</Text>
          <TouchableOpacity onPress={() => router.push('/booking/create')} className="mt-5 rounded-2xl bg-accent px-5 py-3">
            <Text className="font-display text-sm font-black text-white">Book a cleaning</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(job) => job.id}
          contentContainerClassName="gap-3 px-5 pb-28"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={hasError ? <Text className="mb-1 rounded-2xl bg-amber-50 px-4 py-3 font-sans text-xs text-amber-800">Some bookings could not be refreshed. Check your connection.</Text> : null}
          renderItem={({ item: job }) => {
            const style = STATUS_STYLE[job.status] ?? STATUS_STYLE.PENDING;
            const isCustomer = job.customerId === user?.uid;
            const schedule = job.scheduledDateTime ? new Date(job.scheduledDateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : job.timePreference === 'ASAP' ? 'As soon as possible' : job.timePreference ?? 'Time to be confirmed';
            return (
              <TouchableOpacity onPress={() => openJob(job)} activeOpacity={0.82} className="rounded-3xl border border-ink/5 bg-white p-5">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text numberOfLines={1} className="font-display text-base font-black text-ink">{job.serviceType || 'Cleaning service'}</Text>
                    <Text className="mt-1 font-sans text-xs text-ink/40">#{job.id.slice(-6).toUpperCase()} · {isCustomer ? 'Customer booking' : 'Cleaner assignment'}</Text>
                  </View>
                  <View style={{ backgroundColor: style.background }} className="rounded-xl px-2.5 py-1.5">
                    <Text style={{ color: style.color }} className="font-display text-[10px] font-black">{style.label}</Text>
                  </View>
                </View>
                <View className="mt-4 gap-2 border-t border-ink/5 pt-3">
                  <View className="flex-row items-center gap-2"><Clock3 size={14} color="#766d9c" /><Text numberOfLines={1} className="flex-1 font-sans text-xs text-ink/60">{schedule}</Text></View>
                  <View className="flex-row items-center gap-2"><MapPin size={14} color="#766d9c" /><Text numberOfLines={1} className="flex-1 font-sans text-xs text-ink/60">{job.location?.address || 'Location shared with booking participants'}</Text></View>
                </View>
                <View className="mt-4 flex-row items-center justify-end gap-1"><Text className="font-display text-xs font-black text-accent">Open booking</Text><ChevronRight size={15} color="#3906D2" /></View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
