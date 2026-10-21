// Google and Apple ID token sign-in for Supabase Auth.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../services/supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Supabase's auth.users trigger creates a profile for new providers. Check
 * that it exists without writing a client-controlled role or KYC state.
 */
async function ensureProfileExists(uid: string, email: string | null) {
  const { data } = await supabase.from('users').select('id').eq('id', uid).maybeSingle();
  if (data) return;
  throw new Error(`The Supabase profile trigger did not create a profile for ${email ?? uid}.`);
}

export function SocialSignInButtons() {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  // Configure the Google provider in Supabase Auth and create OAuth client IDs
  // for the app's registered package/bundle identifiers in Google Cloud.
  // EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: a *second*, separate free OAuth
  // client (type "Android", registered with the app's package name + SHA-1 —
  // `eas credentials` prints the SHA-1) from Google Cloud Console ->
  // Credentials. expo-auth-session's Google provider requires this on
  // Android specifically — the web client ID alone throws
  // "Client Id property `androidClientId` must be defined". Both are set
  // via `eas env:set` for production builds.
  const [, , promptGoogleSignIn] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    redirectUri: AuthSession.makeRedirectUri({ scheme: 'detail' }),
  });

  const isGoogleConfigured =
    Platform.OS === 'android'
      ? !!process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
      : !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  const handleGoogleSignIn = async () => {
    if (!isGoogleConfigured) {
      Alert.alert('Not configured', 'Google sign-in needs a client ID set up first.');
      return;
    }
    setIsGoogleLoading(true);
    try {
      const result = await promptGoogleSignIn();
      if (result.type !== 'success') return;
      const idToken = result.authentication?.idToken ?? result.params?.id_token;
      if (!idToken) throw new Error('No ID token returned from Google.');
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
      if (error) throw error;
      await ensureProfileExists(data.user.id, data.user.email ?? null);
    } catch (err: any) {
      Alert.alert('Google Sign-In Failed', err.message || 'Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

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

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3 my-1">
        <View className="flex-1 h-px bg-ink/10" />
        <Text className="font-sans text-ink/40 text-xs font-bold">OR CONTINUE WITH</Text>
        <View className="flex-1 h-px bg-ink/10" />
      </View>

      <TouchableOpacity
        onPress={handleGoogleSignIn}
        disabled={isGoogleLoading}
        activeOpacity={0.85}
        className="w-full bg-white flex-row items-center justify-center gap-3 py-4 rounded-[24px] border-2 border-ink/10"
      >
        {isGoogleLoading ? <ActivityIndicator color="#3906D2" /> : <GoogleLogo size={18} />}
        <Text className="font-display font-black text-sm text-ink">Continue with Google</Text>
      </TouchableOpacity>

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

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.3C29.3 35.1 26.8 36 24 36c-5.3 0-9.6-3.3-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.2 5.3C40.4 36.4 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </Svg>
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
