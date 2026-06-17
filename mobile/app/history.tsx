import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, MapPin, Clock, Star } from 'lucide-react-native';
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

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  COMPLETED: { label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-50' },
  IN_PROGRESS: { label: 'In Progress', color: 'text-blue-700', bg: 'bg-blue-50' },
};

export default function HistoryScreen() {
  const { user, profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const field = profile?.role === 'CUSTOMER' ? 'customerId' : 'cleanerId';
    const q = query(
      collection(db, 'jobs'),
      where(field, '==', user.uid),
      where('status', 'in', [JobStatus.COMPLETED, JobStatus.CANCELLED]),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    return onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job)));
      setIsLoading(false);
    });
  }, [user, profile]);

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-slate-100"
        >
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-slate-900">Service History</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3906d2" size="large" />
        </View>
      ) : jobs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-4xl mb-4">📋</Text>
          <Text className="text-lg font-black text-slate-700 text-center">No history yet</Text>
          <Text className="text-sm text-slate-400 font-medium text-center mt-2">
            Your completed and cancelled jobs will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          contentContainerClassName="px-5 pb-10 gap-3"
          showsVerticalScrollIndicator={false}
          renderItem={({ item: job }) => {
            const status = STATUS_LABELS[job.status] ?? {
              label: job.status,
              color: 'text-slate-600',
              bg: 'bg-slate-50',
            };
            return (
              <View className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                {/* Top row */}
                <View className="flex-row items-start justify-between mb-3">
                  <View className="flex-1">
                    <Text className="text-base font-black text-slate-900">{job.serviceType}</Text>
                    <Text className="text-xs text-slate-400 font-medium mt-0.5">
                      #{job.id.slice(-6).toUpperCase()}
                    </Text>
                  </View>
                  <View className={`px-3 py-1.5 rounded-xl ${status.bg}`}>
                    <Text className={`text-[10px] font-black uppercase tracking-wider ${status.color}`}>
                      {status.label}
                    </Text>
                  </View>
                </View>

                {/* Details */}
                <View className="gap-2">
                  <View className="flex-row items-center gap-2">
                    <MapPin size={12} color="#94a3b8" />
                    <Text className="text-xs text-slate-500 font-medium flex-1" numberOfLines={1}>
                      {job.location?.address ?? 'Unknown location'}
                    </Text>
                  </View>
                  {job.price != null && (
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xs text-slate-400 font-medium">Price:</Text>
                      <Text className="text-xs font-black text-slate-900">${job.price}</Text>
                    </View>
                  )}
                </View>

                {/* Cleaner or Customer info */}
                {profile?.role === 'CUSTOMER' && job.cleanerName && (
                  <View className="flex-row items-center gap-2 mt-4 pt-4 border-t border-slate-50">
                    <View className="w-8 h-8 bg-accent/10 rounded-xl items-center justify-center">
                      <Text className="text-sm">🧹</Text>
                    </View>
                    <Text className="text-xs font-bold text-slate-700 flex-1">
                      {job.cleanerName}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
