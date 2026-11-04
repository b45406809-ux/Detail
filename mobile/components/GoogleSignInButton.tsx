import React from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { handleAuthCallback, supabase } from '../services/supabase';
import { GoogleLogo } from './GoogleLogo';

export default function GoogleSignInButton() {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const redirectTo = 'detail://auth/callback';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Google sign-in could not be started.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return;
      await handleAuthCallback(result.url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      Alert.alert('Google Sign-In Failed', message);
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
      className="w-full bg-white flex-row items-center justify-center gap-3 py-4 rounded-[24px] border-2 border-ink/10"
    >
      {isLoading ? <ActivityIndicator color="#3906D2" /> : <GoogleLogo size={18} />}
      <Text className="font-display font-black text-sm text-ink">Continue with Google</Text>
    </TouchableOpacity>
  );
}
