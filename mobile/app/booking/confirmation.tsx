import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle, MapPin, Clock, ArrowRight } from 'lucide-react-native';

export default function BookingConfirmationScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-24 h-24 bg-emerald-50 rounded-4xl items-center justify-center mb-6">
          <CheckCircle size={48} color="#10b981" />
        </View>
        <Text className="text-3xl font-black text-slate-900 text-center mb-2">
          Booking Confirmed!
        </Text>
        <Text className="text-base text-slate-500 font-medium text-center mb-10">
          Your cleaner is on the way. You'll receive real-time updates.
        </Text>

        <TouchableOpacity
          onPress={() => router.replace({ pathname: '/tracking/[jobId]', params: { jobId: jobId! } })}
          className="w-full bg-accent py-5 rounded-[32px] flex-row items-center justify-center gap-3 shadow-lg shadow-accent/30 mb-4"
          activeOpacity={0.85}
        >
          <Text className="text-white font-black text-sm uppercase tracking-widest">
            Track Your Cleaner
          </Text>
          <ArrowRight size={18} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace('/home')}
          className="w-full bg-slate-50 border border-slate-100 py-5 rounded-[32px] items-center"
          activeOpacity={0.85}
        >
          <Text className="text-slate-600 font-black text-sm uppercase tracking-widest">
            Back to Home
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
