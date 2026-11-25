import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, SectionList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingList } from '../../components/LoadingList';
import { ArrowRight, CalendarDays, Clock3, RefreshCw } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../../services/supabase';
import { Job, WalletTransaction } from '../../types';
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

const pastStatuses = new Set(['COMPLETED', 'CANCELLED']);
const bookingDay = new Intl.DateTimeFormat('en', { day: 'numeric' });
const bookingMonth = new Intl.DateTimeFormat('en', { month: 'short' });

function openBooking(job: Job) {
  const scheduledRequest = job.status === 'PENDING' && job.bookingMode !== 'INSTANT';
  router.push(scheduledRequest
    ? { pathname: '/booking/offers', params: { jobId: job.id } }
    : { pathname: '/tracking/[jobId]', params: { jobId: job.id } });
}

function CustomerBookingCard({ job }: { job: Job }) {
  const past = pastStatuses.has(job.status);
  const status = job.status === 'PENDING' && job.bookingMode === 'INSTANT'
    ? { label: 'Finding a cleaner', tone: 'text-amber-800' }
    : STATUS[job.status] ?? { label: job.status.replaceAll('_', ' '), tone: 'text-slate-600' };
  const title = job.serviceType || (job.category === 'CAR' ? 'Vehicle cleaning' : 'Home cleaning');
  const timestamp = toMillis(job.scheduledDateTime) || toMillis(job.createdAt);
  const date = timestamp ? new Date(timestamp) : null;
  const mode = job.bookingMode === 'INSTANT' ? 'Instant' : 'Scheduled';
  const dateTone = past ? 'text-slate-500' : 'text-accent';
  const dotTone = {
    PENDING: 'bg-amber-500',
    CONFIRMED: 'bg-blue-500',
    ASSIGNED: 'bg-blue-500',
    EN_ROUTE: 'bg-emerald-500',
    IN_PROGRESS: 'bg-violet-500',
    COMPLETED: 'bg-emerald-500',
    CANCELLED: 'bg-slate-400',
  }[job.status] ?? 'bg-slate-400';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${status.label}, ${mode}${date ? `, ${formatDate(date)}` : ''}`}
      onPress={() => openBooking(job)}
      className={`mb-2.5 min-h-[74px] flex-row items-center rounded-3xl border border-ink/5 bg-white px-4 py-3 active:opacity-75 ${past ? '' : 'shadow-sm'}`}
    >
      <View className="w-12 items-center">
        <Text className={`text-2xl font-display font-black leading-7 ${dateTone}`}>{date ? bookingDay.format(date) : '—'}</Text>
        {date && <Text className={`font-sans-bold text-[10px] uppercase tracking-widest ${dateTone}`}>{bookingMonth.format(date)}</Text>}
      </View>
      <View className="ml-2 min-w-0 flex-1 border-l border-ink/10 pl-3">
        <Text numberOfLines={2} className={`font-display text-base font-black ${past ? 'text-ink/65' : 'text-ink'}`}>{title}</Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <View className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
          <Text className={`min-w-0 flex-1 font-sans text-xs ${status.tone}`}>{status.label} · {mode}</Text>
        </View>
      </View>
      <ArrowRight size={17} color={past ? '#9893AA' : '#3906D2'} />
    </Pressable>
  );
}

function CustomerBookings({ jobs }: { jobs: Job[] }) {
  const active = jobs.filter(job => !pastStatuses.has(job.status));
  const past = jobs.filter(job => pastStatuses.has(job.status));
  const waiting = active.filter(job => job.status === 'PENDING' && job.bookingMode !== 'INSTANT').length;
  const activeCount = active.length - waiting;
  const cancelled = past.filter(job => job.status === 'CANCELLED').length;
  const completed = past.length - cancelled;
  const counts = [
    { count: waiting, label: 'waiting for offers', tone: 'text-amber-800' },
    { count: activeCount, label: 'active', tone: 'text-accent' },
    { count: completed, label: 'completed', tone: 'text-emerald-700' },
    { count: cancelled, label: 'cancelled', tone: 'text-ink/55' },
  ].filter(item => item.count > 0);
  const sections = [{ title: 'Active', data: active }, { title: 'Past', data: past }]
    .filter(section => section.data.length > 0);

  return (
    <SectionList
      sections={sections}
      keyExtractor={job => job.id}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
      ListHeaderComponent={counts.length ? (
        <Text className="mb-7 px-1 font-sans text-sm text-ink/55">
          {counts.map(({ count, label, tone }, index) => (
            <Text key={label}>
              {index > 0 ? ' · ' : ''}<Text className={`font-sans-bold ${tone}`}>{count} {label}</Text>
            </Text>
          ))}
        </Text>
      ) : null}
      renderSectionHeader={({ section }) => (
        <Text accessibilityRole="header" className="mb-3 px-1 font-sans-bold text-sm text-ink/65">{section.title}</Text>
      )}
      renderSectionFooter={() => <View className="h-4" />}
      renderItem={({ item }) => <CustomerBookingCard job={item} />}
      ListEmptyComponent={(
        <View className="items-center px-8 py-16">
          <CalendarDays size={36} color="#3906D2" />
          <Text className="mt-4 font-display text-xl font-black text-ink">No bookings yet</Text>
          <Text className="mt-2 text-center font-sans text-sm text-ink/50">Your requests and completed services will show here.</Text>
        </View>
      )}
    />
  );
}

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    try { return value.toDate().getTime() || 0; } catch { return 0; }
  }
  return 0;
}

export default function ActivityScreen() {
  const { user, profile } = useAuth();
  const [customerJobs, setCustomerJobs] = useState<Job[]>([]);
  const [cleanerJobs, setCleanerJobs] = useState<Job[]>([]);
  const [cleanerTransactions, setCleanerTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const userId = user?.uid;

  useEffect(() => {
    if (!userId) { setCustomerJobs([]); setCleanerJobs([]); setLoading(false); return; }
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
    const customerQuery = query(collection(db, 'jobs'), where('customerId', '==', userId), orderBy('createdAt', 'desc'), limit(100));
    const cleanerQuery = query(collection(db, 'jobs'), where('cleanerId', '==', userId), orderBy('createdAt', 'desc'), limit(100));
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
  }, [userId, reloadKey]);

  useEffect(() => {
    if (!userId || profile?.role !== 'CLEANER') { setCleanerTransactions([]); return; }
    const transactionQuery = query(collection(db, 'transactions'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(transactionQuery, snapshot => {
      setCleanerTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WalletTransaction)));
    }, error => console.warn('[activity] could not load cleaner money activity:', error.message));
  }, [userId, profile?.role, reloadKey]);

  const jobs = useMemo(() => {
    const roleJobs = profile?.role === 'CLEANER' ? cleanerJobs : customerJobs;
    return [...roleJobs].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [customerJobs, cleanerJobs, profile?.role]);

  const cleanerActivityHeader = profile?.role === 'CLEANER' ? <View className="gap-3 mb-1">
    <View className="rounded-3xl bg-accent p-4"><Text className="font-display font-black text-white">Commission & earnings</Text><View className="mt-3 flex-row gap-2"><View className="flex-1 rounded-2xl bg-white/15 p-3"><Text className="font-sans text-[10px] font-bold uppercase text-white/70">Commission due</Text><Text className="mt-1 font-display text-lg font-black text-white">${Number(profile.commissionOwed ?? 0).toFixed(2)}</Text></View><View className="flex-1 rounded-2xl bg-white/15 p-3"><Text className="font-sans text-[10px] font-bold uppercase text-white/70">Prepaid credit</Text><Text className="mt-1 font-display text-lg font-black text-white">${Number(profile.commissionBalance ?? 0).toFixed(2)}</Text></View></View><Text className="mt-3 font-sans text-xs leading-5 text-white/75">Customers pay you directly. When the job is marked completed, Detail deducts 10% of the job value from your prepaid credit ($1 covers up to $10). Your Wallet shows recorded total earnings after commission for completed bookings.</Text></View>
    <View className="rounded-3xl border border-ink/5 bg-white p-4"><Text className="mb-2 font-display font-black text-ink">Wallet activity</Text>{cleanerTransactions.length === 0 ? <Text className="font-sans text-sm text-ink/50">No wallet transactions yet.</Text> : cleanerTransactions.slice(0, 5).map(transaction => <View key={transaction.id} className="flex-row items-center justify-between border-t border-ink/5 py-2.5"><View className="flex-1 pr-3"><Text className="font-sans-bold text-sm text-ink" numberOfLines={1}>{transaction.description || (transaction.balanceType === 'COMMISSION' ? 'Commission activity' : 'Wallet activity')}</Text><Text className="mt-0.5 font-sans text-[10px] text-ink/45">{formatDate(transaction.createdAt, 'Date unavailable')} · {(transaction.balanceType || 'GENERAL').toLowerCase()}</Text></View><Text className={`font-sans-bold text-sm ${transaction.type === 'CREDIT' ? 'text-emerald-700' : 'text-rose-700'}`}>{transaction.type === 'CREDIT' ? '+' : '-'}${Number(transaction.amount).toFixed(2)}</Text></View>)}</View>
    <Text className="px-1 font-display text-xs font-black uppercase tracking-widest text-ink/40">Job history</Text>
  </View> : null;

  return <SafeAreaView className="flex-1 bg-canvas">
    <View className="px-6 pb-3 pt-5">
      <Text accessibilityRole="header" className="font-display text-[32px] font-black text-ink">
        {profile?.role === 'CLEANER' ? 'Work & earnings' : 'Your bookings'}
      </Text>
      {profile?.role === 'CLEANER' && <Text className="mt-1 font-sans text-sm text-ink/50">Track completed jobs, commission and amounts due.</Text>}
    </View>
    {loading ? <LoadingList />
      : loadError ? <View className="flex-1 items-center justify-center px-8"><Text className="text-center font-sans text-ink/60 mb-5">{loadError}</Text><Pressable accessibilityRole="button" onPress={() => { setCustomerJobs([]); setCleanerJobs([]); setLoading(true); setLoadError(''); setReloadKey(key => key + 1); }} className="flex-row items-center gap-2 rounded-2xl bg-accent px-5 py-4"><RefreshCw size={17} color="white"/><Text className="font-display font-bold text-white">Retry</Text></Pressable></View>
      : profile?.role !== 'CLEANER' ? <CustomerBookings jobs={jobs} />
      : <FlatList data={jobs} keyExtractor={job => job.id} contentContainerClassName="px-5 pb-8 gap-3" ListHeaderComponent={cleanerActivityHeader} ListEmptyComponent={profile?.role === 'CLEANER' ? <Text className="py-5 text-center font-sans text-sm text-ink/50">No jobs in your activity yet.</Text> : null} renderItem={({ item: job }) => {
        const status = STATUS[job.status] ?? { label: job.status.replaceAll('_', ' '), tone: 'text-slate-600' };
        const when = job.scheduledDateTime ? formatDate(job.scheduledDateTime, 'Schedule pending') : formatDate(job.createdAt, 'Date unavailable');
        const gross = Number(job.earnings?.gross ?? job.price ?? 0);
        const commission = Number(job.earnings?.commission ?? 0);
        const net = Number(job.earnings?.net ?? Math.max(0, gross - commission));
        return <Pressable accessibilityRole="button" accessibilityLabel={`${job.category === 'CAR' ? 'Vehicle' : 'Home'} cleaning, ${status.label}, open booking`} onPress={() => openBooking(job)} className="rounded-3xl border border-ink/5 bg-white p-4 shadow-sm">
          <View className="flex-row items-start justify-between gap-3"><View className="flex-1"><Text className="font-display text-lg font-black text-ink">{job.serviceType || `${job.category === 'CAR' ? 'Vehicle' : 'Home'} cleaning`}</Text><Text className={`mt-1 font-sans text-sm font-bold ${status.tone}`}>{status.label}</Text></View><ArrowRight size={19} color="#3906d2"/></View>
          <View className="mt-4 flex-row items-center gap-2"><Clock3 size={15} color="#77718b"/><Text className="font-sans text-xs text-ink/55">{when}</Text><Text className="font-sans text-xs text-ink/30">·</Text><Text className="font-sans text-xs text-ink/55">{job.bookingMode === 'INSTANT' ? 'Instant request' : 'Scheduled'}</Text></View>
          {profile?.role === 'CLEANER' && job.status === 'COMPLETED' && gross > 0 && <View className="mt-3 rounded-2xl bg-violet-50 p-3"><View className="flex-row justify-between"><Text className="font-sans text-xs text-violet-900">Job amount</Text><Text className="font-sans-bold text-xs text-violet-950">${gross.toFixed(2)}</Text></View><View className="mt-1 flex-row justify-between"><Text className="font-sans text-xs text-violet-900">Detail commission</Text><Text className="font-sans-bold text-xs text-violet-950">-${commission.toFixed(2)}</Text></View><View className="mt-1 flex-row justify-between border-t border-violet-200 pt-1"><Text className="font-sans-bold text-xs text-violet-900">After commission</Text><Text className="font-sans-bold text-xs text-violet-950">${net.toFixed(2)}</Text></View><Text className="mt-2 font-sans text-[10px] leading-4 text-violet-700">This is the recorded job amount after Detail’s fee. Direct customer payments are settled outside Detail.</Text></View>}
        </Pressable>;
      }} />}
  </SafeAreaView>;
}
