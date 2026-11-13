import { appAlert } from '@/components/AppDialog';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking, ScrollView, PermissionsAndroid, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Bell, Shield, Camera as CameraIcon, Images, Mic, Bluetooth } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoCamera from 'expo-camera';
import { Audio } from 'expo-av';
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
    icon: CameraIcon,
    title: 'Camera',
    sub: 'Take profile or portfolio photos, add photos to a booking, capture cleaning progress, and send photos in chat.',
    required: false,
  },
  {
    id: 'photos',
    icon: Images,
    title: 'Photos',
    sub: 'Choose profile or portfolio photos, add booking or support photos, and share images in chat.',
    required: false,
  },
  { id: 'microphone', icon: Mic, title: 'Microphone', sub: 'Use your microphone for voice calls with your booking partner.', required: false },
  ...(Platform.OS === 'android' && Number(Platform.Version) >= 31 ? [{ id: 'bluetooth', icon: Bluetooth, title: 'Bluetooth', sub: 'Connect a Bluetooth headset during voice calls.', required: false }] : []),
];

export default function PermissionsScreen() {
  const { updateProfile } = useAuth();
  const { next } = useLocalSearchParams<{next?:string}>();
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [requestingAll, setRequestingAll] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      Location.getForegroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
      ExpoCamera.Camera.getCameraPermissionsAsync(),
      ImagePicker.getMediaLibraryPermissionsAsync(),
      Audio.getPermissionsAsync(),
      Platform.OS === 'android' && Number(Platform.Version) >= 31 ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) : Promise.resolve(false),
    ]).then(async ([location, notifications, camera, photos, microphone, bluetooth]) => {
      if (!active) return;
      setGranted({ location: location.granted, notifications: notifications.granted, camera: camera.granted, photos: photos.granted, microphone: microphone.granted, bluetooth });
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
    try {
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
    } catch {
      appAlert('Notifications unavailable', 'We could not enable notifications on this device. You can try again from your profile.');
    }
  };

  const requestCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    setGranted((prev) => ({ ...prev, camera: permission.granted }));
    if (!permission.granted && !permission.canAskAgain) {
      appAlert('Camera access is off', 'You can still use Detail. Open device settings to take profile, portfolio, booking, cleaning progress, or chat photos.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
    }
  };

  const requestPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setGranted((prev) => ({ ...prev, photos: permission.granted }));
    if (!permission.granted && !permission.canAskAgain) {
      appAlert('Photo access is off', 'You can still use Detail. Open device settings to choose photos for your profile, portfolio, bookings, support requests, or chat.', [
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
      else if (id === 'microphone') {
        const result = await Audio.requestPermissionsAsync();
        setGranted(prev => ({ ...prev, microphone: result.granted }));
        if (!result.granted && !result.canAskAgain) appAlert('Microphone access is off', 'Open device settings to enable voice calls.', [{ text: 'Later', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() }]);
      }
      else if (id === 'bluetooth' && Platform.OS === 'android' && Number(Platform.Version) >= 31) {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
        setGranted(prev => ({ ...prev, bluetooth: result === PermissionsAndroid.RESULTS.GRANTED }));
        if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) appAlert('Bluetooth access is off', 'Open device settings to connect a headset.', [{ text: 'Later', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() }]);
      }
    } catch {
      appAlert('Permission unavailable', 'You can change this permission later in your device settings.');
    }
  };

  const requestAll = async () => {
    setRequestingAll(true);
    try {
      // Ask one at a time: Android and iOS cannot reliably show multiple native prompts simultaneously.
      const steps = [
        async () => { const p = await Location.requestForegroundPermissionsAsync(); setGranted(prev => ({ ...prev, location: p.granted })); },
        async () => { await configureNotificationChannels(); const p = await Notifications.requestPermissionsAsync(); setGranted(prev => ({ ...prev, notifications: p.granted })); if (p.granted) await registerCurrentPushDevice(); },
        async () => { const p = await ExpoCamera.Camera.requestCameraPermissionsAsync(); setGranted(prev => ({ ...prev, camera: p.granted })); },
        async () => { const p = await ImagePicker.requestMediaLibraryPermissionsAsync(); setGranted(prev => ({ ...prev, photos: p.granted })); },
        async () => { const p = await Audio.requestPermissionsAsync(); setGranted(prev => ({ ...prev, microphone: p.granted })); },
        ...(Platform.OS === 'android' && Number(Platform.Version) >= 31 ? [async () => { const p = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT); setGranted(prev => ({ ...prev, bluetooth: p === PermissionsAndroid.RESULTS.GRANTED })); }] : []),
      ];
      for (const step of steps) { try { await step(); } catch (error) { console.warn('Permission request failed:', error); } }
    } finally { setRequestingAll(false); }
  };

  const handleContinue = async () => {
    setIsLoading(true);
    try {
      await updateProfile({ hasSetupPermissions: true });
      router.replace(next==='cleaner'?'/register-cleaner':'/home');
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
            Choose which permissions to allow. You can change them later in your device settings.
          </Text>
          <Text className="font-sans text-xs text-ink/50 mb-5">Cleaners may also be asked for background location when they choose to go online.</Text>

          <TouchableOpacity accessibilityRole="button" disabled={requestingAll} onPress={() => void requestAll()} className="mb-5 rounded-2xl bg-accent py-4 items-center"><Text className="text-white font-display font-black">{requestingAll ? 'Requesting permissions…' : 'Request permissions'}</Text></TouchableOpacity>

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
                    disabled={requestingAll}
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
          disabled={isLoading || requestingAll}
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
