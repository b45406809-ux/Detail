import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageCircle,
} from 'lucide-react-native';
import { IS_MOCK } from '../utils/env';

const SUPPORT_EMAIL = IS_MOCK ? 'dev-support@detail.app' : 'support@detail.app';

const FAQS = [
  {
    q: "How does Detail's bidding system work?",
    a: "You post a job with your preferred price, then cleaners in your area place bids. You review each cleaner's profile, rating, and their bid, and accept the one that fits best.",
  },
  {
    q: 'How are cleaners vetted?',
    a: 'All cleaners go through identity verification, background checks, and must agree to our Cleaner Agreement before taking jobs.',
  },
  {
    q: 'What if I need to cancel a job?',
    a: 'You can cancel a job from the Offers screen (while waiting for bids) or from the Tracking screen before the cleaner arrives. Late cancellations may incur a fee.',
  },
  {
    q: 'How does payment work?',
    a: 'New bookings are paid through Paynow BuySafe. Paynow holds the payment while the service is underway. After cleaning, confirm delivery in your Paynow account; Paynow releases funds to Detail after its 24-hour dispute window. Detail then credits the cleaner’s 90% share to their in-app balance. Existing Detail Wallet balances and permitted cash bookings may also be used.',
  },
  {
    q: 'How do I become a cleaner on Detail?',
    a: 'Sign up with the Cleaner role during registration, complete your profile, and agree to the Cleaner Agreement. Once approved you can start accepting jobs.',
  },
  {
    q: 'I have a dispute — what do I do?',
    a: 'Contact support immediately via email or in-app chat. Keep any photos of the job for reference. We aim to resolve disputes within 24 hours.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
      className="bg-white rounded-3xl px-5 py-4 border border-slate-100"
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm font-display font-black text-slate-900 leading-snug">{q}</Text>
        {expanded ? (
          <ChevronUp size={18} color="#94a3b8" />
        ) : (
          <ChevronDown size={18} color="#94a3b8" />
        )}
      </View>
      {expanded && (
        <Text className="font-sans text-sm text-slate-500 font-medium leading-relaxed mt-3">{a}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function HelpScreen() {
  const openEmail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Detail App Support`).catch(() =>
      Alert.alert('Could not open mail app', `Email us at ${SUPPORT_EMAIL}`)
    );
  };

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
        <View className="flex-1">
          <Text className="text-xl font-display font-black text-slate-900">Help & Support</Text>
          <Text className="font-sans text-xs text-slate-400 font-medium">FAQs and contact options</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Contact cards */}
        <View className="flex-row gap-3 mx-5 mb-6">
          <TouchableOpacity
            onPress={openEmail}
            className="flex-1 bg-white rounded-3xl p-4 items-center gap-2 border border-slate-100"
            activeOpacity={0.8}
          >
            <View className="w-12 h-12 bg-accent/10 rounded-2xl items-center justify-center">
              <Mail size={22} color="#3906d2" />
            </View>
            <Text className="text-xs font-display font-black text-slate-900 uppercase tracking-wider">
              Email Us
            </Text>
            <Text className="font-sans text-[10px] text-slate-400 font-medium text-center">
              {SUPPORT_EMAIL}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                'Live Chat',
                IS_MOCK
                  ? '[DEV] Live chat not available in dev mode.'
                  : 'Live chat is available Monday – Friday from 09:00 AM to 4:30 PM CAT.',
                [{ text: 'OK' }]
              )
            }
            className="flex-1 bg-white rounded-3xl p-4 items-center gap-2 border border-slate-100"
            activeOpacity={0.8}
          >
            <View className="w-12 h-12 bg-emerald-50 rounded-2xl items-center justify-center">
              <MessageCircle size={22} color="#10b981" />
            </View>
            <Text className="text-xs font-display font-black text-slate-900 uppercase tracking-wider">
              Live Chat
            </Text>
            <Text className="font-sans text-[10px] text-slate-400 font-medium text-center">
              Mon–Fri 09:00–16:30 CAT
            </Text>
          </TouchableOpacity>
        </View>

        {IS_MOCK && (
          <View className="mx-5 mb-5 bg-amber-50 rounded-2xl px-4 py-3 border border-amber-100">
            <Text className="text-xs font-display font-black text-amber-700 uppercase tracking-wider mb-0.5">
              DEV Mode
            </Text>
            <Text className="font-sans text-xs text-amber-600 font-medium">
              Live chat and some contact features are mocked. In production these connect to the
              real support system (Mon–Fri 09:00 AM – 4:30 PM CAT).
            </Text>
          </View>
        )}

        {/* FAQ list */}
        <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest px-5 mb-3">
          Frequently Asked Questions
        </Text>
        <View className="px-5 gap-3">
          {FAQS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </View>

        {/* Response time note */}
        <View className="mx-5 mt-6 bg-white rounded-3xl p-4 border border-slate-100">
          <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mb-1">
            Response Times
          </Text>
          <Text className="font-sans text-sm text-slate-600 font-medium leading-relaxed">
            Email: within 24 hours{'\n'}Live chat: Mon–Fri 09:00 AM – 4:30 PM CAT (typically under 5 minutes)
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
