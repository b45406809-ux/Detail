import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Bell, Shield } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../context/AuthContext';
import { getExpoPushToken } from '../../services/notifications';
import { GlassCard } from '../../components/glass';

const PERMISSIONS = [
  {
    id: 'location',
    icon: MapPin,
    title: 'Location Access',
    sub: 'Find nearby cleaners and share your location during an active booking. You can search by area without it.',
    required: false,
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

  useEffect(() => {
    let active = true;
    Promise.all([Location.getForegroundPermissionsAsync(), Notifications.getPermissionsAsync()]).then(async ([location, notifications]) => {
      if (!active) return;
      setGranted({ location: location.granted, notifications: notifications.granted });
      if (notifications.granted) {
        const token = await getExpoPushToken();
        if (active && token) await updateProfile({ expoPushToken: token }).catch((error) => console.warn('Could not save push token:', error));
      }
    }).catch((error) => console.warn('Could not read device permissions:', error));
    return () => { active = false; };
  }, [updateProfile]);

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setGranted((prev) => ({ ...prev, location: status === 'granted' }));
    if (status !== 'granted') {
      Alert.alert('Location not enabled', 'You can still search by area. Enable location later if you want nearby results and live tracking.', [
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
    try {
      if (id === 'location') await requestLocation();
      else if (id === 'notifications') await requestNotifications();
    } catch {
      Alert.alert('Permission unavailable', 'You can change this permission later in your device settings.');
    }
  };

  const handleContinue = async () => {
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
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-8 pb-8 justify-between">
        <View>
          <View className="flex-row gap-2 mb-8">
            {[1, 2, 3].map((step) => (
              <View key={step} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: '#3906D2' }} />
            ))}
          </View>

          <View className="w-16 h-16 bg-accent/10 border border-accent/20 rounded-3xl items-center justify-center mb-6">
            <Shield size={32} color="#3906D2" />
          </View>
          <Text className="text-3xl font-display font-black text-ink tracking-tight mb-2">Allow permissions</Text>
          <Text className="font-sans text-base text-ink/50 font-medium mb-8 leading-relaxed">
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
                      <Text className="text-sm font-display font-black text-ink">{title}</Text>
                      {required && (
                        <View className="bg-accent/10 px-2 py-0.5 rounded-full">
                          <Text className="text-[10px] font-display font-black text-accent uppercase tracking-wider">
                            Required
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="font-sans text-xs text-ink/50 font-medium leading-relaxed">{sub}</Text>
                  </View>
                </View>

                {!granted[id] && (
                  <TouchableOpacity
                    onPress={() => handlePermissionRequest(id)}
                    activeOpacity={0.8}
                    className="mt-4 bg-accent py-3 rounded-2xl items-center"
                  >
                    <Text className="text-white font-display font-black text-xs uppercase tracking-widest">
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
          className="w-full bg-accent py-5 rounded-[28px] items-center mt-6 shadow-lg shadow-accent/30"
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-display font-black text-sm uppercase tracking-widest text-white">Continue to App</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
