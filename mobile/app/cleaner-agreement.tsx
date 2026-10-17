import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, CheckCircle } from 'lucide-react-native';
import { callFunction } from '../services/functions';

// Full text of the Detail Cleaner Agreement (Catalyst Labs (PRIVATE) LIMITED,
// trading as Detail — Zimbabwe). Condensed section-by-section from the source
// legal document into readable paragraph cards; section numbers/headers match
// the source 1:1 so nothing is renumbered or reordered.
const TERMS = [
  {
    title: '1–2. Purpose of this Agreement',
    body: 'This Agreement governs your registration, use of the Detail Platform, and provision of cleaning services to Customers through Detail. Detail operates a technology platform that connects Customers with Cleaners — it does not guarantee any particular number of Bookings, customers, income, or minimum earnings.',
  },
  {
    title: '3. Independent Service Provider',
    body: 'You operate as an independent service provider, not an employee of Detail. This Agreement does not create an employment, partnership, joint venture, franchise, or agency relationship. You are responsible for your own operating expenses, equipment, transport, taxes, licences, permits, and insurance, and you have no authority to bind Detail to any contract or liability.',
  },
  {
    title: '4. Registration and Verification',
    body: 'You must provide accurate, complete, and current information when registering, including identity documents and any other information reasonably required for verification. Detail may conduct lawful background/verification checks and may refuse registration or restrict access where information is missing, inaccurate, fraudulent, or otherwise unsatisfactory. You must immediately update information that changes.',
  },
  {
    title: '5. Cleaner Account',
    body: 'You may hold only one Account, must keep your credentials confidential, and must not sell, lend, or share access to your Account or use another person’s Account. Notify Detail immediately if you suspect your Account has been compromised.',
  },
  {
    title: '6–8. Services & Bookings',
    body: 'You may only offer services you’re qualified to provide, must accurately describe your skills and equipment, and must not accept a Booking you know you can’t complete. Once accepted, you’re expected to honour a Booking, arrive on time, and communicate promptly if something prevents you from attending. You must never falsify attendance, completion, GPS data, or timestamps, and must not substitute another person without the Customer’s and Detail’s consent.',
  },
  {
    title: '9–10. Pricing & Platform Commission',
    body: 'You must accurately represent your prices with no hidden fees. The standard Detail commission is currently 10% of the Transaction value. Detail reserves the right to change, increase, or decrease commission and other fees at any time, subject to applicable law — changes will be communicated through the Platform and apply prospectively from their effective date. Attempting to avoid commission through false reporting or off-platform transactions is a breach of this Agreement.',
  },
  {
    title: '11. Cash Payments',
    body: 'Detail may permit Customers to pay you directly in cash. A cash payment does not remove your obligation to pay the applicable Detail commission — you must accurately record every cash Transaction and must never conceal or encourage a Customer to pay cash specifically to avoid commission or Platform records.',
  },
  {
    title: '12. Balance & Withdrawals',
    body: 'Amounts in your Detail balance may be adjusted by commissions, refunds, and other lawful deductions. Withdrawals normally take 1 to 3 business days once systems are operating normally — this is an estimate, not a guarantee, and Detail may hold a withdrawal to investigate suspected fraud or disputes.',
  },
  {
    title: '13–14. Customer Complaints & Refunds',
    body: 'A Customer may report you if they believe a job was poorly performed, materially incomplete, or different from what was agreed. Detail may investigate and request evidence from both sides. A complaint doesn’t automatically mean you’re at fault, but you must cooperate honestly — if you don’t respond to a reasonable request for information, Detail may decide using the evidence it has.',
  },
  {
    title: '15. Recovery of Refunds from Cleaners',
    body: 'Where you’ve already been paid in cash and Detail determines the Customer is entitled to a refund, the refund amount may be charged against your Detail Account, available balance, or future earnings/withdrawals, to the extent permitted by law. If your balance is insufficient, the remainder may be recorded as an amount you owe Detail, and Detail may restrict your ability to accept new Bookings until it’s recovered.',
  },
  {
    title: '16. Off-Platform Transactions',
    body: 'You must not use Customer information from Detail to move a Customer off-platform to avoid commission — including asking a Customer to cancel a Detail Booking so you can perform it privately, or offering a private deal specifically to bypass Detail.',
  },
  {
    title: '17–18. Customer Property & Prohibited Conduct',
    body: 'Treat Customer property with reasonable care and report accidental damage immediately — never conceal it. You must never steal, commit fraud, submit fraudulent Bookings, manipulate ratings, impersonate someone, or otherwise damage or interfere with Detail’s Platform.',
  },
  {
    title: '19–20. Ratings & Job Evidence',
    body: 'You must not manipulate ratings/reviews or pressure a Customer for a particular rating. Any photos submitted as job evidence must be genuine, related to the actual Booking, and must respect Customer privacy.',
  },
  {
    title: '21–24. Data, Confidentiality & Intellectual Property',
    body: 'Customer information may only be used for legitimate purposes connected to an authorised service — never sold, published, or misused. You must keep non-public Detail information confidential, and may not copy, reproduce, or commercially exploit Detail’s branding or platform outside approved use, or represent yourself as an official Detail spokesperson or employee.',
  },
  {
    title: '25–26. Health, Safety, Taxes & Insurance',
    body: 'Take reasonable measures to protect yourself, Customers, and property, and report serious incidents promptly. You are solely responsible for your own tax obligations, required licences/permits, and any insurance appropriate to your work — Detail does not offer insurance coverage unless expressly stated in writing.',
  },
  {
    title: '27–28. Suspension & Termination',
    body: 'Detail may suspend or restrict your Account where it reasonably believes this Agreement has been breached, safety is at risk, fraud may have occurred, or amounts owed to Detail remain unpaid. Either Party may terminate the Agreement subject to law; Detail may terminate immediately for serious misconduct (fraud, theft, violence, deliberate commission avoidance, etc.). Termination does not erase amounts you already owe.',
  },
  {
    title: '29–33. Liability, Indemnity & Communications',
    body: 'Detail is a technology platform and does not guarantee uninterrupted availability or any specific volume of work. To the extent permitted by law, you agree to indemnify Detail against third-party claims arising directly from your fraud, theft, or intentional misconduct. Detail may contact you through the Platform, email, SMS, or WhatsApp, and electronic records may be used as evidence of Bookings and Account activity.',
  },
  {
    title: '34–38. Governing Law & General Terms',
    body: 'This Agreement is governed by the laws of Zimbabwe, and disputes should first go through Detail’s internal support process before pursuing other legal remedies. If any provision is found unenforceable, the rest of the Agreement remains in effect. You may not assign your rights under this Agreement without Detail’s written consent.',
  },
];

export default function CleanerAgreementScreen() {
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      // The server requires a successful Didit decision before granting cleaner access.
      await callFunction('acceptCleanerAgreement');
      setAccepted(true);
    } catch (error) {
      Alert.alert('Could not activate cleaner account', (error as { message?: string })?.message || 'Complete identity verification and try again.');
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
            onPress={() => router.replace('/home')}
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
            <Text className="text-xs text-slate-400 font-medium mb-1">
              Catalyst Labs (PRIVATE) LIMITED, trading as Detail — Zimbabwe
            </Text>
            <Text className="text-xs text-slate-400 font-medium mb-6">
              Please read all terms before accepting
            </Text>
            {TERMS.map(({ title, body }) => (
              <View key={title} className="mb-6">
                <Text className="text-base font-black text-slate-900 mb-2">{title}</Text>
                <Text className="text-sm text-slate-600 font-medium leading-relaxed">{body}</Text>
              </View>
            ))}
            <Text className="text-sm text-slate-600 font-medium leading-relaxed italic mb-2">
              By accepting, you confirm you've read and understood this Agreement, that you
              operate as an independent service provider, and that all information you've
              provided to Detail is accurate and complete.
            </Text>
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
