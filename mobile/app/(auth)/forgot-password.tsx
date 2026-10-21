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
import { ArrowLeft, Mail, CheckCircle2, KeyRound } from 'lucide-react-native';
import { auth, sendPasswordResetEmail } from '../../services/supabase';
import { GlassCard } from '../../components/glass';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSendResetEmail = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Email Required', 'Please enter the email address associated with your account.');
      return;
    }

    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setIsSent(true);
    } catch (err: any) {
      let message = 'Could not send password reset email. Please verify your address and try again.';
      if (err.code === 'auth/user-not-found') {
        message = 'No account found with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Too many requests. Please wait a few moments and try again.';
      }
      Alert.alert('Reset Failed', message);
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

          {isSent ? (
            <View className="items-center text-center py-6">
              <View className="w-20 h-20 bg-emerald-50 rounded-full items-center justify-center mb-6 border-2 border-emerald-200">
                <CheckCircle2 size={42} color="#059669" />
              </View>

              <Text className="text-3xl font-black text-ink tracking-tight mb-3 text-center">
                Check your email
              </Text>
              <Text className="text-base text-ink/60 font-medium text-center mb-8 leading-relaxed px-2">
                We've sent a password reset link to <Text className="font-black text-ink">{email.trim()}</Text>. Follow the instructions in the email to reset your password.
              </Text>

              <GlassCard style={{ padding: 20, width: '100%', marginBottom: 24 }}>
                <Text className="text-xs font-bold text-ink/60 leading-relaxed text-center">
                  Didn't receive the email? Check your spam/junk folder or request a new link in a few minutes.
                </Text>
              </GlassCard>

              <TouchableOpacity
                onPress={() => setIsSent(false)}
                activeOpacity={0.8}
                className="w-full bg-ink/5 py-4 rounded-[24px] items-center mb-3 border border-ink/10"
              >
                <Text className="text-ink font-bold text-sm">Resend Link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace('/(auth)/sign-in')}
                activeOpacity={0.85}
                className="w-full bg-accent py-5 rounded-[24px] items-center shadow-lg shadow-accent/30"
              >
                <Text className="text-white font-black text-sm uppercase tracking-widest">
                  Back to Sign In
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View className="w-16 h-16 bg-accent/10 rounded-3xl items-center justify-center mb-6 border border-accent/20">
                <KeyRound size={30} color="#3906D2" />
              </View>

              <Text className="text-3xl font-black text-ink tracking-tight mb-2">
                Forgot password?
              </Text>
              <Text className="text-base text-ink/50 font-medium mb-8">
                No worries! Enter your registered email address and we'll send you a link to reset your password.
              </Text>

              <GlassCard style={{ padding: 20 }}>
                <View className="gap-4">
                  <View>
                    <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">
                      Account Email
                    </Text>
                    <View className="flex-row items-center border border-white/40 rounded-2xl bg-white/50 px-4">
                      <Mail size={18} color="rgba(21,2,86,0.4)" />
                      <TextInput
                        className="flex-1 py-4 px-3 text-base font-medium text-ink"
                        placeholder="you@example.com"
                        placeholderTextColor="rgba(21,2,86,0.35)"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                        autoFocus
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={handleSendResetEmail}
                    disabled={isLoading || !email.trim()}
                    activeOpacity={0.85}
                    className={`w-full py-5 rounded-[24px] items-center mt-3 shadow-lg ${
                      email.trim() ? 'bg-accent shadow-accent/30' : 'bg-ink/10 shadow-transparent'
                    }`}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text
                        className={`font-black text-sm uppercase tracking-widest ${
                          email.trim() ? 'text-white' : 'text-ink/30'
                        }`}
                      >
                        Send Reset Link
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </GlassCard>

              <View className="mt-8 items-center">
                <TouchableOpacity
                  onPress={() => router.back()}
                  activeOpacity={0.7}
                  className="py-2"
                >
                  <Text className="text-sm font-bold text-accent">
                    Remember your password? <Text className="font-black underline">Sign in</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
