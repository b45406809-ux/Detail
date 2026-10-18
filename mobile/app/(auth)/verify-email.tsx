import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { GlassCard } from '../../components/glass';
import { confirmEmailLoginCode, sendEmailLoginCode } from '../../services/emailAuth';

type Intent = 'SIGN_IN' | 'REGISTER';

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string; intent?: string }>();
  const email = String(params.email ?? '').trim().toLowerCase();
  const intent: Intent = params.intent === 'REGISTER' ? 'REGISTER' : 'SIGN_IN';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(60);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Enter your code', 'Type the six-digit code sent to your email.');
      return;
    }
    setBusy(true);
    try {
      await confirmEmailLoginCode(email, code, intent);
      router.replace('/home');
    } catch (error) {
      Alert.alert('Code not accepted', (error as Error).message || 'The code is incorrect or expired. Request a new code and try again.');
      setCode('');
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setBusy(true);
    try {
      await sendEmailLoginCode(email, intent, intent === 'REGISTER');
      setCode(''); setResendSeconds(60);
      Alert.alert('Code sent', `Check ${email} for a new sign-in code.`);
    } catch (error) {
      Alert.alert('Could not resend code', (error as Error).message || 'Please try again shortly.');
    } finally { setBusy(false); }
  };

  return <SafeAreaView className="flex-1 bg-white">
    <KeyboardAvoidingView className="flex-1 px-6 pt-6" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableOpacity onPress={() => router.back()} className="w-12 h-12 bg-white rounded-2xl items-center justify-center mb-8 border border-ink/10"><ArrowLeft size={20} color="#150256" /></TouchableOpacity>
      <Text className="text-3xl font-black text-ink tracking-tight mb-2">Check your email</Text>
      <Text className="text-base text-ink/50 font-medium mb-10">Enter the six-digit code sent to <Text className="font-black text-ink">{email}</Text>.</Text>
      <GlassCard style={{ padding: 20 }}>
        <TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="000000" placeholderTextColor="rgba(21,2,86,0.25)" className="text-center text-3xl font-black tracking-[10px] text-ink py-5" editable={!busy} />
      </GlassCard>
      <TouchableOpacity onPress={verify} disabled={busy || code.length !== 6} className={`mt-5 py-5 rounded-[24px] items-center ${code.length === 6 ? 'bg-accent' : 'bg-ink/10'}`}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text className={`font-black text-sm uppercase tracking-widest ${code.length === 6 ? 'text-white' : 'text-ink/30'}`}>Verify & Continue</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={resend} disabled={busy || resendSeconds > 0} className="mt-5 items-center py-3">
        <Text className={`text-sm font-black ${resendSeconds > 0 ? 'text-ink/30' : 'text-accent'}`}>{resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
