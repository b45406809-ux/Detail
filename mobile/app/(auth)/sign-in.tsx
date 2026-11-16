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
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react-native';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  authErrorMessage,
} from '../../services/supabase';
import { SocialSignInButtons } from '../../components/SocialSignInButtons';

export default function SignInScreen() {
  const passwordInputRef = useRef<TextInput>(null);
  const passwordConfirmationInputRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailAuth = async () => {
    if (isLoading) return;
    if (!email.trim()) {
      appAlert('Email required', 'Please enter your email address.');
      return;
    }
    if (!password.trim()) {
      appAlert('Password required', 'Please enter your password.');
      return;
    }
    if (isNewAccount && password !== passwordConfirmation) {
      appAlert('Passwords do not match', 'Enter the same password in both fields.');
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
                setPassword('');
                setPasswordConfirmation('');
              }}
            >
              <Text className="font-display font-black text-sm text-accent">{isNewAccount ? 'Sign in' : 'Create account'}</Text>
            </TouchableOpacity>
          </View>

          <View>
            <Text className="font-sans text-xs text-ink/50 mb-4">
              {isNewAccount
                ? 'We’ll send one email verification code when you create your account. Cleaners verify their phone number during registration.'
                : 'Sign in with your password, Google, or Apple.'}
            </Text>
            <View className="gap-4">

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
                        returnKeyType="next"
                        onSubmitEditing={() => {
                          passwordInputRef.current?.focus();
                        }}
                      />
                    </View>

                    <View>
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
                      <View className="flex-row items-center rounded-2xl bg-ink/5">
                      <TextInput
                        ref={passwordInputRef}
                        testID="auth-password-input"
                        className="flex-1 font-sans px-4 py-4 text-base text-ink"
                        placeholder="••••••••"
                        placeholderTextColor="rgba(21,2,86,0.35)"
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                        returnKeyType={isNewAccount ? 'next' : 'done'}
                        onSubmitEditing={() => {
                          if (isNewAccount) passwordConfirmationInputRef.current?.focus();
                          else void handleEmailAuth();
                        }}
                      />
                      <TouchableOpacity
                        testID="auth-password-visibility-toggle"
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                        onPress={() => setShowPassword((visible) => !visible)}
                        className="px-4 items-center justify-center"
                      >
                        {showPassword ? <EyeOff size={20} color="#150256" /> : <Eye size={20} color="#150256" />}
                      </TouchableOpacity>
                      </View>
                    </View>
                    {isNewAccount && <View>
                      <Text className="text-sm font-sans text-ink/60 mb-2">Confirm password</Text>
                      <View className="flex-row items-center rounded-2xl bg-ink/5">
                        <TextInput
                          ref={passwordConfirmationInputRef}
                          testID="auth-password-confirmation-input"
                          className="flex-1 font-sans px-4 py-4 text-base text-ink"
                          placeholder="••••••••"
                          placeholderTextColor="rgba(21,2,86,0.35)"
                          secureTextEntry={!showPasswordConfirmation}
                          value={passwordConfirmation}
                          onChangeText={setPasswordConfirmation}
                          returnKeyType="done"
                          onSubmitEditing={() => void handleEmailAuth()}
                        />
                        <TouchableOpacity
                          testID="auth-password-confirmation-visibility-toggle"
                          accessibilityRole="button"
                          accessibilityLabel={showPasswordConfirmation ? 'Hide confirm password' : 'Show confirm password'}
                          onPress={() => setShowPasswordConfirmation((visible) => !visible)}
                          className="px-4 items-center justify-center"
                        >
                          {showPasswordConfirmation ? <EyeOff size={20} color="#150256" /> : <Eye size={20} color="#150256" />}
                        </TouchableOpacity>
                      </View>
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
                        <Text className="text-white font-sans-bold text-base">{isNewAccount ? 'Create Account' : 'Sign In'}</Text>
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
