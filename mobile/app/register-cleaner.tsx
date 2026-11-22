import { appAlert } from '@/components/AppDialog';
import { goBackSafely } from '@/utils/navigation';
// Cleaner registration — collects the identity/verification info required by
// the Cleaner Agreement §4 (full name, phone, physical address) plus service details, and proves email ownership via Firebase's
// built-in email-verification flow (the OTP-equivalent — no separate email
// provider needed). Reached from profile.tsx's "Switch to Cleaner" action
// whenever cleanerOnboardingComplete or hasAgreedToTerms is missing; ends by
// routing into cleaner-agreement.tsx, which is what actually flips role.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,

} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft,
  User,
  MapPin,
  Home as HomeIcon,
  Car,
  Mail,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { auth, sendEmailVerification, supabase } from '../services/supabase';
import { callFunction } from '../services/functions';
import { ServiceCategory } from '../types';

const CATEGORY_OPTIONS: { id: ServiceCategory; label: string; icon: any }[] = [
  { id: 'HOUSE', label: 'House Cleaning', icon: HomeIcon },
  { id: 'CAR', label: 'Car Cleaning', icon: Car },
];
const DEFAULT_SERVICE_RADIUS_KM = 15;

export default function RegisterCleanerScreen() {
  const { profile } = useAuth();
  const [introStep, setIntroStep] = useState(0);
  const [fullName, setFullName] = useState(profile?.displayName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [address, setAddress] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [radius, setRadius] = useState(String(DEFAULT_SERVICE_RADIUS_KM));
  const [experience, setExperience] = useState('');
  const [organizationCode, setOrganizationCode] = useState('');
  const [isCheckingIdentity, setIsCheckingIdentity] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const normalizedPhone = phone.trim().replace(/[\s()-]/g, '');
  const phoneIsVerified = /^\+[1-9]\d{7,14}$/.test(normalizedPhone) && verifiedPhone.replace(/\D/g, '') === normalizedPhone.replace(/\D/g, '');

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user?.phone_confirmed_at && data.user.phone) {
        const number = `+${data.user.phone.replace(/\D/g, '')}`;
        setVerifiedPhone(number);
        setPhone(current => current || number);
      }
    });
    return () => { active = false; };
  }, []);

  const sendPhoneCode = async () => {
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) { appAlert('Enter your phone number', 'Include the country code, for example +263 followed by your mobile number.'); return; }
    setPhoneBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ phone: normalizedPhone });
      if (error) throw error;
      setCodeSentTo(normalizedPhone); setPhoneCode('');
      appAlert('Code sent', 'Enter the SMS code to verify your cleaner phone number.');
    } catch (error) { appAlert('Could not send code', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setPhoneBusy(false); }
  };

  const verifyPhoneCode = async () => {
    if (!/^\d{6}$/.test(phoneCode) || codeSentTo !== normalizedPhone) { appAlert('Enter the code', 'Enter the six-digit code sent to this number.'); return; }
    setPhoneBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: codeSentTo, token: phoneCode, type: 'phone_change' });
      if (error) throw error;
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user?.phone_confirmed_at || data.user.phone?.replace(/\D/g, '') !== codeSentTo.replace(/\D/g, '')) throw new Error('Phone verification could not be confirmed. Try again.');
      setVerifiedPhone(codeSentTo); setCodeSentTo(''); setPhoneCode('');
      appAlert('Phone verified', 'Your phone number is verified.');
    } catch (error) { appAlert('Code not accepted', error instanceof Error ? error.message : 'Please request a new code and try again.'); }
    finally { setPhoneBusy(false); }
  };

  const emailVerified = auth.currentUser?.emailVerified ?? false;
  const [verificationSent, setVerificationSent] = useState(false);

  const toggleCategory = (id: ServiceCategory) =>
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const handleSendVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerificationSent(true);
      appAlert('Check your email', 'We sent a verification link to confirm this is your email.');
    } catch {
      appAlert('Error', 'Could not send the verification email. Please try again.');
    }
  };

  const handleCheckVerification = async () => {
    try {
      await auth.currentUser?.reload();
      if (!auth.currentUser?.emailVerified) {
        appAlert('Not verified yet', 'Open the link in the email we sent, then try again.');
      }
    } catch {
      appAlert('Error', 'Could not check verification status.');
    }
  };

  const verificationStatus = profile?.verificationStatus ?? 'NOT_STARTED';
  const isIdentityVerified = verificationStatus === 'VERIFIED';

  const refreshIdentityCheck = async () => {
    setIsCheckingIdentity(true);
    try {
      const result = await callFunction<undefined, { status: string }>('refreshCleanerIdentityVerification');
      if (result.status === 'VERIFIED') appAlert('Identity verified', 'Your identity check is complete.');
      else if (result.status === 'REJECTED') appAlert('Verification needs attention', 'You cannot accept jobs until your identity is verified. Check your details and contact Detail support if you believe this is a mistake. You can retry without paying the one-time fee again. The fee is non-refundable where permitted by law, except when the verification service was not provided.');
      else appAlert('Verification pending', 'Your check is still being reviewed.');
    } catch (error) {
      appAlert('Could not check status', (error as { message?: string })?.message || 'Please try again.');
    } finally {
      setIsCheckingIdentity(false);
    }
  };

  const startIdentityCheck = async () => {
    appAlert(
      'Identity verification',
      'Cleaners must pass identity verification before accepting jobs. The one-time fee is $0.50 from your Detail wallet. A $0.50 commission credit covers a $5 booking; that credit is separate from the verification fee. Once verification starts, the fee is non-refundable where permitted by law, except where the verification service was not provided. If your check is declined, you cannot accept jobs; contact Detail support to correct your details or appeal. You can retry without paying the one-time fee again. Your identity documents are handled by our verification provider; Detail receives the decision, not your ID images.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => { void launchIdentityCheck(); } },
      ]
    );
  };

  const launchIdentityCheck = async () => {
    setIsCheckingIdentity(true);
    try {
      const session = await callFunction<{ consent: true; feeConsent: true }, { sessionUrl: string }>(
        'startCleanerIdentityVerification', { consent: true, feeConsent: true }
      );
      await WebBrowser.openBrowserAsync(session.sessionUrl);
      await refreshIdentityCheck();
    } catch (error) {
      appAlert('Identity check unavailable', (error as { message?: string })?.message || 'Please try again later.');
    } finally {
      setIsCheckingIdentity(false);
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !phone.trim() || !address.trim()) {
      appAlert('Missing info', 'Please fill in your full name, phone, and physical address.');
      return;
    }
    if (categories.length === 0) {
      appAlert('Pick a service', 'Choose at least one service you want to offer.');
      return;
    }
    const serviceRadiusKm = Number(radius);
    if (!Number.isFinite(serviceRadiusKm) || serviceRadiusKm < 1 || serviceRadiusKm > 100) {
      appAlert('Check your service radius', 'Enter a radius between 1 and 100 km. The suggested starting radius is 15 km.');
      return;
    }
    if (!phoneIsVerified) { appAlert('Verify your phone', 'Verify your mobile number before applying as a cleaner.'); return; }
    if (!isIdentityVerified) {
      appAlert('Identity check required', 'Complete identity verification before continuing.');
      return;
    }
    if (!emailVerified) {
      appAlert('Verify your email', 'Please verify your email before continuing.');
      return;
    }

    setIsSubmitting(true);
    try {
      await auth.currentUser?.reload();
      await auth.currentUser?.getIdToken(true);
      await callFunction('submitCleanerApplication', {
        fullName: fullName.trim(), phone: normalizedPhone, address: address.trim(),
        serviceArea: serviceArea.trim(), serviceCategories: categories,
        serviceRadiusKm, experienceYears: Number(experience) || 0,
      });
      router.push({ pathname: '/cleaner-agreement', params: organizationCode.trim() ? { organizationCode: organizationCode.trim() } : {} });
    } catch {
      appAlert('Error', 'Failed to submit your registration. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const introSlides = [
    { title: 'Work with Detail', body: 'Choose the cleaning services and areas you offer. Complete identity verification and the cleaner agreement before accepting bookings.' },
    { title: 'Your earnings', body: 'Detail charges a 10% platform commission. For a $30 Paynow booking, $3 is taken from the payment and your $27 share is credited after settlement. For offline bookings, the customer pays you directly and the 10% commission is reserved from your prepaid commission credit when they accept your quote.' },
    { title: 'When you get paid', body: 'For now, customers pay you directly using cash, EcoCash, InnBucks, or another method you both agree on. Detail does not receive or hold customer booking payments. You keep the remaining 90% after your prepaid 10% commission is reserved.' },
    { title: 'Prepaid commission', body: 'Keep prepaid commission credit to accept offline bookings. At least $1 credit lets you accept up to $10 of offline work; a $20 accepted quote reserves $2. Detail returns the reserve if the booking is cancelled before completion. Paynow bookings do not use this reserve because the 10% is taken from your payout.' },
    { title: 'Identity verification fee', body: 'Identity verification costs a one-time $0.50 from your Detail wallet. This is separate from prepaid commission credit: a $0.50 commission credit covers a $5 booking. You must be verified before accepting jobs. If your check is declined, you cannot accept jobs; contact support to correct your details or appeal. You can retry without paying again. The fee is non-refundable where permitted by law, except if the verification service was not provided.' },
    { title: 'Deliver with care', body: 'Keep your availability accurate, arrive on time, communicate through Detail and provide the required completion photos. Review the full cleaner agreement before joining.' },
  ];
  if (introStep < introSlides.length) {
    const slide = introSlides[introStep];
    return <SafeAreaView className="flex-1 bg-white"><View className="flex-1 px-6 pt-10 pb-8 justify-between">
      <ScrollView showsVerticalScrollIndicator={false}><TouchableOpacity onPress={() => introStep > 0 ? setIntroStep(introStep - 1) : goBackSafely()} accessibilityRole="button" accessibilityLabel="Back" className="w-10 h-10 rounded-2xl bg-slate-50 items-center justify-center mb-6"><ArrowLeft size={18} color="#150256" /></TouchableOpacity><View className="flex-row gap-2 mb-12">{introSlides.map((_, index) => <View key={index} className={`h-1.5 flex-1 rounded-full ${index <= introStep ? 'bg-accent' : 'bg-slate-100'}`} />)}</View>
        <View className="w-20 h-20 rounded-3xl bg-accent/10 items-center justify-center mb-8"><ShieldCheck size={36} color="#3906D2" /></View>
        <Text className="text-3xl font-display font-black text-ink mb-4">{slide.title}</Text>
        <Text className="font-sans text-base leading-7 text-ink/70">{slide.body}</Text>
      </ScrollView><View><TouchableOpacity accessibilityRole="button" onPress={() => setIntroStep(introStep + 1)} className="bg-accent rounded-3xl py-5 items-center"><Text className="text-white font-display font-black">{introStep === introSlides.length - 1 ? 'Start registration' : 'Continue'}</Text></TouchableOpacity>{introStep > 0 && <TouchableOpacity onPress={() => setIntroStep(introStep - 1)} className="items-center pt-5"><Text className="text-accent font-display font-black">Back</Text></TouchableOpacity>}</View>
    </View></SafeAreaView>;
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4 border-b border-slate-100">
        <TouchableOpacity
          onPress={() => goBackSafely()}
          className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center"
        >
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-display font-black text-slate-900">Become a Cleaner</Text>
          <Text className="font-sans text-xs text-slate-400 font-medium">Register to start accepting jobs</Text>
        </View>
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerClassName="px-5 pt-6 pb-10" keyboardShouldPersistTaps="handled">
          {/* Identity */}
          <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mb-3">
            Your Details
          </Text>
          <View className="gap-3 mb-6">
            <LabeledInput icon={User} label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Your full legal name" />
            <LabeledInput icon={User} label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+263 7X XXX XXXX" keyboardType="phone-pad" />
            <View className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <Text className="font-sans text-sm text-ink">{phoneIsVerified ? 'Phone number verified' : 'Cleaners must verify their mobile number.'}</Text>
              {!phoneIsVerified && <TouchableOpacity disabled={phoneBusy} onPress={() => void sendPhoneCode()} className="mt-3 rounded-xl bg-accent px-4 py-3"><Text className="text-center font-sans-bold text-white">{phoneBusy ? 'Please wait…' : codeSentTo === normalizedPhone ? 'Send a new code' : 'Send verification code'}</Text></TouchableOpacity>}
              {!phoneIsVerified && codeSentTo === normalizedPhone && <View className="mt-3 gap-3"><TextInput value={phoneCode} onChangeText={setPhoneCode} keyboardType="number-pad" maxLength={6} placeholder="Six-digit code" className="rounded-xl bg-white px-4 py-3 text-ink" /><TouchableOpacity disabled={phoneBusy} onPress={() => void verifyPhoneCode()} className="rounded-xl border border-accent px-4 py-3"><Text className="text-center font-sans-bold text-accent">Verify code</Text></TouchableOpacity></View>}
              {phoneIsVerified && profile?.cleanerOnboardingComplete && profile?.cleanerAgreementAccepted && <TouchableOpacity disabled={phoneBusy} onPress={() => { setPhoneBusy(true); void callFunction('setActiveRole', { role: 'CLEANER' }).then(() => router.replace('/(tabs)/home')).catch((error) => appAlert('Could not switch role', error instanceof Error ? error.message : 'Please try again.')).finally(() => setPhoneBusy(false)); }} className="mt-3 rounded-xl bg-accent px-4 py-3"><Text className="text-center font-sans-bold text-white">Continue as cleaner</Text></TouchableOpacity>}
            </View>
            <LabeledInput icon={MapPin} label="Physical Address" value={address} onChangeText={setAddress} placeholder="Street, suburb, city" multiline />
            <LabeledInput icon={MapPin} label="Service Area (Optional)" value={serviceArea} onChangeText={setServiceArea} placeholder="City or suburbs you serve" />
          </View>

          {/* Email verification */}
          <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mb-3">
            Email Verification
          </Text>
          <View className="bg-slate-50 rounded-3xl p-4 border border-slate-100 mb-6 flex-row items-center gap-3">
            <View className={`w-10 h-10 rounded-2xl items-center justify-center ${emailVerified ? 'bg-emerald-100' : 'bg-accent/10'}`}>
              {emailVerified ? <CheckCircle2 size={18} color="#10b981" /> : <Mail size={18} color="#3906D2" />}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-display font-black text-slate-900">
                {emailVerified ? 'Email verified' : 'Verify your email'}
              </Text>
              <Text className="font-sans text-xs text-slate-400 font-medium mt-0.5">
                {emailVerified ? "You're all set" : 'Confirms this is really your email address'}
              </Text>
            </View>
            {!emailVerified && (
              <TouchableOpacity
                onPress={verificationSent ? handleCheckVerification : handleSendVerification}
                className="bg-accent px-3 py-2 rounded-xl"
              >
                <Text className="text-white text-xs font-display font-black">{verificationSent ? 'Check' : 'Send'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Service details */}
          <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mb-3">
            Services You Offer
          </Text>
          <View className="flex-row gap-3 mb-4">
            {CATEGORY_OPTIONS.map(({ id, label, icon: Icon }) => {
              const selected = categories.includes(id);
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => toggleCategory(id)}
                  activeOpacity={0.85}
                  className={`flex-1 items-center gap-2 py-4 rounded-2xl border ${
                    selected ? 'bg-accent/10 border-accent' : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <Icon size={22} color={selected ? '#3906D2' : '#64748b'} />
                  <Text className={`text-xs font-black ${selected ? 'text-accent' : 'text-slate-500'}`}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View className="flex-row gap-3 mb-6">
            <View className="flex-1">
              <LabeledInput label="Service Radius (km)" value={radius} onChangeText={setRadius} keyboardType="number-pad" />
              <Text className="font-sans text-[11px] text-slate-400 mt-1">Suggested starting radius: {DEFAULT_SERVICE_RADIUS_KM} km. Change it to match how far you’re willing to travel (1–100 km).</Text>
            </View>
            <View className="flex-1">
              <LabeledInput label="Years of Experience" value={experience} onChangeText={setExperience} keyboardType="number-pad" />
            </View>
          </View>

          <View className="mb-6">
            <LabeledInput label="Organization invitation code (Optional)" value={organizationCode} onChangeText={setOrganizationCode} placeholder="Enter a code from your organization" />
            <Text className="font-sans text-[11px] text-slate-400 font-medium mt-1">If an organization invited you, enter its code here. It will be applied after your identity check and cleaner agreement.</Text>
          </View>

          {/* Identity verification */}
          <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mb-3">
            Identity Verification
          </Text>
          <View className="bg-slate-50 rounded-3xl p-4 border border-slate-100 mb-6 flex-row items-center gap-3">
            <View className={`w-10 h-10 rounded-2xl items-center justify-center ${isIdentityVerified ? 'bg-emerald-100' : 'bg-accent/10'}`}>
              {isIdentityVerified ? <CheckCircle2 size={18} color="#10b981" /> : <ShieldCheck size={18} color="#3906D2" />}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-display font-black text-slate-900">
                {isIdentityVerified ? 'Identity verified' : verificationStatus === 'REJECTED' ? 'Verification needs attention' : 'Identity verification'}
              </Text>
              <Text className="font-sans text-xs text-slate-500 font-medium mt-0.5">
                {isIdentityVerified ? 'Verified cleaners can accept jobs.' : verificationStatus === 'REJECTED' ? 'You cannot accept jobs yet. Contact support to correct details or appeal; a retry does not cost again.' : 'A one-time $0.50 fee comes from commission credit. Keep $1 available to accept up to $10 of offline bookings.'}
              </Text>
            </View>
            {!isIdentityVerified && (
              <TouchableOpacity
                onPress={verificationStatus === 'PENDING' ? refreshIdentityCheck : startIdentityCheck}
                disabled={isCheckingIdentity}
                className="bg-accent px-3 py-2 rounded-xl"
              >
                {isCheckingIdentity ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text className="text-white text-xs font-display font-black">{verificationStatus === 'PENDING' ? 'Check' : 'Start'}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          {!isIdentityVerified && verificationStatus !== 'PENDING' && (
            <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/wallet', params: { verification: '1' } })} className="mb-3 self-start py-2">
              <Text className="font-sans-bold text-sm text-accent">Fund verification with EcoCash</Text>
            </TouchableOpacity>
          )}
          <Text className="font-sans text-[11px] text-slate-400 font-medium mb-8 leading-relaxed">
            Our verification provider checks your identity. Detail receives the decision, not your ID images. The $0.50 fee comes from your Detail wallet. A separate $0.50 commission credit covers a $5 booking. The verification fee is non-refundable where permitted by law, except if the service was not provided. If your check is declined, you cannot accept jobs and can contact support to appeal or correct your details.
          </Text>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.85}
            className="bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
          >
            {isSubmitting ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <Text className="text-white font-display font-black text-sm uppercase tracking-widest">
                Continue to Agreement
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LabeledInput({
  icon: Icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  icon?: any;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  multiline?: boolean;
}) {
  return (
    <View>
      <Text className="text-xs font-display font-black text-slate-500 uppercase tracking-widest mb-1.5">{label}</Text>
      <View className="flex-row items-center border-2 border-slate-100 rounded-2xl px-4 bg-slate-50">
        {Icon && <Icon size={16} color="#94a3b8" style={{ marginRight: 8 }} />}
        <TextInput
          className="font-sans flex-1 py-3.5 text-sm font-bold text-slate-900"
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          multiline={multiline}
        />
      </View>
    </View>
  );
}
