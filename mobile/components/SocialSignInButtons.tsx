// Google and Apple ID token sign-in for Supabase Auth.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import GoogleSignInButton from './GoogleSignInButton';
import { supabase } from '../services/supabase';
import { IS_MOCK } from '../utils/env';
import { ensureProfileExists } from './authProfiles';

export function SocialSignInButtons() {
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    try {
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!appleCredential.identityToken) throw new Error('No identity token returned from Apple.');
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: appleCredential.identityToken });
      if (error) throw error;
      await ensureProfileExists(data.user.id, data.user.email ?? null);
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign-In Failed', err.message || 'Please try again.');
      }
    } finally {
      setIsAppleLoading(false);
    }
  };

  if (IS_MOCK) {
    return (
      <View className="rounded-2xl border border-ink/10 bg-ink/[0.03] p-4">
        <Text className="text-center font-sans text-xs leading-5 text-ink/55">
          Social sign-in is disabled in isolated development and demo builds.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3 my-1">
        <View className="flex-1 h-px bg-ink/10" />
        <Text className="font-sans text-ink/40 text-xs font-bold">OR CONTINUE WITH</Text>
        <View className="flex-1 h-px bg-ink/10" />
      </View>

      <GoogleSignInButton />

      {Platform.OS === 'ios' && (
        <TouchableOpacity
          onPress={handleAppleSignIn}
          disabled={isAppleLoading}
          activeOpacity={0.85}
          className="w-full bg-black flex-row items-center justify-center gap-3 py-4 rounded-[24px]"
        >
          {isAppleLoading ? <ActivityIndicator color="#fff" /> : <AppleLogo size={18} />}
          <Text className="font-display font-black text-sm text-white">Continue with Apple</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function AppleLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 384 512">
      <Path
        fill="#fff"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 37.5 59 129.3 107.2 127.8 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-84.1 102.6-121.7-65.2-30.7-61.7-90-61.7-92.1zM256.1 88.4c27.6-32.9 25.1-62.9 24.3-73.6-24.4 1.4-52.6 16.7-68.5 35.5-17.6 20.1-27.9 44.9-25.7 72.9 26.4 2.1 50.4-11.4 69.9-34.8z"
      />
    </Svg>
  );
}
