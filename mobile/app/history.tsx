import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, MapPin, Flag, X } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from '../services/supabase';
import { callFunction } from '../services/functions';
import { Job, JobStatus } from '../types';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  COMPLETED: { label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-50' },
  IN_PROGRESS: { label: 'In Progress', color: 'text-blue-700', bg: 'bg-blue-50' },
};

export default function HistoryScreen() {
  const { user, profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reportingJob, setReportingJob] = useState<Job | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const submitReport = async () => {
    if (!reportingJob || !reportReason.trim()) {
      Alert.alert('Tell us what happened', 'Please describe the issue before submitting.');
      return;
    }
    setIsSubmittingReport(true);
    try {
      await callFunction('reportJobIssue', { jobId: reportingJob.id, reason: reportReason.trim() });
      setReportingJob(null);
      setReportReason('');
      Alert.alert('Report submitted', "We'll review this and follow up with you.");
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not submit your report. Please try again.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

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
        <Text className="text-xl font-display font-black text-slate-900">Service History</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3906d2" size="large" />
        </View>
      ) : jobs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-sans text-4xl mb-4">📋</Text>
          <Text className="text-lg font-display font-black text-slate-700 text-center">No history yet</Text>
          <Text className="font-sans text-sm text-slate-400 font-medium text-center mt-2">
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
                    <Text className="text-base font-display font-black text-slate-900">{job.serviceType}</Text>
                    <Text className="font-sans text-xs text-slate-400 font-medium mt-0.5">
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
                    <Text className="font-sans text-xs text-slate-500 font-medium flex-1" numberOfLines={1}>
                      {job.location?.address ?? 'Unknown location'}
                    </Text>
                  </View>
                  {job.price != null && (
                    <View className="flex-row items-center gap-2">
                      <Text className="font-sans text-xs text-slate-400 font-medium">Price:</Text>
                      <Text className="text-xs font-display font-black text-slate-900">${job.price}</Text>
                    </View>
                  )}
                </View>

                {/* Cleaner or Customer info */}
                {profile?.role === 'CUSTOMER' && job.cleanerName && (
                  <View className="flex-row items-center gap-2 mt-4 pt-4 border-t border-slate-50">
                    <View className="w-8 h-8 bg-accent/10 rounded-xl items-center justify-center">
                      <Text className="font-sans text-sm">🧹</Text>
                    </View>
                    <Text className="font-sans text-xs font-bold text-slate-700 flex-1">
                      {job.cleanerName}
                    </Text>
                  </View>
                )}

                {profile?.role === 'CUSTOMER' && job.status === JobStatus.COMPLETED && (
                  <TouchableOpacity
                    onPress={() => setReportingJob(job)}
                    activeOpacity={0.8}
                    className="flex-row items-center justify-center gap-2 mt-4 pt-4 border-t border-slate-50"
                  >
                    <Flag size={13} color="#ef4444" />
                    <Text className="text-xs font-display font-black text-red-500 uppercase tracking-wider">
                      Report an Issue
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Report an issue modal */}
      <Modal visible={!!reportingJob} transparent animationType="slide">
        <View className="flex-1 justify-end">
          <TouchableOpacity className="flex-1 bg-black/50" onPress={() => setReportingJob(null)} />
          <View className="bg-white rounded-t-[32px] p-6 pb-10">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-xl font-display font-black text-slate-900">Report an Issue</Text>
              <TouchableOpacity onPress={() => setReportingJob(null)}>
                <X size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <Text className="font-sans text-xs text-slate-400 font-medium mb-6">
              {reportingJob?.serviceType} · #{reportingJob?.id.slice(-6).toUpperCase()}
            </Text>

            <Text className="text-xs font-display font-black text-slate-500 uppercase tracking-widest mb-2">
              What went wrong?
            </Text>
            <TextInput
              className="font-sans border-2 border-slate-100 rounded-2xl px-4 py-4 text-sm font-medium text-slate-900 bg-slate-50 mb-6"
              placeholder="Describe the issue with this job…"
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={reportReason}
              onChangeText={setReportReason}
              autoFocus
            />

            <TouchableOpacity
              onPress={submitReport}
              disabled={isSubmittingReport || !reportReason.trim()}
              className="bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
              activeOpacity={0.85}
            >
              {isSubmittingReport ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-display font-black text-sm uppercase tracking-widest">
                  Submit Report
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
