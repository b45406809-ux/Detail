import '../global.css';
import React, { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { configureNotificationChannels } from '../services/notifications';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { handleAuthCallback, supabase } from '../services/supabase';

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
      if (!profile?.hasAgreedToTerms && currentScreen !== 'customer-agreement') router.replace('/customer-agreement');
      else if (!profile?.hasCompletedProfile && currentScreen !== 'create-profile') router.replace('/(auth)/create-profile');
      else if (!profile?.hasSetupPermissions && currentScreen !== 'permissions') router.replace('/(auth)/permissions');
      else if (profile?.role === 'CLEANER' && profile.verificationStatus === 'VERIFIED' && profile.cleanerOnboardingComplete && !profile.cleanerAgreementAccepted) router.replace('/cleaner-agreement');
      else if (inAuthGroup && currentScreen !== 'customer-agreement') router.replace('/home');
    }
  }, [user, profile, isLoading, profileError, segments]);

  if (profileError && user) return <View className="flex-1 items-center justify-center bg-white px-8"><Text className="text-center text-base font-sans text-ink mb-5">{profileError}</Text><Pressable accessibilityRole="button" onPress={() => void refreshProfile().catch(() => undefined)} className="rounded-2xl bg-accent px-6 py-4"><Text className="font-display font-bold text-white">Try again</Text></Pressable></View>;

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  useEffect(() => {
    let active = true;
    const consumeAuthUrl = (url: string | null) => {
      if (!url || !url.startsWith('detail://')) return;
      void handleAuthCallback(url).catch(error => {
        console.warn('Could not complete the authentication link:', error instanceof Error ? error.message : 'unknown error');
      });
    };
    Linking.getInitialURL().then(consumeAuthUrl).catch(() => undefined);
    const linkSubscription = Linking.addEventListener('url', event => consumeAuthUrl(event.url));
    const { data: authSubscription } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY' && active) router.replace('/(auth)/reset-password');
    });
    configureNotificationChannels().catch(() => undefined);
    const routeNotification = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as { jobId?: string; supportCaseId?: string; type?: string };
      if(data.supportCaseId){router.push({pathname:'/support',params:{caseId:data.supportCaseId}});return;}
      if(data.type==='INSTANT_BOOKING_OFFER'){router.push('/instant-offers');return;}
      if(data.type==='NEW_SCHEDULED_JOB'&&data.jobId){router.push({pathname:'/job/[jobId]',params:{jobId:data.jobId}});return;}
      if(data.type==='INSTANT_BOOKING_ACCEPTED'&&data.jobId){router.push({pathname:'/booking/offers',params:{jobId:data.jobId}});return;}
      if (!data.jobId) return;
      const offerTypes = ['BOOKING_CREATED', 'NEW_BID'];
      router.push({ pathname: offerTypes.includes(data.type ?? '') ? '/booking/offers' : '/tracking/[jobId]', params: { jobId: data.jobId } });
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(routeNotification);
    Notifications.getLastNotificationResponseAsync().then(response => response && routeNotification(response));
    return () => {
      active = false;
      subscription.remove();
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
