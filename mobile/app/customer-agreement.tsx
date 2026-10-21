import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

// Full text of the Detail Customer Agreement (Catalyst Labs (PRIVATE) LIMITED,
// trading as Detail — Zimbabwe). Condensed section-by-section from the source
// legal document into readable paragraph cards; section numbers/headers match
// the source 1:1 so nothing is renumbered or reordered.
const SECTIONS = [
  {
    title: '1–2. Purpose of this Agreement',
    body: 'This Agreement governs your use of Detail and your purchase of cleaning services through the Platform. Detail provides a technology platform that connects Customers with independent Cleaners — by creating an Account, submitting a Booking, or making a payment, you agree to this Agreement.',
  },
  {
    title: '3–4. Your Account & Requesting a Service',
    body: 'You must provide accurate, current information when creating your Account and are responsible for keeping your credentials secure. When requesting a Service, you must accurately describe the location, size, condition, and any circumstances that could affect the Cleaner’s ability to safely perform the job — a Booking becomes binding once a Cleaner accepts it.',
  },
  {
    title: '5. Service Pricing',
    body: 'Prices vary by service, location, complexity, and Cleaner availability. Where Detail allows bidding, the price becomes the agreed price once you accept an offer through the app. Detail may change its pricing structures or fees from time to time, subject to applicable law.',
  },
  {
    title: '6–7. Payments & Cash',
    body: 'You must pay the correct agreed amount through an available payment method. Where cash payment is permitted, payment is made directly to the Cleaner — this doesn’t prevent you from reporting a legitimate issue with the Service to Detail.',
  },
  {
    title: '8. Cancellations',
    body: 'You may cancel a Booking subject to the applicable cancellation rules; cancellation fees may apply where disclosed to you before or at the time of Booking, particularly once a Cleaner has already begun travelling to the job.',
  },
  {
    title: '9–10. Your Responsibilities & Property',
    body: 'You must give the Cleaner reasonable, safe access to the location, disclose known hazards, and treat Cleaners respectfully — never threaten, harass, or discriminate against them. You remain responsible for securing valuable, fragile, or sensitive belongings before a Service begins.',
  },
  {
    title: '11–12. Service Quality & Refunds',
    body: 'Cleaners are expected to perform with reasonable skill and care. If a Service was poorly performed, materially incomplete, or different from what was agreed, report it to Detail as soon as possible with any relevant evidence (photos, videos, communications). A refund is not automatically guaranteed just because you’re dissatisfied — Detail investigates and decides based on the available evidence.',
  },
  {
    title: '13–14. Refunds on Cash Payments & Investigation',
    body: 'Where you paid a Cleaner in cash and Detail determines a refund is due, Detail may recover that amount from the Cleaner’s Detail Account, balance, or future earnings, then process your refund through an available payment method. Detail may request more information from you or the Cleaner while investigating, and won’t recover more than the amount properly determined to be refundable.',
  },
  {
    title: '15. Fraudulent Refund Claims',
    body: 'You must not falsely claim a Service was poorly performed, deliberately damage property to blame a Cleaner, or submit altered evidence to obtain a refund. Fraudulent or abusive refund claims may result in account suspension or termination.',
  },
  {
    title: '16–17. Communication & Off-Platform Transactions',
    body: 'Use Detail’s in-app messaging responsibly and never harass or improperly contact a Cleaner. You must not use Detail to find a Cleaner and then move the Booking off-platform to avoid Detail’s fees or procedures.',
  },
  {
    title: '18–19. Ratings, Reviews & Safety',
    body: 'You may leave honest ratings and reviews based on your genuine experience — never bribe or pressure a Cleaner for a particular outcome. Never knowingly request a dangerous or unlawful Service; a Cleaner may refuse or stop a job where there’s a genuine, unreasonable safety risk.',
  },
  {
    title: '20–22. Privacy, Platform Availability & Detail’s Role',
    body: 'Detail collects and uses your information per its Privacy Policy to operate the Platform, process Bookings, and prevent fraud. Detail is a technology platform connecting you with independent Cleaners — it doesn’t guarantee uninterrupted access or the conduct of every Cleaner, though it may verify Cleaners and investigate complaints under its policies.',
  },
  {
    title: '23–25. Suspension, Liability & Indemnity',
    body: 'Detail may restrict or suspend your Account where reasonably necessary to investigate fraud, protect users, or prevent abuse — this doesn’t remove payment obligations that arose beforehand. To the extent permitted by Zimbabwean law, Detail isn’t responsible for losses caused solely by a Cleaner’s independent actions or by circumstances outside Detail’s control.',
  },
  {
    title: '26–29. Communications, Changes & Governing Law',
    body: 'Detail may contact you through the app, email, SMS, or WhatsApp, and electronic records may be used as evidence of Bookings and communications. Detail may amend this Agreement where reasonably necessary; continued use after a change takes effect means you accept it. This Agreement is governed by the laws of Zimbabwe.',
  },
  {
    title: '30–32. General Terms',
    body: 'If any part of this Agreement is found unenforceable, the rest remains in effect. Detail’s failure to enforce a provision on one occasion doesn’t waive its right to do so later. Together with Detail’s Terms of Service, Privacy Policy, and Platform rules, this Agreement is the entire agreement between you and Detail regarding your use of the Platform.',
  },
];

export default function CustomerAgreementScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4 border-b border-slate-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center"
        >
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-display font-black text-slate-900">Customer Agreement</Text>
      </View>

      <ScrollView contentContainerClassName="px-5 pt-6 pb-16" showsVerticalScrollIndicator={false}>
        <Text className="font-sans text-xs text-slate-400 font-medium mb-1">
          Catalyst Labs (PRIVATE) LIMITED, trading as Detail — Zimbabwe
        </Text>
        <Text className="font-sans text-xs text-slate-400 font-medium mb-6">
          By booking a Service through Detail, you agree to these terms
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
