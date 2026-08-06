import '../global.css';
import React, { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import {
  PublicSans_300Light,
  PublicSans_400Regular,
  PublicSans_500Medium,
  PublicSans_600SemiBold,
  PublicSans_700Bold,
  PublicSans_800ExtraBold,
  PublicSans_900Black,
} from '@expo-google-fonts/public-sans';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { IS_DEV } from '../utils/env';

SplashScreen.preventAutoHideAsync();

function AuthGuard() {
  const { user, profile, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/splash');
    } else if (user && inAuthGroup) {
      if (!profile?.hasCompletedProfile) {
        router.replace('/(auth)/create-profile');
      } else if (!profile?.hasSetupPermissions) {
        router.replace('/(auth)/permissions');
      } else {
        router.replace('/home');
      }
    }
  }, [user, profile, isLoading, segments]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  useEffect(() => {
    Font.loadAsync({
      PublicSans_300Light,
      PublicSans_400Regular,
      PublicSans_500Medium,
      PublicSans_600SemiBold,
      PublicSans_700Bold,
      PublicSans_800ExtraBold,
      PublicSans_900Black,
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
          <Stack.Screen name="notifications" />
          <Stack.Screen name="reviews" />
          <Stack.Screen name="help" />
          <Stack.Screen name="privacy-policy" />
          <Stack.Screen name="cleaner-agreement" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
