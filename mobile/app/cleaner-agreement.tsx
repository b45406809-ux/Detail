import { appAlert } from '@/components/AppDialog';
import { goBackSafely } from '@/utils/navigation';
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle } from 'lucide-react-native';
import { callFunction } from '../services/functions';

// Detail Cleaner Agreement, Catalyst Labs (PRIVATE) LIMITED, trading as Detail — Zimbabwe.
const TERMS = [
  {
    title: '1–2. Purpose of this Agreement',
    body: 'This Agreement governs your registration, use of the Detail Platform, and provision of cleaning services to Customers through Detail. Detail operates a technology platform that connects Customers with Cleaners. Detail does not guarantee any particular number of Bookings, customers, income, or minimum earnings.',
  },
  {
    title: '3. Independent Service Provider',
    body: 'You operate as an independent service provider, not an employee of Detail. This Agreement does not create an employment, partnership, joint venture, franchise, or agency relationship. You are responsible for your own operating expenses, equipment, transport, taxes, licences, permits, and insurance, and you have no authority to bind Detail to any contract or liability.',
  },
  {
    title: '4. Registration and Verification',
    body: 'You must provide accurate, complete, and current information when registering, including identity documents and any other information reasonably required for verification.\n\nCleaner accounts must pass identity verification through Didit before bidding for or accepting jobs.\n\nCleaner registration requires a $2.00 wallet deposit:\n• $1.00 pays the one-time identity verification fee.\n• $1.00 remains as prepaid wallet credit for platform commissions.\n\nWhere permitted by law, the identity verification fee is non-refundable after a Didit session starts, except where the verification service was not provided or a refund is required by law.\n\nIf Didit rejects your verification, you cannot bid for or accept jobs. Contact Detail Support to correct your information or appeal. A retry does not incur another verification fee.',
  },
  {
    title: '5. Cleaner Account',
    body: 'You may hold only one Account, must keep your credentials confidential, and must not sell, lend, or share access to your Account or use another person’s Account.\n\nNotify Detail immediately if you suspect your Account has been compromised.',
  },
  {
    title: '6–8. Services & Bookings',
    body: 'You may only offer services you are qualified to provide, must accurately describe your skills and equipment, and must not submit a bid for a Booking you know you cannot complete.\n\nOnce a Customer accepts your bid, you are expected to honour the Booking, arrive on time, and communicate promptly if something prevents you from attending.\n\nYou must never falsify attendance, completion, GPS data, or timestamps, and must not substitute another person without the Customer’s and Detail’s consent.',
  },
  {
    title: '9. Pricing & Platform Commission',
    body: 'You must accurately represent your prices with no hidden fees.\n\nDetail currently charges a standard platform commission of 10% of the agreed Booking value.\n\nDetail reserves the right to change, increase, or decrease its commission and other fees at any time, subject to applicable law. Changes will be communicated through the Platform and apply prospectively from their effective date.\n\nAttempting to avoid commission through false reporting, manipulating Booking values, or off-platform transactions is a breach of this Agreement.',
  },
  {
    title: '10. Prepaid Wallet & Bidding Requirements',
    body: 'Detail operates a prepaid commission wallet system similar to the inDrive top-up model.\n\nBefore submitting a bid or quote for a Booking, you must have sufficient available wallet credit to cover at least 10% of the value of the job you intend to bid for.\n\nFor example:\n• $10 job = at least $1 wallet credit.\n• $20 job = at least $2 wallet credit.\n• $50 job = at least $5 wallet credit.\n• $100 job = at least $10 wallet credit.\n\nYou must top up your wallet before bidding if your available balance is insufficient.\n\nDetail may prevent you from submitting bids, accepting Bookings, or accessing certain Platform features if you do not have sufficient wallet credit.\n\nWallet credit is prepaid commission credit and is not customer payment, cleaner earnings, or a bank deposit.',
  },
  {
    title: '11. Commission Deduction & Customer Payments',
    body: 'When a Customer accepts your bid, the applicable platform commission of 10% of the agreed Booking value will be deducted from your prepaid wallet credit, or the applicable amount will be reserved and subsequently deducted in accordance with the Platform’s booking and cancellation process.\n\nFor example, if you successfully secure a $20 Booking, Detail’s commission is $2. If you have already prepaid $2 in commission credit, that credit will be used to cover the commission.\n\nCustomers pay Cleaners directly for completed services using cash, EcoCash, InnBucks, bank transfer, or another payment method agreed between the Customer and Cleaner.\n\nDetail does not receive, hold, process, or transfer Customer payments to Cleaners.\n\nYou are responsible for collecting payment directly from the Customer and resolving payment arrangements between you and the Customer, subject to Detail’s complaint and dispute procedures.\n\nYou must keep sufficient wallet credit to participate in the Platform and submit bids.\n\nYou may top up your wallet through the payment methods made available by Detail from time to time.',
  },
  {
    title: '12. Wallet Balance & Top-Ups',
    body: 'Your Detail wallet is used exclusively for prepaid platform commission and applicable Platform fees.\n\nWallet balances are not earnings accounts and cannot be withdrawn as cleaner income.\n\nDetail does not offer cleaner payouts, earnings withdrawals, or transfers of Customer payments.\n\nWallet top-ups may be used to cover commissions for Bookings in accordance with this Agreement.\n\nDetail may review wallet transactions where fraud, payment errors, disputes, or suspicious activity are reasonably suspected.\n\nAny refund of unused wallet credit will be handled in accordance with applicable law and Detail’s wallet refund policy.',
  },
  {
    title: '13–14. Customer Complaints & Refunds',
    body: 'A Customer may report you if they believe a job was poorly performed, materially incomplete, or different from what was agreed.\n\nDetail may investigate and request evidence from both sides. A complaint does not automatically mean you are at fault, but you must cooperate honestly.\n\nIf you do not respond to a reasonable request for information, Detail may decide using the evidence available.\n\nBecause Customers pay Cleaners directly, any service refund, price adjustment, or repayment to a Customer is generally handled directly between the Customer and Cleaner.\n\nDetail may facilitate communication, investigate complaints, recommend resolutions, and take appropriate Platform action where necessary.',
  },
  {
    title: '15. Refunds, Disputes & Commission Adjustments',
    body: 'Where a Booking is cancelled, the commission charged or reserved may be refunded to your wallet or adjusted in accordance with Detail’s cancellation policy.\n\nWhere a dispute arises after a Booking has been completed, Detail may investigate the circumstances and determine whether a commission adjustment or wallet credit is appropriate, subject to applicable law and Platform policies.\n\nDetail does not automatically guarantee reimbursement to either party for disputes involving payments made directly between Customers and Cleaners.\n\nYou remain responsible for resolving legitimate Customer refund obligations arising from your services.\n\nDetail may restrict your ability to bid for or accept new Bookings where your wallet balance is insufficient, where a dispute remains unresolved, or where you have breached this Agreement.',
  },
  {
    title: '16. Off-Platform Transactions',
    body: 'You must not use Customer information obtained through Detail to move a Customer off-platform for the purpose of avoiding commission.\n\nThis includes asking a Customer to cancel a Detail Booking so you can perform it privately, or offering a private deal specifically to bypass Detail’s commission.',
  },
  {
    title: '17–18. Customer Property & Prohibited Conduct',
    body: 'Treat Customer property with reasonable care and report accidental damage immediately. Never conceal damage.\n\nYou must never steal, commit fraud, submit fraudulent Bookings, manipulate ratings, impersonate someone, or otherwise damage or interfere with Detail’s Platform.',
  },
  {
    title: '19–20. Ratings & Job Evidence',
    body: 'You must not manipulate ratings or reviews or pressure a Customer for a particular rating.\n\nAny photos submitted as job evidence must be genuine, related to the actual Booking, and must respect Customer privacy.',
  },
  {
    title: '21–24. Data, Confidentiality & Intellectual Property',
    body: 'Customer information may only be used for legitimate purposes connected to an authorised service. It must never be sold, published, or misused.\n\nYou must keep non-public Detail information confidential, and may not copy, reproduce, or commercially exploit Detail’s branding or platform outside approved use, or represent yourself as an official Detail spokesperson or employee.',
  },
  {
    title: '25–26. Health, Safety, Taxes & Insurance',
    body: 'Take reasonable measures to protect yourself, Customers, and property, and report serious incidents promptly.\n\nYou are solely responsible for your own tax obligations, required licences/permits, and any insurance appropriate to your work.\n\nDetail does not offer insurance coverage unless expressly stated in writing.',
  },
  {
    title: '27–28. Suspension & Termination',
    body: 'Detail may suspend or restrict your Account where it reasonably believes this Agreement has been breached, safety is at risk, fraud may have occurred, or amounts owed to Detail remain unpaid.\n\nEither Party may terminate the Agreement subject to law. Detail may terminate immediately for serious misconduct, including fraud, theft, violence, deliberate commission avoidance, or other serious breaches.\n\nTermination does not erase amounts already owed to Detail or obligations arising from completed Bookings.',
  },
  {
    title: '29–33. Liability, Indemnity & Communications',
    body: 'Detail is a technology platform and does not guarantee uninterrupted availability or any specific volume of work.\n\nTo the extent permitted by law, you agree to indemnify Detail against third-party claims arising directly from your fraud, theft, or intentional misconduct.\n\nDetail may contact you through the Platform, email, SMS, or WhatsApp, and electronic records may be used as evidence of Bookings and Account activity.\n\nDetail is not responsible for collecting Customer payments on your behalf or making cleaner payouts.',
  },
  {
    title: '34–38. Governing Law & General Terms',
    body: 'This Agreement is governed by the laws of Zimbabwe, and disputes should first go through Detail’s internal support process before pursuing other legal remedies.\n\nIf any provision is found unenforceable, the rest of the Agreement remains in effect.\n\nYou may not assign your rights under this Agreement without Detail’s written consent.',
  },
];

