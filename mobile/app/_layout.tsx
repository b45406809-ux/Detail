import '../global.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { configureNotificationChannels, resolveNotificationTarget } from '../services/notifications';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { handleAuthCallback, supabase } from '../services/supabase';
import { APP_ENVIRONMENT } from '../utils/env';

SplashScreen.preventAutoHideAsync();

function AuthGuard() {
  const { user, profile, isLoading, profileError, refreshProfile } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading || profileError) return;

    const inAuthGroup = segments[0] === '(auth)';
    const currentScreen = String((segments as string[])[0] === '(auth)' ? (segments as string[])[1] || '' : (segments as string[])[0] || '');
    const isPasswordRecovery = inAuthGroup && currentScreen === 'reset-password';
    const isPublicLegal = ['customer-agreement', 'privacy-policy'].includes(currentScreen);

    if (!user && !inAuthGroup && !isPublicLegal) {
      router.replace('/(auth)/splash');
    } else if (user && !isPasswordRecovery && !isPublicLegal) {
      // Keep each onboarding gate active until it is complete. Checking the
      // next gate when the user is already on the current screen causes a
      // create-profile <-> permissions redirect loop for grouped web routes.
      if (!profile?.hasAgreedToTerms) {
        if (currentScreen !== 'customer-agreement') router.replace('/customer-agreement');
      } else if (!profile?.hasCompletedProfile) {
        if (currentScreen !== 'create-profile') router.replace('/(auth)/create-profile');
      } else if (!profile?.hasSetupPermissions) {
        if (currentScreen !== 'permissions') router.replace('/(auth)/permissions');
      } else if (profile?.role === 'CLEANER' && profile.verificationStatus === 'VERIFIED' && profile.cleanerOnboardingComplete && !profile.cleanerAgreementAccepted) {
        router.replace('/cleaner-agreement');
      } else if (inAuthGroup && currentScreen !== 'customer-agreement') {
        router.replace('/home');
      }
    }
  }, [user, profile, isLoading, profileError, segments]);

  if (profileError && user) return <View className="flex-1 items-center justify-center bg-white px-8"><Text className="text-center text-base font-sans text-ink mb-5">{profileError}</Text><Pressable accessibilityRole="button" onPress={() => void refreshProfile().catch(() => undefined)} className="rounded-2xl bg-accent px-6 py-4"><Text className="font-display font-bold text-white">Try again</Text></Pressable></View>;

  return null;
}

function NotificationRouter({ response, onConsumed }: { response: Notifications.NotificationResponse | null; onConsumed: () => void }) {
  const { user, profile, isLoading, profileError } = useAuth();

  useEffect(() => {
    if (!response || !user || !profile || isLoading || profileError) return;
    // Keep a cold-start destination pending while the normal auth guard walks
    // the user through required account setup.
    if (!profile.hasAgreedToTerms || !profile.hasCompletedProfile || !profile.hasSetupPermissions) return;
    if (profile.role === 'CLEANER' && profile.verificationStatus === 'VERIFIED' && profile.cleanerOnboardingComplete && !profile.cleanerAgreementAccepted) return;

    const data = response.notification.request.content.data as { jobId?: string; supportCaseId?: string; type?: string };
    const target = resolveNotificationTarget(data);
    if (target) router.push(target);
    onConsumed();
  }, [response, user, profile, isLoading, profileError, onConsumed]);

  return null;
}

function EnvironmentIndicator() {
  if (APP_ENVIRONMENT === 'PRODUCTION') return null;
  const isDemo = APP_ENVIRONMENT === 'DEMO' || APP_ENVIRONMENT === 'LOCAL MOCK';
  return <View pointerEvents="none" style={{position:'absolute',top:54,right:12,zIndex:1000,backgroundColor:isDemo?'#991b1b':'#92400e',borderRadius:12,paddingHorizontal:10,paddingVertical:5}}><Text style={{color:'#fff',fontSize:10,fontWeight:'800',letterSpacing:1}}>{APP_ENVIRONMENT}</Text></View>;
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);
  const [pendingNotification, setPendingNotification] = useState<Notifications.NotificationResponse | null>(null);
  const notificationKey = useRef('');
  const consumeNotification = useCallback(() => {
    notificationKey.current = '';
    setPendingNotification(null);
    void Notifications.clearLastNotificationResponseAsync();
  }, []);

  useEffect(() => {
    let active = true;
    const consumeAuthUrl = (url: string | null) => {
      if (!url || !url.startsWith('detail://')) return;
      void handleAuthCallback(url).catch(error => {
        console.warn('Could not complete the authentication link:', error instanceof Error ? error.message : 'unknown error');
        Alert.alert('Link could not be completed', 'This sign-in or recovery link may have expired or already been used. Return to Detail and request a new code or recovery link.');
      });
    };
    Linking.getInitialURL().then(consumeAuthUrl).catch(() => undefined);
    const linkSubscription = Linking.addEventListener('url', event => consumeAuthUrl(event.url));
    const { data: authSubscription } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY' && active) router.replace('/(auth)/reset-password');
    });
    const queueNotification = (response: Notifications.NotificationResponse) => {
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (notificationKey.current === key) return;
      notificationKey.current = key;
      setPendingNotification(response);
    };
    let notificationSubscription: Notifications.Subscription | undefined;
    if (Platform.OS !== 'web') {
      configureNotificationChannels().catch(() => undefined);
      notificationSubscription = Notifications.addNotificationResponseReceivedListener(queueNotification);
      Notifications.getLastNotificationResponseAsync().then(response => response && queueNotification(response));
    }
    return () => {
      active = false;
      notificationSubscription?.remove();
      linkSubscription.remove();
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    Font.loadAsync({
      DMSans_400Regular,
      DMSans_500Medium,
      DMSans_600SemiBold,
      DMSans_700Bold,
      Manrope_700Bold,
      Manrope_800ExtraBold,
    })
      .then(() => setFontsLoaded(true))
      .catch(() => setFontsLoaded(true));
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <AuthProvider>
          <AuthGuard />
          <NotificationRouter response={pendingNotification} onConsumed={consumeNotification} />
          <EnvironmentIndicator />
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
            {/* Stack screens without tab bar */}
            <Stack.Screen name="booking/create" />
            <Stack.Screen name="booking/offers" />
            <Stack.Screen name="booking/confirmation" />
            <Stack.Screen name="tracking/[jobId]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="job/[jobId]" />
            <Stack.Screen name="history" />
            <Stack.Screen name="favorites" />
            <Stack.Screen name="cleaners" />
            <Stack.Screen name="organization" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="reviews" />
            <Stack.Screen name="help" />
            <Stack.Screen name="privacy-policy" />
            <Stack.Screen name="cleaner-agreement" />
            <Stack.Screen name="customer-agreement" />
            <Stack.Screen name="register-cleaner" />
            <Stack.Screen name="account/email" />
            <Stack.Screen name="+not-found" />
          </Stack>
        </AuthProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
