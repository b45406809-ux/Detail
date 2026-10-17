// Cleaner registration — collects the identity/verification info required by
// the Cleaner Agreement §4 (full name, phone, physical address) plus service details, and proves email ownership via Firebase's
// built-in email-verification flow (the OTP-equivalent — no separate email
// provider needed). Reached from profile.tsx's "Switch to Cleaner" action
// whenever cleanerOnboardingComplete or hasAgreedToTerms is missing; ends by
// routing into cleaner-agreement.tsx, which is what actually flips role.
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
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
import { auth, sendEmailVerification } from '../services/firebase';
import { callFunction } from '../services/functions';
import { ServiceCategory } from '../types';

const CATEGORY_OPTIONS: { id: ServiceCategory; label: string; icon: any }[] = [
  { id: 'HOUSE', label: 'House Cleaning', icon: HomeIcon },
  { id: 'CAR', label: 'Car Cleaning', icon: Car },
];

export default function RegisterCleanerScreen() {
  const { profile, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.displayName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [address, setAddress] = useState('');
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [radius, setRadius] = useState('15');
  const [experience, setExperience] = useState('');
  const [isCheckingIdentity, setIsCheckingIdentity] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailVerified = auth.currentUser?.emailVerified ?? false;
  const [verificationSent, setVerificationSent] = useState(false);

  const toggleCategory = (id: ServiceCategory) =>
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const handleSendVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerificationSent(true);
      Alert.alert('Check your email', 'We sent a verification link to confirm this is your email.');
    } catch {
      Alert.alert('Error', 'Could not send the verification email. Please try again.');
    }
  };

  const handleCheckVerification = async () => {
    try {
      await auth.currentUser?.reload();
      if (!auth.currentUser?.emailVerified) {
        Alert.alert('Not verified yet', 'Open the link in the email we sent, then try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not check verification status.');
    }
  };

  const verificationStatus = profile?.verificationStatus ?? 'NOT_STARTED';
  const isIdentityVerified = verificationStatus === 'VERIFIED';

  const refreshIdentityCheck = async () => {
    setIsCheckingIdentity(true);
    try {
      const result = await callFunction<undefined, { status: string }>('refreshCleanerIdentityVerification');
      if (result.status === 'VERIFIED') Alert.alert('Identity verified', 'Your identity check is complete.');
      else if (result.status === 'REJECTED') Alert.alert('Verification needs attention', 'Didit could not verify your identity. You can try again.');
      else Alert.alert('Verification pending', 'Your check is still being reviewed.');
    } catch (error) {
      Alert.alert('Could not check status', (error as { message?: string })?.message || 'Please try again.');
    } finally {
      setIsCheckingIdentity(false);
    }
  };

  const startIdentityCheck = async () => {
    Alert.alert(
      'Identity check with Didit',
      'Didit will ask you to provide identity information and documents. Didit processes that information under its privacy policy; Detail receives the verification result. Continue only if you agree.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => { void launchIdentityCheck(); } },
      ]
    );
  };

  const launchIdentityCheck = async () => {
    setIsCheckingIdentity(true);
    try {
      const session = await callFunction<{ consent: true }, { sessionUrl: string }>(
        'startCleanerIdentityVerification', { consent: true }
      );
      await WebBrowser.openBrowserAsync(session.sessionUrl);
      await refreshIdentityCheck();
    } catch (error) {
      Alert.alert('Identity check unavailable', (error as { message?: string })?.message || 'Please try again later.');
    } finally {
      setIsCheckingIdentity(false);
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !phone.trim() || !address.trim()) {
      Alert.alert('Missing info', 'Please fill in your full name, phone, and physical address.');
      return;
    }
    if (categories.length === 0) {
      Alert.alert('Pick a service', 'Choose at least one service you want to offer.');
      return;
    }
    if (!isIdentityVerified) {
      Alert.alert('Identity check required', 'Complete your Didit identity check before continuing.');
      return;
    }
    if (!emailVerified) {
      Alert.alert('Verify your email', 'Please verify your email before continuing.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateProfile({
        displayName: fullName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        serviceCategories: categories,
        serviceRadiusKm: Number(radius) || 15,
        experienceYears: Number(experience) || 0,
        cleanerOnboardingComplete: true,
      });
      router.push('/cleaner-agreement');
    } catch {
      Alert.alert('Error', 'Failed to submit your registration. Please try again.');
    } finally {
      setIsSubmitting(false);
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
        <View>
          <Text className="text-xl font-black text-slate-900">Become a Cleaner</Text>
          <Text className="text-xs text-slate-400 font-medium">Register to start accepting jobs</Text>
        </View>
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerClassName="px-5 pt-6 pb-10" keyboardShouldPersistTaps="handled">
          {/* Identity */}
          <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            Your Details
          </Text>
          <View className="gap-3 mb-6">
            <LabeledInput icon={User} label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Your full legal name" />
            <LabeledInput icon={User} label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+263 7X XXX XXXX" keyboardType="phone-pad" />
            <LabeledInput icon={MapPin} label="Physical Address" value={address} onChangeText={setAddress} placeholder="Street, suburb, city" multiline />
          </View>

          {/* Email verification */}
          <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            Email Verification
          </Text>
          <View className="bg-slate-50 rounded-3xl p-4 border border-slate-100 mb-6 flex-row items-center gap-3">
            <View className={`w-10 h-10 rounded-2xl items-center justify-center ${emailVerified ? 'bg-emerald-100' : 'bg-accent/10'}`}>
              {emailVerified ? <CheckCircle2 size={18} color="#10b981" /> : <Mail size={18} color="#3906D2" />}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-black text-slate-900">
                {emailVerified ? 'Email verified' : 'Verify your email'}
              </Text>
              <Text className="text-xs text-slate-400 font-medium mt-0.5">
                {emailVerified ? "You're all set" : 'Confirms this is really your email address'}
              </Text>
            </View>
            {!emailVerified && (
              <TouchableOpacity
                onPress={verificationSent ? handleCheckVerification : handleSendVerification}
                className="bg-accent px-3 py-2 rounded-xl"
              >
                <Text className="text-white text-xs font-black">{verificationSent ? 'Check' : 'Send'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Service details */}
          <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
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
            </View>
            <View className="flex-1">
              <LabeledInput label="Years of Experience" value={experience} onChangeText={setExperience} keyboardType="number-pad" />
            </View>
          </View>

          {/* Didit identity check */}
          <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            Identity Verification
          </Text>
          <View className="bg-slate-50 rounded-3xl p-4 border border-slate-100 mb-6 flex-row items-center gap-3">
            <View className={`w-10 h-10 rounded-2xl items-center justify-center ${isIdentityVerified ? 'bg-emerald-100' : 'bg-accent/10'}`}>
              {isIdentityVerified ? <CheckCircle2 size={18} color="#10b981" /> : <ShieldCheck size={18} color="#3906D2" />}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-black text-slate-900">
                {isIdentityVerified ? 'Identity verified' : verificationStatus === 'REJECTED' ? 'Verification needs attention' : 'Verify with Didit'}
              </Text>
              <Text className="text-xs text-slate-500 font-medium mt-0.5">
                {isIdentityVerified ? 'Your identity check is complete.' : 'Complete a secure identity check to register as a cleaner.'}
              </Text>
            </View>
            {!isIdentityVerified && (
              <TouchableOpacity
                onPress={verificationStatus === 'PENDING' ? refreshIdentityCheck : startIdentityCheck}
                disabled={isCheckingIdentity}
                className="bg-accent px-3 py-2 rounded-xl"
              >
                {isCheckingIdentity ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text className="text-white text-xs font-black">{verificationStatus === 'PENDING' ? 'Check' : 'Start'}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          <Text className="text-[11px] text-slate-400 font-medium mb-8 leading-relaxed">
            Didit securely checks your identity. Detail receives the verification result and does not store your ID images.
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
              <Text className="text-white font-black text-sm uppercase tracking-widest">
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
      <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">{label}</Text>
      <View className="flex-row items-center border-2 border-slate-100 rounded-2xl px-4 bg-slate-50">
        {Icon && <Icon size={16} color="#94a3b8" style={{ marginRight: 8 }} />}
        <TextInput
          className="flex-1 py-3.5 text-sm font-bold text-slate-900"
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
