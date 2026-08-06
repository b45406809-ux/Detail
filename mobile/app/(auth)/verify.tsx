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
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { IS_DEV } from '../../utils/env';
import { sendPhoneOTP, confirmPhoneOTP } from '../../services/phoneAuth';
import { firebaseConfig } from '../../services/firebase';
import { GlassCard } from '../../components/glass';
import { gradients } from '../../constants/theme';

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

  useEffect(() => {
    sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <View style={{ flex: 1 }}>
      <LinearGradient colors={gradients.dusk} style={{ flex: 1 }} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          {!IS_DEV && FirebaseRecaptchaVerifierModal && (
            <FirebaseRecaptchaVerifierModal
              ref={recaptchaVerifierRef}
              firebaseConfig={firebaseConfig}
              attemptInvisibleVerification
            />
          )}

          <KeyboardAvoidingView className="flex-1 px-6 pt-6" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-12 h-12 bg-white/10 border border-white/15 rounded-2xl items-center justify-center mb-8"
            >
              <ArrowLeft size={20} color="#fff" />
            </TouchableOpacity>

            <Text className="text-3xl font-black text-white tracking-tight mb-2">Enter the code</Text>
            <Text className="text-base text-white/60 font-medium mb-10">
              {IS_DEV ? 'DEV mode — enter any 6 digits to continue' : `We sent a 6-digit code to\n`}
              {!IS_DEV && <Text className="text-white font-black">{phone}</Text>}
            </Text>

            {isSending && (
              <View className="flex-row items-center gap-2 mb-6">
                <ActivityIndicator size="small" color="#fff" />
                <Text className="text-sm text-white/50 font-medium">Sending code…</Text>
              </View>
            )}

            <GlassCard style={{ paddingVertical: 24, paddingHorizontal: 16 }}>
              <View className="flex-row gap-3 justify-center">
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    className="w-12 h-14 rounded-2xl text-center text-xl font-black text-ink"
                    style={{
                      backgroundColor: digit ? 'rgba(57,6,210,0.12)' : 'rgba(255,255,255,0.55)',
                      borderWidth: 2,
                      borderColor: digit ? '#3906D2' : 'rgba(255,255,255,0.6)',
                    }}
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
            </GlassCard>

            <TouchableOpacity
              onPress={() => handleVerify(otp.join(''))}
              disabled={isVerifying || !isComplete || isSending}
              activeOpacity={0.85}
              className="w-full py-5 rounded-[28px] items-center mt-8"
              style={{ backgroundColor: isComplete && !isSending ? '#fff' : 'rgba(255,255,255,0.15)' }}
            >
              {isVerifying ? (
                <ActivityIndicator color="#3906D2" />
              ) : (
                <Text
                  className="font-black text-sm uppercase tracking-widest"
                  style={{ color: isComplete && !isSending ? '#3906D2' : 'rgba(255,255,255,0.5)' }}
                >
                  Verify Code
                </Text>
              )}
            </TouchableOpacity>

            <View className="flex-row items-center justify-center mt-6">
              <Text className="text-sm text-white/50 font-medium">Didn't receive it? </Text>
              {resendTimer > 0 ? (
                <Text className="text-sm font-black text-white/30">Resend in {resendTimer}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={isSending}>
                  <Text className="text-sm font-black text-white">Resend Code</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
