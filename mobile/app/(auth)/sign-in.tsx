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
import { ArrowLeft, Check } from 'lucide-react-native';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  authErrorMessage,
} from '../../services/supabase';
import { SocialSignInButtons } from '../../components/SocialSignInButtons';
import { sendEmailLoginCode } from '../../services/emailAuth';

type EmailAuthMode = 'CODE' | 'PASSWORD';

export default function SignInScreen() {
  const passwordInputRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [emailAuthMode, setEmailAuthMode] = useState<EmailAuthMode>('CODE');
  const [password, setPassword] = useState('');
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
                  setEmailAuthMode('PASSWORD');
                }
              }}
            >
              <Text className="font-display font-black text-sm text-accent">{isNewAccount ? 'Sign in' : 'Create account'}</Text>
            </TouchableOpacity>
          </View>

          <View>
                <Text className="font-sans text-xs text-ink/50 mb-4">Cleaners verify their phone number during registration.</Text>
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
              </View>

              <View className="mt-6">
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

    </SafeAreaView>
  );
}
