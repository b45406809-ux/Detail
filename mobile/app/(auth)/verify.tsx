import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { IS_DEV } from '../../utils/env';
import { sendPhoneOTP, confirmPhoneOTP } from '../../services/phoneAuth';
import { firebaseConfig } from '../../services/firebase';

// Loaded lazily so DEV builds never bundle expo-firebase-recaptcha
let FirebaseRecaptchaVerifierModal: any = null;
if (!IS_DEV) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  FirebaseRecaptchaVerifierModal = require('expo-firebase-recaptcha').FirebaseRecaptchaVerifierModal;
}

const OTP_LENGTH = 6;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const recaptchaVerifierRef = useRef<any>(null);

  // Send OTP on mount (or resend)
  const sendCode = useCallback(async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      await sendPhoneOTP(`+1${phone}`, recaptchaVerifierRef.current);
      setResendTimer(60);
    } catch (err: any) {
      Alert.alert('Failed to Send Code', err.message ?? 'Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [phone, isSending]);

  // Auto-send on mount
  useEffect(() => {
    sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer for resend button
  useEffect(() => {
    const id = setInterval(() => setResendTimer((t) => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const handleOtpChange = (value: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((d) => d !== '') && newOtp.join('').length === OTP_LENGTH) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code: string) => {
    setIsVerifying(true);
    try {
      // DEV: signInAnonymously (accepts any 6-digit code)
      // PROD: validates SMS code against Firebase ConfirmationResult
      await confirmPhoneOTP(code);
      router.replace('/(auth)/create-profile');
    } catch (err: any) {
      const msg = err.message?.toLowerCase().includes('session')
        ? 'Your session expired. Tap "Resend Code" to get a new one.'
        : 'The code you entered is incorrect. Please try again.';
      Alert.alert('Verification Failed', msg);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = () => {
    setOtp(Array(OTP_LENGTH).fill(''));
    sendCode();
  };

  const isComplete = otp.every((d) => d !== '');

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* reCAPTCHA modal — only rendered in PROD, invisible by default */}
      {!IS_DEV && FirebaseRecaptchaVerifierModal && (
        <FirebaseRecaptchaVerifierModal
          ref={recaptchaVerifierRef}
          firebaseConfig={firebaseConfig}
          attemptInvisibleVerification
        />
      )}

      <KeyboardAvoidingView
        className="flex-1 px-6 pt-6"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-12 h-12 bg-slate-50 rounded-2xl items-center justify-center mb-8"
        >
          <ArrowLeft size={20} color="#0f172a" />
        </TouchableOpacity>

        <Text className="text-3xl font-black text-slate-900 tracking-tight mb-2">
          Enter the code
        </Text>
        <Text className="text-base text-slate-500 font-medium mb-10">
          {IS_DEV
            ? 'DEV mode — enter any 6 digits to continue'
            : `We sent a 6-digit code to\n`}
          {!IS_DEV && <Text className="text-slate-900 font-black">{phone}</Text>}
        </Text>

        {/* Sending indicator */}
        {isSending && (
          <View className="flex-row items-center gap-2 mb-6">
            <ActivityIndicator size="small" color="#3906d2" />
            <Text className="text-sm text-slate-400 font-medium">Sending code…</Text>
          </View>
        )}

        {/* OTP inputs */}
        <View className="flex-row gap-3 justify-center mb-8">
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputRefs.current[index] = ref; }}
              className={`w-12 h-14 border-2 rounded-2xl text-center text-xl font-black text-slate-900 ${
                digit ? 'border-accent bg-accent/5' : 'border-slate-200 bg-slate-50'
              }`}
              keyboardType="number-pad"
              maxLength={1}
              value={digit}
              onChangeText={(v) => handleOtpChange(v, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              autoFocus={index === 0}
              editable={!isVerifying}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={() => handleVerify(otp.join(''))}
          disabled={isVerifying || !isComplete || isSending}
          activeOpacity={0.85}
          className={`w-full py-5 rounded-[32px] items-center shadow-lg ${
            isComplete && !isSending ? 'bg-accent shadow-accent/30' : 'bg-slate-100'
          }`}
        >
          {isVerifying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              className={`font-black text-sm uppercase tracking-widest ${
                isComplete && !isSending ? 'text-white' : 'text-slate-400'
              }`}
            >
              Verify Code
            </Text>
          )}
        </TouchableOpacity>

        <View className="flex-row items-center justify-center mt-6">
          <Text className="text-sm text-slate-500 font-medium">Didn't receive it? </Text>
          {resendTimer > 0 ? (
            <Text className="text-sm font-black text-slate-400">Resend in {resendTimer}s</Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={isSending}>
              <Text className="text-sm font-black text-accent">Resend Code</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
