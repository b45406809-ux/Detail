import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Phone, Mail, ChevronDown, Check } from 'lucide-react-native';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  db,
  setDoc,
  doc,
  serverTimestamp,
} from '../../services/firebase';
import { GlassCard } from '../../components/glass';
import { SocialSignInButtons } from '../../components/SocialSignInButtons';
import { CountryPickerModal } from '../../components/CountryPickerModal';
import { DEFAULT_COUNTRY, Country } from '../../constants/countries';

type AuthTab = 'phone' | 'email';

export default function SignInScreen() {
  const [tab, setTab] = useState<AuthTab>('phone');
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [isCountryPickerOpen, setIsCountryPickerOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handlePhoneContinue = () => {
    const cleanDigits = phone.replace(/[^\d]/g, '');
    if (!cleanDigits) {
      Alert.alert('Phone required', 'Please enter your phone number.');
      return;
    }
    if (!hasAcceptedTerms) {
      Alert.alert(
        'Accept Terms & Conditions',
        'Please review and accept Detail’s Terms of Service and Privacy Policy to continue.',
        [
          { text: 'Review Terms', onPress: () => router.push('/customer-agreement') },
          { text: 'I Agree', onPress: () => { setHasAcceptedTerms(true); proceedWithPhone(cleanDigits); } },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }
    proceedWithPhone(cleanDigits);
  };

  const proceedWithPhone = (cleanDigits: string) => {
    // Strip leading zero if provided (e.g. 0771234567 -> 771234567)
    const normalizedDigits = cleanDigits.startsWith('0') ? cleanDigits.slice(1) : cleanDigits;
    const fullPhoneNumber = `${selectedCountry.dialCode}${normalizedDigits}`;
    router.push({
      pathname: '/(auth)/verify',
      params: {
        phone: fullPhoneNumber,
        displayPhone: `${selectedCountry.flag} ${selectedCountry.dialCode} ${phone.trim()}`,
      },
    });
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (isNewAccount && !hasAcceptedTerms) {
      Alert.alert(
        'Accept Terms & Conditions',
        'Please review and accept Detail’s Terms of Service and Privacy Policy to create an account.',
        [
          { text: 'Review Terms', onPress: () => router.push('/customer-agreement') },
          { text: 'I Agree', onPress: () => { setHasAcceptedTerms(true); proceedWithEmailAuth(); } },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }
    await proceedWithEmailAuth();
  };

  const proceedWithEmailAuth = async () => {
    setIsLoading(true);
    try {
      if (isNewAccount) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: '',
          photoURL: '',
          role: 'CUSTOMER',
          balance: 0,
          status: 'AVAILABLE',
          hasCompletedProfile: false,
          hasSetupPermissions: false,
          hasAgreedToTerms: true,
          createdAt: serverTimestamp(),
        });
        router.replace('/(auth)/create-profile');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        router.replace('/home');
      }
    } catch (err: any) {
      const message =
        err.code === 'auth/user-not-found'
          ? 'No account found. Try creating one.'
          : err.code === 'auth/wrong-password'
          ? 'Incorrect password.'
          : err.code === 'auth/invalid-email'
          ? 'Invalid email address.'
          : 'Authentication failed. Please try again.';
      Alert.alert('Sign In Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerClassName="flex-grow px-6 pt-6 pb-10" keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-12 h-12 bg-white rounded-2xl items-center justify-center mb-8 border border-ink/10"
          >
            <ArrowLeft size={20} color="#150256" />
          </TouchableOpacity>

          <Text className="text-3xl font-black text-ink tracking-tight mb-2">Welcome back</Text>
          <Text className="text-base text-ink/50 font-medium mb-8">Sign in to your Detail account</Text>

          <GlassCard style={{ padding: 20 }}>
                {/* Tab switcher */}
                <View className="flex-row bg-white/40 rounded-2xl p-1 mb-6">
                  {(['phone', 'email'] as AuthTab[]).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setTab(t)}
                      className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl ${
                        tab === t ? 'bg-white shadow-sm' : ''
                      }`}
                    >
                      {t === 'phone' ? (
                        <Phone size={16} color={tab === t ? '#3906D2' : '#150256'} />
                      ) : (
                        <Mail size={16} color={tab === t ? '#3906D2' : '#150256'} />
                      )}
                      <Text
                        className={`text-sm font-black uppercase tracking-wider`}
                        style={{ color: tab === t ? '#3906D2' : 'rgba(21,2,86,0.5)' }}
                      >
                        {t === 'phone' ? 'Phone' : 'Email'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {tab === 'phone' ? (
                  <View className="gap-4">
                    <View>
                      <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">
                        Phone Number
                      </Text>
                      <View className="flex-row items-center border border-white/40 rounded-2xl overflow-hidden bg-white/50">
                        {/* Country code selector button */}
                        <TouchableOpacity
                          onPress={() => setIsCountryPickerOpen(true)}
                          activeOpacity={0.7}
                          className="flex-row items-center gap-1.5 px-3.5 py-4 border-r border-white/40 bg-ink/[0.02]"
                        >
                          <Text style={{ fontSize: 18 }}>{selectedCountry.flag}</Text>
                          <Text className="text-sm font-bold text-ink">{selectedCountry.dialCode}</Text>
                          <ChevronDown size={14} color="rgba(21,2,86,0.5)" />
                        </TouchableOpacity>

                        <TextInput
                          className="flex-1 px-4 py-4 text-base font-medium text-ink"
                          placeholder={selectedCountry.placeholder || '000 000 0000'}
                          placeholderTextColor="rgba(21,2,86,0.35)"
                          keyboardType="phone-pad"
                          value={phone}
                          onChangeText={setPhone}
                          autoFocus
                        />
                      </View>
                      <Text className="text-xs text-ink/50 font-medium mt-2 px-1">
                        We'll send a verification code to {selectedCountry.dialCode} {phone || '…'}
                      </Text>
                    </View>

                    {/* Terms acceptance checkbox */}
                    <TouchableOpacity
                      onPress={() => setHasAcceptedTerms(!hasAcceptedTerms)}
                      activeOpacity={0.7}
                      className="flex-row items-start gap-3 py-1"
                    >
                      <View
                        className={`w-5 h-5 rounded-md border items-center justify-center mt-0.5 ${
                          hasAcceptedTerms ? 'bg-accent border-accent' : 'border-ink/30 bg-white/60'
                        }`}
                      >
                        {hasAcceptedTerms && <Check size={14} color="#fff" strokeWidth={3} />}
                      </View>
                      <View className="flex-1">
                        <Text className="text-xs text-ink/70 leading-relaxed font-medium">
                          I agree to Detail's{' '}
                          <Text
                            onPress={() => router.push('/customer-agreement')}
                            className="font-bold text-accent underline"
                          >
                            Terms of Service
                          </Text>{' '}
                          and{' '}
                          <Text
                            onPress={() => router.push('/privacy-policy')}
                            className="font-bold text-accent underline"
                          >
                            Privacy Policy
                          </Text>
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handlePhoneContinue}
                      activeOpacity={0.85}
                      className="w-full bg-accent py-5 rounded-[24px] items-center mt-2 shadow-lg shadow-accent/30"
                    >
                      <Text className="text-white font-black text-sm uppercase tracking-widest">Send Code</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="gap-4">
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className="text-sm font-bold text-ink/70">
                        {isNewAccount ? 'Create a new account' : 'Sign in to existing account'}
                      </Text>
                      <TouchableOpacity onPress={() => setIsNewAccount(!isNewAccount)}>
                        <Text className="text-sm font-black text-accent">
                          {isNewAccount ? 'Sign in' : 'Register'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View>
                      <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">Email</Text>
                      <TextInput
                        className="border border-white/40 rounded-2xl px-4 py-4 text-base font-medium text-ink bg-white/50"
                        placeholder="you@example.com"
                        placeholderTextColor="rgba(21,2,86,0.35)"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                        autoFocus
                      />
                    </View>

                    <View>
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-xs font-black text-ink/50 uppercase tracking-widest">Password</Text>
                        {!isNewAccount && (
                          <TouchableOpacity
                            onPress={() => router.push('/(auth)/forgot-password')}
                            activeOpacity={0.7}
                          >
                            <Text className="text-xs font-bold text-accent">Forgot password?</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <TextInput
                        className="border border-white/40 rounded-2xl px-4 py-4 text-base font-medium text-ink bg-white/50"
                        placeholder="••••••••"
                        placeholderTextColor="rgba(21,2,86,0.35)"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                      />
                    </View>

                    {/* Terms acceptance checkbox */}
                    <TouchableOpacity
                      onPress={() => setHasAcceptedTerms(!hasAcceptedTerms)}
                      activeOpacity={0.7}
                      className="flex-row items-start gap-3 py-1"
                    >
                      <View
                        className={`w-5 h-5 rounded-md border items-center justify-center mt-0.5 ${
                          hasAcceptedTerms ? 'bg-accent border-accent' : 'border-ink/30 bg-white/60'
                        }`}
                      >
                        {hasAcceptedTerms && <Check size={14} color="#fff" strokeWidth={3} />}
                      </View>
                      <View className="flex-1">
                        <Text className="text-xs text-ink/70 leading-relaxed font-medium">
                          I agree to Detail's{' '}
                          <Text
                            onPress={() => router.push('/customer-agreement')}
                            className="font-bold text-accent underline"
                          >
                            Terms of Service
                          </Text>{' '}
                          and{' '}
                          <Text
                            onPress={() => router.push('/privacy-policy')}
                            className="font-bold text-accent underline"
                          >
                            Privacy Policy
                          </Text>
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleEmailAuth}
                      disabled={isLoading}
                      activeOpacity={0.85}
                      className="w-full bg-accent py-5 rounded-[24px] items-center mt-2 shadow-lg shadow-accent/30"
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white font-black text-sm uppercase tracking-widest">
                          {isNewAccount ? 'Create Account' : 'Sign In'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </GlassCard>

              <View className="mt-6">
                <SocialSignInButtons />
              </View>

          {/* Legal footer links */}
          <View className="mt-8 pt-6 border-t border-ink/10 items-center">
            <Text className="text-[11px] font-black text-ink/40 uppercase tracking-widest mb-3">
              Legal & Platform Policies
            </Text>
            <View className="flex-row flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <TouchableOpacity onPress={() => router.push('/customer-agreement')} activeOpacity={0.7}>
                <Text className="text-xs font-bold text-ink/60">Customer Agreement</Text>
              </TouchableOpacity>
              <Text className="text-ink/30">•</Text>
              <TouchableOpacity onPress={() => router.push('/cleaner-agreement')} activeOpacity={0.7}>
                <Text className="text-xs font-bold text-ink/60">Cleaner Agreement</Text>
              </TouchableOpacity>
              <Text className="text-ink/30">•</Text>
              <TouchableOpacity onPress={() => router.push('/privacy-policy')} activeOpacity={0.7}>
                <Text className="text-xs font-bold text-ink/60">Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row items-center justify-center gap-2 mt-6">
            <View className="w-4 h-4 rounded-full bg-accent/10 items-center justify-center">
              <View className="w-1.5 h-1.5 rounded-full bg-accent" />
            </View>
            <Text className="text-ink/40 text-xs font-bold">Bank-grade encryption. Fully verified pros.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CountryPickerModal
        visible={isCountryPickerOpen}
        selectedCountry={selectedCountry}
        onSelect={(country) => setSelectedCountry(country)}
        onClose={() => setIsCountryPickerOpen(false)}
      />
    </SafeAreaView>
  );
}
