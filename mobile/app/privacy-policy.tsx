import { goBackSafely } from '@/utils/navigation';
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

const SECTIONS = [
  {
    title: '1. Information used to operate Detail',
    body: 'Depending on the features you use, we process your name, email address, phone number, role, profile photo, service area, cleaner profile and portfolio, verification status, device and app information, push token, booking details, bids, reviews, support requests, payment and payout records, and the service instructions, address, schedule, checklist, and photos you provide for a booking.',
  },
  {
    title: '2. Location',
    body: 'Location helps find nearby cleaners, choose or confirm a booking location, and show progress on an active booking. If a cleaner chooses to go online, Detail shares the cleaner’s location for matching while online and for customer tracking while assigned to an active booking. A cleaner can go offline or change device permissions to stop availability sharing. Location permissions are optional for general app access, but location-based features need the relevant permission.',
  },
  {
    title: '3. Photos, chat, and voice calls',
    body: 'Photos are processed when you choose to add a profile photo, cleaner portfolio image, booking or completion photo, chat photo, or support evidence. Booking chat is available to the booking participants and authorized Detail support staff. Common abusive language is screened before text messages are stored, and users can report messages or block a booking partner. Messages stop appearing in chat after 24 hours, but remain stored in Detail’s database; the 24-hour display period is not a database deletion period. In-app voice calls use Twilio, which processes call connection information and carries call audio. The app does not provide call recording.',
  },
  {
    title: '4. Identity checks',
    body: 'Cleaners may choose to complete identity verification through Didit. Didit collects the identity documents, selfie, and liveness information required by the verification flow under its own privacy terms. Detail receives the verification session and decision status; identity document images are submitted to Didit and are not stored by Detail.',
  },
  {
    title: '5. Payments and marketplace records',
    body: 'Payment providers process payments for cleaning services, refunds, and related settlement. Detail records booking and transaction status, amounts, provider references, wallet ledger entries, and payout information needed to operate the service, resolve disputes, and maintain financial records. Payment information is shared with the relevant customer, cleaner, payment provider, and authorized support or finance staff as needed for the transaction. Keep communication and payments in Detail.',
  },
  {
    title: '6. Service providers and sharing',
    body: 'Information is shared with the customer and cleaner involved in a booking and with providers that deliver app services. Current providers include Supabase for authentication and the marketplace backend, Cloudflare R2 for private media, Mapbox for maps and routes, Didit for identity checks, Paynow for payments, Resend for email, SMSPOP for SMS, Meta for WhatsApp messages, Expo Push Service, Apple Push Notification service and Firebase Cloud Messaging for push delivery as configured, Twilio for voice calls, and Apple or Google when you choose their sign-in option. We do not sell personal information.',
  },
  {
    title: '7. Notifications and marketing',
    body: 'In-app and push notifications provide account, booking, safety, and support updates. You can change device notification permissions in iOS or Android settings. Email, SMS, and WhatsApp marketing preferences can be managed in your Detail profile or by using the unsubscribe option in a campaign message. Turning off push notifications does not prevent you from using the app.',
  },
  {
    title: '8. Retention and account deletion',
    body: 'We keep information while needed to operate Detail, support bookings, prevent abuse, resolve disputes, and meet financial or legal recordkeeping obligations. Chat messages remain in the database after they leave the chat view. When an account is deleted, Detail removes or anonymizes identifying profile information and private media where feasible. Some booking, support, payment, payout, and accounting records may be retained in de-identified form to resolve obligations or maintain required records. Active bookings, wallet balances, commission, or pending payouts must be resolved before deletion can finish. Start deletion from Profile in the app.',
  },
  {
    title: '9. Website and beta waitlist',
    body: 'If you join the waitlist, Detail collects your role, name, phone number, email, country, city, area, preferred language, service interests, marketing-email choice, campaign source, and privacy acceptance record. PostHog website analytics are enabled only if you accept the website analytics prompt. Waitlist marketing is sent according to the choice you recorded; operational messages about your request are separate.',
  },
  {
    title: '10. Your choices and contact',
    body: 'You can update eligible profile information, manage device permissions and communication preferences, report or block another participant in a booking chat, or request access or deletion. Contact support@detailapp.co.zw with privacy questions. Detail uses access controls and service-provider safeguards appropriate to the information processed, but no online service can guarantee absolute security.',
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4 border-b border-slate-100">
        <TouchableOpacity
          onPress={() => goBackSafely()}
          className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center"
        >
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-display font-black text-slate-900">Privacy Policy</Text>
      </View>

      <ScrollView contentContainerClassName="px-5 pt-6 pb-16" showsVerticalScrollIndicator={false}>
        <Text className="font-sans text-xs text-slate-400 font-medium mb-6">
          Last updated: October 2026
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
