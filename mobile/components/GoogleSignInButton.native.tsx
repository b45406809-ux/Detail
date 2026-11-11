import { appAlert } from '@/components/AppDialog';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';
import { supabase } from '../services/supabase';
import { ensureProfileExists } from './authProfiles';
import { GoogleLogo } from './GoogleLogo';
import { googleSupabaseNonceForIdToken } from './googleIdTokenNonce.mjs';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export default function GoogleSignInButton() {
  const [isLoading, setIsLoading] = useState(false);

  if (!webClientId || (Platform.OS === 'ios' && !iosClientId)) {
    return (
      <View className="gap-2">
        <View testID="google-sign-in-unconfigured" accessibilityRole="text" className="w-full bg-ink/[0.03] flex-row items-center justify-center gap-3 py-4 rounded-[24px] border border-ink/10">
          <GoogleLogo size={18} />
          <Text className="font-display font-black text-sm text-ink/50">Google sign-in unavailable</Text>
        </View>
        <Text className="font-sans text-xs text-center text-ink/40">Use email while Google sign-in is being configured for this device.</Text>
      </View>
    );
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const nonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      GoogleOneTapSignIn.configure({ webClientId, iosClientId, nonce: hashedNonce });
      await GoogleOneTapSignIn.checkPlayServices();

      let result = Platform.OS === 'ios' ? await GoogleOneTapSignIn.createAccount() : await GoogleOneTapSignIn.signIn();
      if (isNoSavedCredentialFoundResponse(result)) {
        result = await GoogleOneTapSignIn.createAccount();
      }
      if (isNoSavedCredentialFoundResponse(result)) {
        result = await GoogleOneTapSignIn.presentExplicitSignIn();
      }
      if (isCancelledResponse(result)) return;
      if (!isSuccessResponse(result)) throw new Error('Google did not return an account. Please try again.');

      const idToken = result.data.idToken;
      if (!idToken) throw new Error('No ID token returned from Google.');
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        // Google can return a cached ID token without a nonce claim. Supabase
        // rejects a nonce supplied for a token that has no nonce claim.
        nonce: googleSupabaseNonceForIdToken(idToken, nonce),
      });
      if (error) throw error;
      await ensureProfileExists(data.user.id, data.user.email ?? null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      appAlert('Google Sign-In Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableOpacity
      testID="google-sign-in-button"
      onPress={handleGoogleSignIn}
      disabled={isLoading}
      activeOpacity={0.85}
      className="w-full bg-white flex-row items-center justify-center gap-3 py-4 rounded-full border border-ink/20"
    >
      {isLoading ? <ActivityIndicator color="#3906D2" /> : <GoogleLogo size={18} />}
      <Text className="font-sans-bold text-base text-ink">Continue with Google</Text>
    </TouchableOpacity>
  );
}
