import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle, ArrowRight } from 'lucide-react-native';
import { db, doc, onSnapshot } from '../../services/supabase';
import { Job } from '../../types';

export default function BookingConfirmationScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [job,setJob]=useState<Job|null>(null);
  useEffect(()=>{if(!jobId)return;return onSnapshot(doc(db,'jobs',jobId),(snapshot)=>{if(snapshot.exists())setJob({id:snapshot.id,...snapshot.data()} as Job);});},[jobId]);
  const bookingConfirmed=job?.status==='ASSIGNED'||job?.status==='EN_ROUTE'||job?.status==='IN_PROGRESS';

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-24 h-24 bg-emerald-50 rounded-4xl items-center justify-center mb-6">
          <CheckCircle size={48} color="#10b981" />
        </View>
          <Text className="text-3xl font-display font-black text-slate-900 text-center mb-2">
          {!job?'Booking accepted':bookingConfirmed?'Booking confirmed':'Booking Confirmed!'}
        </Text>
        <Text className="font-sans text-base text-slate-500 font-medium text-center mb-10">
          {!job?'Your cleaner is selected. We are checking your booking.':'Arrange payment directly with your cleaner using a method you both agree on. Detail does not collect the booking payment. You can follow booking updates and message your cleaner here.'}
        </Text>

        <TouchableOpacity
          onPress={() => router.replace({ pathname: '/tracking/[jobId]', params: { jobId: jobId! } })}
          className="w-full bg-accent py-5 rounded-[32px] flex-row items-center justify-center gap-3 shadow-lg shadow-accent/30 mb-4"
          activeOpacity={0.85}
        >
          <Text className="text-white font-display font-black text-sm uppercase tracking-widest">
            View booking status
          </Text>
          <ArrowRight size={18} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace('/home')}
          className="w-full bg-slate-50 border border-slate-100 py-5 rounded-[32px] items-center"
          activeOpacity={0.85}
        >
          <Text className="text-slate-600 font-display font-black text-sm uppercase tracking-widest">
            Back to Home
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
