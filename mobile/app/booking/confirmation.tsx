import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle, ArrowRight } from 'lucide-react-native';
import { db, doc, onSnapshot } from '../../services/supabase';
import { callFunction } from '../../services/functions';
import { Job } from '../../types';

export default function BookingConfirmationScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [job,setJob]=useState<Job|null>(null);const [refreshing,setRefreshing]=useState(false);
  useEffect(()=>{if(!jobId)return;return onSnapshot(doc(db,'jobs',jobId),(snapshot)=>{if(snapshot.exists())setJob({id:snapshot.id,...snapshot.data()} as Job);});},[jobId]);
  const isPaynow=job?.paymentMethod==='PAYNOW';
  const isFunded=['ESCROWED','DELIVERED','PAID'].includes(String(job?.paymentStatus??''));
  const refreshPayment=async()=>{setRefreshing(true);try{const result=await callFunction<{jobId:string},{success:boolean;status:string}>('refreshPaynowBookingPayment',{jobId});Alert.alert('Paynow status',`Current status: ${result.status.replaceAll('_',' ')}.`);}catch(error:any){Alert.alert('Status not updated',error.message||'Paynow is still processing this payment.');}finally{setRefreshing(false);}};

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-24 h-24 bg-emerald-50 rounded-4xl items-center justify-center mb-6">
          <CheckCircle size={48} color="#10b981" />
        </View>
          <Text className="text-3xl font-display font-black text-slate-900 text-center mb-2">
          {!job?'Booking accepted':isPaynow&&!isFunded?'Booking accepted':isPaynow?'Payment protected':'Booking Confirmed!'}
        </Text>
        <Text className="font-sans text-base text-slate-500 font-medium text-center mb-10">
          {!job?'Your cleaner is selected. We are checking your booking and payment status.':isPaynow&&!isFunded?'Your cleaner is selected, but Paynow has not confirmed the payment yet. Open the payment status to complete or retry secure checkout.':isPaynow?'Paynow BuySafe is holding your payment. After the cleaning, confirm delivery in Paynow; Detail will keep you updated here.':'Your cleaner is selected. You can follow booking updates and message them in Detail.'}
        </Text>

        {isPaynow&&<View className="w-full rounded-3xl border border-violet-100 bg-[#F7F4FF] p-4 mb-5"><View className="flex-row items-center gap-3"><View className="h-11 w-11 items-center justify-center rounded-2xl bg-accent"><Text className="font-display text-lg font-black text-white">P</Text></View><View className="flex-1"><Text className="font-display font-black text-ink">Paynow BuySafe</Text><Text className="font-sans text-xs text-ink/55">{String(job?.paymentStatus??'PENDING').replaceAll('_',' ')}</Text></View>{!isFunded&&<TouchableOpacity disabled={refreshing} onPress={()=>void refreshPayment()} className="rounded-xl bg-white px-3 py-2">{refreshing?<ActivityIndicator color="#3906D2" size="small"/>:<Text className="font-sans text-xs font-bold text-accent">Refresh</Text>}</TouchableOpacity>}</View></View>}

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