export default function CleanerAgreementScreen() {
  const params = useLocalSearchParams<{ organizationCode?: string }>();
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [organizationCode, setOrganizationCode] = useState(String(params.organizationCode ?? '').trim());
  const [organizationJoined, setOrganizationJoined] = useState(false);
  const [organizationError, setOrganizationError] = useState('');

  const joinOrganization = async () => {
    const code = organizationCode.trim();
    if (!code) return;
    setIsAccepting(true);
    setOrganizationError('');
    try {
      await callFunction('joinOrganization', { code });
      setOrganizationJoined(true);
    } catch (error) {
      setOrganizationError((error as { message?: string })?.message || 'The code could not be accepted. Ask the organization owner for a new code and try again.');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      // The server requires a successful Didit decision and acceptance of the updated prepaid commission terms.
      await callFunction('acceptCleanerAgreement');
      setAccepted(true);
      // The invitation is email-bound and the server only lets an activated,
      // verified cleaner join. Accept the agreement first, then redeem it.
      if (organizationCode.trim()) await joinOrganization();
    } catch (error) {
      appAlert('Could not activate cleaner account', (error as { message?: string })?.message || 'Complete identity verification and try again.');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4 border-b border-slate-100">
        <TouchableOpacity
          onPress={() => goBackSafely()}
          className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center"
        >
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-display font-black text-slate-900">Detail Cleaner Agreement</Text>
      </View>

      {accepted ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 bg-emerald-50 rounded-3xl items-center justify-center mb-4">
            <CheckCircle size={40} color="#10b981" />
          </View>
          <Text className="text-2xl font-display font-black text-slate-900 text-center mb-2">
            Agreement Accepted
          </Text>
          <Text className="font-sans text-sm text-slate-500 font-medium text-center mb-8">
            You're now a verified Detail cleaner. Start accepting jobs!
          </Text>
          {organizationCode.trim() ? organizationJoined ? (
            <Text className="font-sans text-sm text-emerald-700 text-center mb-6">You’ve joined the organization successfully.</Text>
          ) : (
            <View className="w-full mb-6 gap-3">
              <Text className="font-sans text-sm text-slate-600 text-center">Your cleaner account is active, but the organization invitation still needs to be accepted.</Text>
              {organizationError ? <Text accessibilityRole="alert" className="font-sans text-xs text-red-600 text-center">{organizationError}</Text> : null}
              <TextInput value={organizationCode} onChangeText={setOrganizationCode} autoCapitalize="characters" autoCorrect={false} placeholder="Organization invitation code" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-ink" />
              <TouchableOpacity disabled={isAccepting || !organizationCode.trim()} onPress={() => void joinOrganization()} className="rounded-2xl border border-accent py-4 items-center">
                {isAccepting ? <ActivityIndicator color="#3906D2" /> : <Text className="font-display font-black text-accent">Join organization</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => router.replace('/home')}
            className="w-full bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
            activeOpacity={0.85}
          >
            <Text className="text-white font-display font-black text-sm uppercase tracking-widest">
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
            <Text className="font-sans text-xs text-slate-400 font-medium mb-1">
              Catalyst Labs (PRIVATE) LIMITED, trading as Detail — Zimbabwe
            </Text>
            <Text className="font-sans text-xs text-slate-400 font-medium mb-6">
              Please read all terms before accepting
            </Text>
            <Text className="font-sans text-xs text-slate-500 font-bold mb-6">Version cleaner-2026-11-25-wallet-direct-payments-v2</Text>
            {TERMS.map(({ title, body }) => (
              <View key={title} className="mb-6">
                <Text className="text-base font-display font-black text-slate-900 mb-2">{title}</Text>
                <Text className="font-sans text-sm text-slate-600 font-medium leading-relaxed">{body}</Text>
              </View>
            ))}
            <Text className="font-sans text-sm text-slate-600 font-medium leading-relaxed italic mb-2">
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
                <Text className="text-white font-display font-black text-sm uppercase tracking-widest">
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
