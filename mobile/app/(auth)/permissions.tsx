import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Bell, Shield } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../context/AuthContext';
import { getExpoPushToken } from '../../services/notifications';
import { GlassCard } from '../../components/glass';
import { gradients } from '../../constants/theme';

const PERMISSIONS = [
  {
    id: 'location',
    icon: MapPin,
    title: 'Location Access',
    sub: 'Required to find cleaners near you and track jobs in real-time',
    required: true,
  },
  {
    id: 'notifications',
    icon: Bell,
    title: 'Notifications',
    sub: 'Receive updates about your job status, cleaner arrival, and messages',
    required: false,
  },
];

export default function PermissionsScreen() {
  const { updateProfile } = useAuth();
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setGranted((prev) => ({ ...prev, location: status === 'granted' }));
    if (status !== 'granted') {
      Alert.alert('Location Required', 'Detail needs location access to work properly. Enable it in Settings.', [
        { text: 'OK' },
      ]);
    }
  };

  const requestNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setGranted((prev) => ({ ...prev, notifications: status === 'granted' }));
    if (status === 'granted') {
      const token = await getExpoPushToken();
      if (token) await updateProfile({ expoPushToken: token });
    }
  };

  const handlePermissionRequest = async (id: string) => {
    if (id === 'location') await requestLocation();
    else if (id === 'notifications') await requestNotifications();
  };

  const handleContinue = async () => {
    if (!granted.location) {
      Alert.alert('Location Required', 'Please grant location permission to continue.', [{ text: 'OK' }]);
      return;
    }
    setIsLoading(true);
    try {
      await updateProfile({ hasSetupPermissions: true });
      router.replace('/home');
    } catch {
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={gradients.dusk} style={{ flex: 1 }} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View className="flex-1 px-6 pt-8 pb-8 justify-between">
            <View>
              <View className="flex-row gap-2 mb-8">
                {[1, 2, 3].map((step) => (
                  <View key={step} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: '#fff' }} />
                ))}
              </View>

              <View className="w-16 h-16 bg-white/15 border border-white/25 rounded-3xl items-center justify-center mb-6">
                <Shield size={32} color="#fff" />
              </View>
              <Text className="text-3xl font-black text-white tracking-tight mb-2">Allow permissions</Text>
              <Text className="text-base text-white/60 font-medium mb-8 leading-relaxed">
                Detail needs a few permissions to match you with cleaners and keep you updated.
              </Text>

              <View className="gap-4">
                {PERMISSIONS.map(({ id, icon: Icon, title, sub, required }) => (
                  <GlassCard key={id} variant={granted[id] ? 'light' : 'light'} style={{ padding: 20 }}>
                    <View className="flex-row items-start gap-4">
                      <View
                        className="w-12 h-12 rounded-2xl items-center justify-center"
                        style={{ backgroundColor: granted[id] ? '#0FB77A' : 'rgba(57,6,210,0.1)' }}
                      >
                        <Icon size={22} color={granted[id] ? '#fff' : '#3906D2'} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 mb-1">
                          <Text className="text-sm font-black text-ink">{title}</Text>
                          {required && (
                            <View className="bg-accent/10 px-2 py-0.5 rounded-full">
                              <Text className="text-[10px] font-black text-accent uppercase tracking-wider">
                                Required
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-xs text-ink/50 font-medium leading-relaxed">{sub}</Text>
                      </View>
                    </View>

                    {!granted[id] && (
                      <TouchableOpacity
                        onPress={() => handlePermissionRequest(id)}
                        activeOpacity={0.8}
                        className="mt-4 bg-accent py-3 rounded-2xl items-center"
                      >
                        <Text className="text-white font-black text-xs uppercase tracking-widest">
                          Allow {title}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </GlassCard>
                ))}
              </View>
            </View>

            <TouchableOpacity
              onPress={handleContinue}
              disabled={isLoading}
              activeOpacity={0.85}
              className="w-full bg-white py-5 rounded-[28px] items-center mt-6"
            >
              {isLoading ? (
                <ActivityIndicator color="#3906D2" />
              ) : (
                <Text className="font-black text-sm uppercase tracking-widest" style={{ color: '#3906D2' }}>
                  Continue to App
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
