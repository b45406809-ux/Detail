import { appAlert } from '@/components/AppDialog';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Bell, Shield, Camera, Images } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { registerCurrentPushDevice } from '../../services/pushRegistration';
import { configureNotificationChannels } from '../../services/notifications';
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
  {
    id: 'camera',
    icon: Camera,
    title: 'Camera',
    sub: 'Take photos of the areas or vehicle you want cleaned, so cleaners can quote accurately.',
    required: false,
  },
  {
    id: 'photos',
    icon: Images,
    title: 'Photos',
    sub: 'Choose job photos from your library and attach evidence to a support request.',
    required: false,
  },
];

export default function PermissionsScreen() {
  const { updateProfile } = useAuth();
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      Location.getForegroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
      ImagePicker.getCameraPermissionsAsync(),
      ImagePicker.getMediaLibraryPermissionsAsync(),
    ]).then(async ([location, notifications, camera, photos]) => {
      if (!active) return;
      setGranted({ location: location.granted, notifications: notifications.granted, camera: camera.granted, photos: photos.granted });
      if (notifications.granted) {
        if (active) await registerCurrentPushDevice().catch((error) => console.warn('Could not save this device notification registration:', error));
      }
    }).catch((error) => console.warn('Could not read device permissions:', error));
    return () => { active = false; };
  }, [updateProfile]);

  const requestLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    setGranted((prev) => ({ ...prev, location: permission.granted }));
    if (!permission.granted) {
      appAlert('Location not enabled', 'You can still search by area. Enable location later if you want nearby results and live tracking.', [
        { text: 'Continue without location', style: 'cancel' },
        ...(!permission.canAskAgain ? [{ text: 'Open Settings', onPress: () => void Linking.openSettings() }] : []),
      ]);
    }
  };

  const requestNotifications = async () => {
    await configureNotificationChannels();
    const permission = await Notifications.requestPermissionsAsync();
    setGranted((prev) => ({ ...prev, notifications: permission.granted }));
    if (permission.granted) {
      await registerCurrentPushDevice();
    } else if (!permission.canAskAgain) {
      appAlert('Notifications are off', 'You can still use Detail. Open device settings whenever you want booking alerts.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
    }
  };

  const requestCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    setGranted((prev) => ({ ...prev, camera: permission.granted }));
    if (!permission.granted && !permission.canAskAgain) {
      appAlert('Camera access is off', 'You can still use Detail. Open device settings if you want to take job photos.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
    }
  };

  const requestPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setGranted((prev) => ({ ...prev, photos: permission.granted }));
    if (!permission.granted && !permission.canAskAgain) {
      appAlert('Photo access is off', 'You can still use Detail. Open device settings if you want to attach photos from your library.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
    }
  };

  const handlePermissionRequest = async (id: string) => {
    try {
      if (id === 'location') await requestLocation();
      else if (id === 'notifications') await requestNotifications();
      else if (id === 'camera') await requestCamera();
      else if (id === 'photos') await requestPhotos();
    } catch {
      appAlert('Permission unavailable', 'You can change this permission later in your device settings.');
    }
  };

  const handleContinue = async () => {
    setIsLoading(true);
    try {
      await updateProfile({ hasSetupPermissions: true });
      router.replace('/home');
    } catch {
      appAlert('Error', 'Failed to save settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-8 pb-8 justify-between">
        <ScrollView className="flex-1 mb-4" showsVerticalScrollIndicator={false}>
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
        </ScrollView>

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
