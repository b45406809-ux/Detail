import { appAlert } from '@/components/AppDialog';
import { goBackSafely } from '@/utils/navigation';
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,

} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Phone, Mail, ChevronDown, Check } from 'lucide-react-native';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  authErrorMessage,
} from '../../services/supabase';
import { SocialSignInButtons } from '../../components/SocialSignInButtons';
import { CountryPickerModal } from '../../components/CountryPickerModal';
import { DEFAULT_COUNTRY, Country } from '../../constants/countries';
import { sendEmailLoginCode } from '../../services/emailAuth';

type AuthTab = 'phone' | 'email';
type EmailAuthMode = 'CODE' | 'PASSWORD';

export default function SignInScreen() {
  const passwordInputRef = useRef<TextInput>(null);
  const [tab, setTab] = useState<AuthTab>('phone');
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [isCountryPickerOpen, setIsCountryPickerOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [emailAuthMode, setEmailAuthMode] = useState<EmailAuthMode>('CODE');
  const [password, setPassword] = useState('');
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handlePhoneContinue = () => {
    const cleanDigits = phone.replace(/[^\d]/g, '');
    if (!cleanDigits) {
      appAlert('Phone required', 'Please enter your phone number.');
      return;
    }
    if (!hasAcceptedTerms) {
      appAlert(
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
        displayPhone: `${selectedCountry.code} ${selectedCountry.dialCode} ${phone.trim()}`,
      },
    });
  };

  const handleEmailAuth = async () => {
    if (isLoading) return;
    if (!email.trim()) {
      appAlert('Email required', 'Please enter your email address.');
      return;
    }
    if (emailAuthMode === 'CODE') {
      if (isNewAccount && !hasAcceptedTerms) {
        appAlert(
          'Accept Terms & Conditions',
          'Please review and accept Detail’s Terms of Service and Privacy Policy to create an account.',
          [
            { text: 'Review Terms', onPress: () => router.push('/customer-agreement') },
            { text: 'I Agree', onPress: () => { setHasAcceptedTerms(true); void sendEmailCode(); } },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }
      await sendEmailCode();
      return;
    }
    if (!password.trim()) {
      appAlert('Password required', 'Please enter your password.');
      return;
    }
    if (isNewAccount && !hasAcceptedTerms) {
      appAlert(
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

  const sendEmailCode = async () => {
    setIsLoading(true);
    try {
      const intent = isNewAccount ? 'REGISTER' : 'SIGN_IN';
      await sendEmailLoginCode(email, intent, hasAcceptedTerms || isNewAccount);
      router.push({ pathname: '/(auth)/verify-email', params: { email: email.trim().toLowerCase(), intent } });
    } catch (err: any) {
      appAlert('Could not send code', authErrorMessage(err, 'Please check the email address and try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const proceedWithEmailAuth = async () => {
    setIsLoading(true);
    try {
      if (isNewAccount) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password, { data: { termsAccepted: true } });
        if (!cred.user.emailVerified) {
          router.replace({ pathname: '/(auth)/verify-email', params: { email: email.trim().toLowerCase(), intent: 'REGISTER', source: 'signup' } });
          return;
        }
        router.replace('/(auth)/create-profile');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        router.replace('/home');
      }
    } catch (err: any) {
      appAlert(isNewAccount ? 'Account Creation Failed' : 'Sign In Failed', authErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerClassName="flex-grow px-6 pt-6 pb-10" keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => goBackSafely()}
            className="w-12 h-12 bg-white rounded-2xl items-center justify-center mb-8 border border-ink/10"
          >
            <ArrowLeft size={20} color="#150256" />
          </TouchableOpacity>

          <Text className="text-3xl font-display font-black text-ink tracking-tight mb-2">{isNewAccount ? 'Join Detail' : 'Welcome back'}</Text>
          <Text className="font-sans text-base text-ink/50 font-medium mb-3">{isNewAccount ? 'Create an account to book or provide cleaning services' : 'Sign in to your Detail account'}</Text>
          <View className="flex-row items-center mb-6">
            <Text className="font-sans text-sm text-ink/55">{isNewAccount ? 'Already have an account? ' : 'New to Detail? '}</Text>
            <TouchableOpacity
              testID="auth-account-mode-toggle"
              onPress={() => {
                setIsNewAccount(!isNewAccount);
                setHasAcceptedTerms(false);
                if (!isNewAccount) {
                  setTab('email');
                  setEmailAuthMode('PASSWORD');
                }
              }}
            >
              <Text className="font-display font-black text-sm text-accent">{isNewAccount ? 'Sign in' : 'Create account'}</Text>
            </TouchableOpacity>
          </View>

          <View>
                {/* Tab switcher */}
                <View className="flex-row bg-ink/5 rounded-xl p-1 mb-6">
                  {(['phone', 'email'] as AuthTab[]).map((t) => (
                    <TouchableOpacity
                      key={t}
                      testID={`auth-${t}-tab`}
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
                        className={`text-sm font-sans-bold`}
                        style={{ color: tab === t ? '#0F0B2E' : 'rgba(15,11,46,0.5)' }}
                      >
                        {t === 'phone' ? 'SMS Code' : 'Email Code'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {tab === 'phone' ? (
                  <View className="gap-4">
                    <View>
                      <Text className="text-sm font-sans text-ink/60 mb-2">
                        Phone Number
                      </Text>
                      <View className="flex-row items-center rounded-2xl overflow-hidden bg-ink/5">
                        {/* Country code selector button */}
                        <TouchableOpacity
                          onPress={() => setIsCountryPickerOpen(true)}
                          activeOpacity={0.7}
                          className="flex-row items-center gap-1.5 px-3.5 py-4 border-r border-ink/10"
                        >
                          <Text className="font-display text-[10px] font-black text-accent">{selectedCountry.code}</Text>
                          <Text className="font-sans text-sm font-bold text-ink">{selectedCountry.dialCode}</Text>
                          <ChevronDown size={14} color="rgba(21,2,86,0.5)" />
                        </TouchableOpacity>

                        <TextInput
                          className="font-sans flex-1 px-4 py-4 text-base font-medium text-ink"
                          placeholder={selectedCountry.placeholder || '000 000 0000'}
                          placeholderTextColor="rgba(21,2,86,0.35)"
                          keyboardType="phone-pad"
                          value={phone}
                          onChangeText={setPhone}
                          autoFocus
                        />
                      </View>
                      <Text className="font-sans text-xs text-ink/50 font-medium mt-2 px-1">
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
                        <Text className="font-sans text-xs text-ink/70 leading-relaxed font-medium">
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
                      className="w-full bg-accent py-4 rounded-full items-center mt-2"
                    >
                      <Text className="text-white font-sans-bold text-base">Send Code</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="gap-4">
                    <View className="flex-row bg-ink/5 rounded-xl p-1">
                      {([
                        ['CODE', 'Email code'],
                        ['PASSWORD', 'Password'],
                      ] as const).map(([mode, label]) => (
                        <TouchableOpacity key={mode} testID={`auth-email-mode-${mode.toLowerCase()}`} onPress={() => setEmailAuthMode(mode)} className={`flex-1 items-center py-2.5 rounded-lg ${emailAuthMode === mode ? 'bg-white shadow-sm' : ''}`}>
                          <Text className={`text-xs font-black ${emailAuthMode === mode ? 'text-accent' : 'text-ink/50'}`}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View>
                      <Text className="text-sm font-sans text-ink/60 mb-2">Email</Text>
                      <TextInput
                        testID="auth-email-input"
                        className="font-sans rounded-2xl px-4 py-4 text-base text-ink bg-ink/5"
                        placeholder="you@example.com"
                        placeholderTextColor="rgba(21,2,86,0.35)"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                        returnKeyType={emailAuthMode === 'PASSWORD' ? 'next' : 'done'}
                        blurOnSubmit={emailAuthMode !== 'PASSWORD'}
                        onSubmitEditing={() => {
                          if (emailAuthMode === 'PASSWORD') passwordInputRef.current?.focus();
                          else void handleEmailAuth();
                        }}
                      />
                    </View>

                    {emailAuthMode === 'PASSWORD' && <View>
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-sm font-sans text-ink/60">Password</Text>
                        {!isNewAccount && (
                          <TouchableOpacity
                            onPress={() => router.push('/(auth)/forgot-password')}
                            activeOpacity={0.7}
                          >
                            <Text className="font-sans text-xs font-bold text-accent">Forgot password?</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <TextInput
                        ref={passwordInputRef}
                        testID="auth-password-input"
                        className="font-sans rounded-2xl px-4 py-4 text-base text-ink bg-ink/5"
                        placeholder="••••••••"
                        placeholderTextColor="rgba(21,2,86,0.35)"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                        returnKeyType="done"
                        onSubmitEditing={() => void handleEmailAuth()}
                      />
                    </View>}

                    {/* Terms acceptance checkbox */}
                    {isNewAccount && (
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
                        <Text className="font-sans text-xs text-ink/70 leading-relaxed font-medium">
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
                    )}

                    <TouchableOpacity
                      testID="auth-email-submit"
                      onPress={handleEmailAuth}
                      disabled={isLoading}
                      activeOpacity={0.85}
                      className="w-full bg-accent py-4 rounded-full items-center mt-2"
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white font-sans-bold text-base">
                          {emailAuthMode === 'CODE' ? 'Send Email Code' : isNewAccount ? 'Create Account' : 'Sign In'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View className="mt-6 flex-row items-center gap-3"><View className="h-px bg-ink/10 flex-1" /><Text className="font-sans text-xs text-ink/50">or continue with</Text><View className="h-px bg-ink/10 flex-1" /></View>
              <View className="mt-4">
                <SocialSignInButtons />
              </View>

          {/* Legal footer links */}
          <View className="mt-10 items-center">
            <View className="flex-row flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <TouchableOpacity onPress={() => router.push('/customer-agreement')} activeOpacity={0.7}>
                <Text className="font-sans text-xs font-bold text-ink/60">Customer Agreement</Text>
              </TouchableOpacity>
              <Text className="font-sans text-ink/30">•</Text>
              <TouchableOpacity onPress={() => router.push('/cleaner-agreement')} activeOpacity={0.7}>
                <Text className="font-sans text-xs font-bold text-ink/60">Cleaner Agreement</Text>
              </TouchableOpacity>
              <Text className="font-sans text-ink/30">•</Text>
              <TouchableOpacity onPress={() => router.push('/privacy-policy')} activeOpacity={0.7}>
                <Text className="font-sans text-xs font-bold text-ink/60">Privacy Policy</Text>
              </TouchableOpacity>
            </View>
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
