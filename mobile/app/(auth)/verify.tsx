import React, { useState, useRef, useEffect } from 'react';
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

const OTP_LENGTH = 6;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
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
    setIsLoading(true);
    try {
      // Phone auth verification goes here.
      // Full implementation requires react-native-firebase or expo-firebase-recaptcha.
      // For now, navigate to profile creation on any 6-digit code.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      router.replace('/(auth)/create-profile');
    } catch {
      Alert.alert('Verification Failed', 'The code you entered is incorrect. Please try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
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
          We sent a 6-digit code to{'\n'}
          <Text className="text-slate-900 font-black">{phone}</Text>
        </Text>

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
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={() => handleVerify(otp.join(''))}
          disabled={isLoading || otp.some((d) => !d)}
          activeOpacity={0.85}
          className={`w-full py-5 rounded-[32px] items-center shadow-lg ${
            otp.every((d) => d) ? 'bg-accent shadow-accent/30' : 'bg-slate-100'
          }`}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              className={`font-black text-sm uppercase tracking-widest ${
                otp.every((d) => d) ? 'text-white' : 'text-slate-400'
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
            <TouchableOpacity onPress={() => setResendTimer(60)}>
              <Text className="text-sm font-black text-accent">Resend Code</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
