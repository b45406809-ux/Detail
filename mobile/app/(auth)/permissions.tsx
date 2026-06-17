import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Bell, Shield } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../context/AuthContext';

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
      Alert.alert(
        'Location Required',
        'Detail needs location access to work properly. Enable it in Settings.',
        [{ text: 'OK' }]
      );
    }
  };

  const requestNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setGranted((prev) => ({ ...prev, notifications: status === 'granted' }));
  };

  const handlePermissionRequest = async (id: string) => {
    if (id === 'location') await requestLocation();
    else if (id === 'notifications') await requestNotifications();
  };

  const handleContinue = async () => {
    if (!granted.location) {
      Alert.alert(
        'Location Required',
        'Please grant location permission to continue.',
        [{ text: 'OK' }]
      );
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
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-12 pb-10 justify-between">
        <View>
          {/* Progress */}
          <View className="flex-row gap-2 mb-10">
            {[1, 2, 3].map((step) => (
              <View
                key={step}
                className={`h-1.5 flex-1 rounded-full ${step <= 3 ? 'bg-accent' : 'bg-slate-100'}`}
              />
            ))}
          </View>

          {/* Header */}
          <View className="w-16 h-16 bg-accent/10 rounded-3xl items-center justify-center mb-6">
            <Shield size={32} color="#3906d2" />
          </View>
          <Text className="text-3xl font-black text-slate-900 tracking-tight mb-2">
            Allow permissions
          </Text>
          <Text className="text-base text-slate-500 font-medium mb-8 leading-relaxed">
            Detail needs a few permissions to match you with cleaners and keep you updated.
          </Text>

          {/* Permission cards */}
          <View className="gap-4">
            {PERMISSIONS.map(({ id, icon: Icon, title, sub, required }) => (
              <View
                key={id}
                className={`p-5 rounded-3xl border-2 ${
                  granted[id]
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-100 bg-slate-50'
                }`}
              >
                <View className="flex-row items-start gap-4">
                  <View
                    className={`w-12 h-12 rounded-2xl items-center justify-center ${
                      granted[id] ? 'bg-emerald-500' : 'bg-white border border-slate-100'
                    }`}
                  >
                    <Icon size={22} color={granted[id] ? '#fff' : '#3906d2'} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text className="text-sm font-black text-slate-900">{title}</Text>
                      {required && (
                        <View className="bg-accent/10 px-2 py-0.5 rounded-full">
                          <Text className="text-[10px] font-black text-accent uppercase tracking-wider">
                            Required
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-xs text-slate-500 font-medium leading-relaxed">{sub}</Text>
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
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={isLoading}
          activeOpacity={0.85}
          className="w-full bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30 mt-6"
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-black text-sm uppercase tracking-widest">
              Continue to App
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
