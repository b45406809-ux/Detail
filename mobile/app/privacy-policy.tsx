import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body: 'We collect information you provide directly to us, such as your name, phone number, email address, and location when you register or use our services. We also collect usage data, device information, and location data when the app is in use.',
  },
  {
    title: '2. How We Use Your Information',
    body: 'We use your information to match you with cleaning professionals, process payments, send notifications about your bookings, improve our services, and ensure platform safety.',
  },
  {
    title: '3. Location Data',
    body: 'Location data is used to match you with nearby cleaners and to track active jobs in real time. Location is only tracked during active cleaning sessions and with your explicit consent.',
  },
  {
    title: '4. Sharing of Information',
    body: 'We share your information with cleaners you book, payment processors, and service providers that help us operate the platform. If you register as a cleaner, you may choose to complete identity verification through Didit. Didit collects and processes the identity information, document images, and any selfie or liveness data required by the verification workflow under its own privacy terms. Detail receives the verification decision and session status; identity documents are submitted directly to Didit and are not stored by Detail. We do not sell your personal data.',
  },
  {
    title: '5. Data Security',
    body: 'We implement industry-standard security measures to protect your data. However, no method of transmission over the Internet is 100% secure.',
  },
  {
    title: '6. Your Rights',
    body: 'You have the right to access, update, or delete your account information. Contact us at privacy@detail to exercise these rights.',
  },
  {
    title: '7. Contact',
    body: 'If you have any questions about this Privacy Policy, please contact us at privacy@detail.',
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4 border-b border-slate-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center"
        >
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-display font-black text-slate-900">Privacy Policy</Text>
      </View>

      <ScrollView contentContainerClassName="px-5 pt-6 pb-16" showsVerticalScrollIndicator={false}>
        <Text className="font-sans text-xs text-slate-400 font-medium mb-6">
          Last updated: January 2025
        </Text>
        {SECTIONS.map(({ title, body }) => (
          <View key={title} className="mb-6">
            <Text className="text-base font-display font-black text-slate-900 mb-2">{title}</Text>
            <Text className="font-sans text-sm text-slate-600 font-medium leading-relaxed">{body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
