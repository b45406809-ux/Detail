import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, CheckCircle } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';

const TERMS = [
  {
    title: '1. Independent Contractor Status',
    body: 'You are an independent contractor, not an employee of Detail. You are responsible for your own taxes, insurance, and equipment.',
  },
  {
    title: '2. Commission Structure',
    body: 'Detail charges a 15% commission on all jobs completed through the platform for the first 10 jobs. After 10 jobs, the commission is reduced to 10%.',
  },
  {
    title: '3. Code of Conduct',
    body: 'You agree to maintain professionalism, punctuality, and high-quality service. Discrimination, harassment, or fraud will result in immediate account termination.',
  },
  {
    title: '4. Payment Terms',
    body: 'Payment is released to your wallet after job completion and customer confirmation. Withdrawals are processed within 2–3 business days.',
  },
  {
    title: '5. Verification Requirements',
    body: 'You must provide valid government-issued ID and pass a background check to achieve Level 2 verification and accept higher-value jobs.',
  },
  {
    title: '6. Insurance',
    body: 'Detail provides limited liability coverage for jobs booked through the platform. You are encouraged to carry your own professional liability insurance.',
  },
];

export default function CleanerAgreementScreen() {
  const { updateProfile } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await updateProfile({ hasAgreedToTerms: true });
      setAccepted(true);
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4 border-b border-slate-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center"
        >
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-slate-900">Cleaner Agreement</Text>
      </View>

      {accepted ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 bg-emerald-50 rounded-3xl items-center justify-center mb-4">
            <CheckCircle size={40} color="#10b981" />
          </View>
          <Text className="text-2xl font-black text-slate-900 text-center mb-2">
            Agreement Accepted
          </Text>
          <Text className="text-sm text-slate-500 font-medium text-center mb-8">
            You're now a verified Detail cleaner. Start accepting jobs!
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(app)')}
            className="w-full bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
            activeOpacity={0.85}
          >
            <Text className="text-white font-black text-sm uppercase tracking-widest">
              Start Earning
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerClassName="px-5 pt-6 pb-6"
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-xs text-slate-400 font-medium mb-6">
              Please read all terms before accepting
            </Text>
            {TERMS.map(({ title, body }) => (
              <View key={title} className="mb-6">
                <Text className="text-base font-black text-slate-900 mb-2">{title}</Text>
                <Text className="text-sm text-slate-600 font-medium leading-relaxed">{body}</Text>
              </View>
            ))}
          </ScrollView>

          <View className="px-5 pb-8 pt-4 border-t border-slate-100">
            <TouchableOpacity
              onPress={handleAccept}
              disabled={isAccepting}
              activeOpacity={0.85}
              className="bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
            >
              {isAccepting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-black text-sm uppercase tracking-widest">
                  Accept Agreement
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
