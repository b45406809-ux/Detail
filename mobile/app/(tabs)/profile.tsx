import { showPermissionDenied } from '@/utils/permissionPrompt';
import { appAlert } from '@/components/AppDialog';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,

  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  User,
  ChevronRight,
  History,
  Shield,
  Bell,
  LogOut,
  Star,
  Briefcase,
  HelpCircle,
  FileText,
  Heart,
  Repeat,
  Camera,
  Building2,
  Mail,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { auth, clearLocalSession, signOut, supabase } from '../../services/supabase';
import { callFunction } from '../../services/functions';
import { stopCleanerLocationUpdates } from '../../services/locationTracking';
import { uploadProfilePhoto } from '../../services/storage';
import { hasCurrentPushDevice, registerCurrentPushDevice, unregisterCurrentPushDevice } from '../../services/pushRegistration';
import { configureNotificationChannels } from '../../services/notifications';
import { StarRating } from '../../components/StarRating';

export default function ProfileScreen() {
  const { user, profile, updateProfile } = useAuth();
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [communication, setCommunication] = useState({emailEnabled:false,pushEnabled:false,inAppEnabled:false,smsEnabled:false,whatsappEnabled:false,inactivityRemindersEnabled:false});
  const [savingCommunication, setSavingCommunication] = useState(false);
  useEffect(() => { hasCurrentPushDevice().then(setNotificationsOn).catch(() => setNotificationsOn(false)); }, [user?.uid]);
  useEffect(() => { if(user?.uid) callFunction<{}, {preferences:typeof communication}>('getCommunicationPreferences').then(result=>setCommunication(result.preferences)).catch(()=>undefined); }, [user?.uid]);

  const setCommunicationPreference = async (key:keyof typeof communication,value:boolean) => {
    const next={...communication,[key]:value};
    if(value&&key==='inactivityRemindersEnabled'&&!next.pushEnabled&&!next.inAppEnabled){appAlert('Choose a reminder destination','Turn on push or in-app announcements before enabling inactivity reminders.');return;}
    setSavingCommunication(true);
    try{const result=await callFunction<Record<string,boolean>,{preferences:typeof communication}>('updateCommunicationPreferences',{[key]:value});setCommunication(result.preferences);}
    catch(error){appAlert('Could not save communication choices',error instanceof Error?error.message:'Please try again.');}
    finally{setSavingCommunication(false);}
  };

  const setPushNotifications = async (enabled: boolean) => {
    if (!enabled) {
      try { await unregisterCurrentPushDevice(); setNotificationsOn(false); }
      catch { appAlert('Could not update notification settings', 'Please try again.'); }
      return;
    }
    try {
      if (Platform.OS === 'android' && Constants.expoConfig?.extra?.androidPushConfigured === false) {
        appAlert('Notifications unavailable', 'Notifications are not configured in this version of Detail. Please update the app when an updated version is available.');
        return;
      }
      await configureNotificationChannels();
      const permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) { showPermissionDenied('Allow notifications to receive booking and payment updates.', permission.canAskAgain); return; }
      if (!await registerCurrentPushDevice()) { appAlert('Notifications unavailable', 'Detail could not register this device for push notifications. Check Google Play services and your connection, then try again.'); return; }
      setNotificationsOn(true);
    }
    catch { appAlert('Could not enable notifications', 'Please try again.'); }
  };

  const handlePickProfilePhoto = async () => {
    appAlert('Update Profile Picture', 'Choose how you would like to set your photo', [
      {
        text: 'Take Photo',
        onPress: () => pickImage(true),
      },
      {
        text: 'Choose from Gallery',
        onPress: () => pickImage(false),
      },
      ...(profile?.photoURL
        ? [
            {
              text: 'Remove Photo',
              style: 'destructive' as const,
              onPress: async () => {
                try {
                  await updateProfile({ photoURL: '' });
                } catch {
                  appAlert('Error', 'Failed to remove photo.');
                }
              },
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickImage = async (fromCamera: boolean) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showPermissionDenied('Allow camera or photo access to update your profile picture.', permission.canAskAgain);
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setIsUploadingPhoto(true);
      const photoUrl = await uploadProfilePhoto(result.assets[0].uri);
      await updateProfile({ photoURL: photoUrl });
    } catch {
      appAlert('Upload failed', 'Could not upload profile picture. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Uber-style mode switch. Going CUSTOMER -> CLEANER is gated: the cleaner
  // registration form (register-cleaner.tsx) and the Cleaner Agreement
  // acceptance must both be done first. Once done, switching back and forth
  // is instant. Going CLEANER -> CUSTOMER never needs a gate.
  const handleSwitchRole = () => {
    if (profile?.role === 'CUSTOMER') {
      if (profile.cleanerOnboardingComplete && profile.hasAgreedToTerms
        && profile.cleanerAgreementAccepted && profile.verificationStatus === 'VERIFIED') {
        callFunction('setActiveRole', { role: 'CLEANER' }).catch((e:any) => appAlert('Could not switch role', e.message ?? 'Try again.'));
      } else {
        router.push('/register-cleaner');
      }
    } else if (profile?.role === 'CLEANER') {
      callFunction('setActiveRole', { role: 'CUSTOMER' }).then(() => {
        stopCleanerLocationUpdates().catch((error) => console.warn('[location] could not stop after role switch:', error));
      }).catch((e:any) => appAlert('Could not switch role', e.message ?? 'Try again.'));
    }
  };

  const handleDeleteAccount = () => {
    appAlert('Delete account?', 'You must have signed in recently. Active bookings or unresolved payments must be completed first. This cannot be undone.', [
      { text: 'Keep account', style: 'cancel' },
      { text: 'Delete permanently', style: 'destructive', onPress: async () => {
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const appleLinked = !!authUser?.identities?.some(identity => identity.provider === 'apple');
          let appleAuthorizationCode: string | undefined;
          if (appleLinked) {
            try {
              const appleCredential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
              appleAuthorizationCode = appleCredential.authorizationCode ?? undefined;
            } catch (appleError: any) {
              if (appleError?.code !== 'ERR_REQUEST_CANCELED') {
                console.warn('Could not obtain a fresh Apple authorization code for account deletion.');
              }
            }
          }
          const result = await callFunction<{ confirmation: string; appleAuthorizationCode?: string }, { success: boolean; appleRevocation?: string }>('deleteAccount', { confirmation: 'DELETE', appleAuthorizationCode });
          await stopCleanerLocationUpdates().catch(() => {});
          await clearLocalSession();
          router.replace('/(auth)/welcome');
          if (result.appleRevocation === 'MANUAL_REQUIRED') {
            appAlert('Finish Apple sign-in cleanup', 'Your Detail account was deleted. Detail could not revoke the Apple sign-in authorization automatically. On your iPhone, open Settings → your name → Sign in with Apple → Detail → Stop Using Apple ID.');
          }
        }
        catch (error: any) {
          if (error?.message === 'RECENT_LOGIN_REQUIRED') {
            appAlert('Sign in again to continue', 'Account deletion requires a recent sign-in. Sign out, sign in again, then retry deletion.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign in again', onPress: async () => { await signOut(auth); router.replace('/(auth)/sign-in'); } },
            ]);
          } else appAlert('Cannot delete account', error?.message ?? 'Please sign in again and retry.');
        }
      } },
    ]);
  };

  const handleSignOut = () => {
    appAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await stopCleanerLocationUpdates().catch((error) => console.warn('[location] could not stop before sign out:', error));
          if (profile?.role === 'CLEANER') {
            let timeout: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([
              callFunction('updateCleanerPresence', { status: 'OFFLINE' }).catch((error) => {
                console.warn('[location] could not confirm offline before sign out:', error);
              }),
              new Promise<void>((resolve) => { timeout = setTimeout(resolve, 2_000); }),
            ]);
            if (timeout) clearTimeout(timeout);
          }
          await signOut(auth);
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  const MENU_ITEMS = [
    {
      group: 'Account',
      items: [
        {
          icon: Mail,
          label: profile?.email ? 'Email address' : 'Add verified email',
          sub: profile?.email ? 'Manage your sign-in and payment contact' : 'Required for cleaner registration and Paynow payments',
          onPress: () => router.push('/account/email'),
        },
        {
          icon: History,
          label: 'Service History',
          sub: 'Past bookings and jobs',
          onPress: () => router.push('/history'),
        },
        ...(profile?.role === 'CUSTOMER'
          ? [
              {
                icon: Heart,
                label: 'Favorites',
                sub: 'Your saved cleaners',
                onPress: () => router.push('/favorites'),
              },
            ]
          : []),
        ...(profile?.role === 'CUSTOMER'
          ? [
              {
                icon: Building2,
                label: profile?.accountType === 'ORGANIZATION' ? 'Organization Dashboard' : 'Register Organization',
                sub: profile?.accountType === 'ORGANIZATION' ? 'Invite and manage your cleaners' : 'Manage your cleaning team and KYC status',
                onPress: () => router.push('/organization'),
              },
            ]
          : []),
        ...(profile?.role === 'CLEANER'
          ? [
              {
                icon: Star,
                label: 'My Reviews',
                sub: 'Ratings from customers',
                onPress: () => router.push('/reviews'),
              },
              {
                icon: Briefcase,
                label: 'My Portfolio',
                sub: 'Showcase your work',
                onPress: () => router.push('/portfolio'),
              },
            ]
          : []),
        {
          icon: Repeat,
          label: profile?.role === 'CLEANER' ? 'Switch to Customer' : 'Switch to Cleaner',
          sub:
            profile?.role === 'CLEANER'
              ? 'Go back to booking cleaners'
              : 'Start earning by accepting jobs',
          onPress: handleSwitchRole,
        },
      ],
    },
    {
      group: 'Legal',
      items: [
        {
          icon: FileText,
          label: 'Privacy Policy',
          sub: 'How we handle your data',
          onPress: () => router.push('/privacy-policy'),
        },
        ...(profile?.role === 'CUSTOMER'
          ? [
              {
                icon: FileText,
                label: 'Customer Agreement',
                sub: 'Platform terms for customers',
                onPress: () => router.push('/customer-agreement'),
              },
            ]
          : []),
        ...(profile?.role === 'CLEANER'
          ? [
              {
                icon: Shield,
                label: 'Cleaner Agreement',
                sub: 'Platform terms for cleaners',
                onPress: () => router.push('/cleaner-agreement'),
              },
            ]
          : []),
      ],
    },
    {
      group: 'Support',
      items: [
        {
          icon: HelpCircle,
          label: 'Help & Support',
          sub: 'FAQs and contact us',
          onPress: () => router.push('/help'),
        },
      ],
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-5 pt-4 pb-4">
          <Text className="text-2xl font-display font-black text-slate-900 tracking-tight">Profile</Text>
        </View>

        {/* Profile card */}
        <View className="mx-5 mb-6 bg-white rounded-4xl p-6 border border-slate-100 shadow-sm">
          <View className="flex-row items-center gap-4">
            <TouchableOpacity
              onPress={handlePickProfilePhoto}
              disabled={isUploadingPhoto}
              activeOpacity={0.8}
              className="relative"
            >
              <View className="w-16 h-16 bg-accent rounded-3xl items-center justify-center overflow-hidden border border-slate-200">
                {isUploadingPhoto ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : profile?.photoURL ? (
                  <Image source={{ uri: profile.photoURL }} className="w-full h-full" />
                ) : (
                  <Text className="text-2xl font-display font-black text-white">
                    {profile?.displayName?.charAt(0) ?? '?'}
                  </Text>
                )}
              </View>
              <View className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-accent items-center justify-center border-2 border-white shadow-xs">
                <Camera size={11} color="#fff" />
              </View>
            </TouchableOpacity>

            <View className="flex-1">
              <Text className="text-xl font-display font-black text-slate-900">
                {profile?.displayName ?? 'User'}
              </Text>
              <Text className="font-sans text-sm text-slate-500 font-medium">{user?.email}</Text>
              <View className="flex-row items-center gap-2 mt-1">
                <View
                  className={`px-2.5 py-1 rounded-full ${
                    profile?.role === 'CLEANER' ? 'bg-accent/10' : 'bg-emerald-50'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-black uppercase tracking-wider ${
                      profile?.role === 'CLEANER' ? 'text-accent' : 'text-emerald-700'
                    }`}
                  >
                    {profile?.role ?? 'CUSTOMER'}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={handlePickProfilePhoto}
              className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center border border-slate-100"
            >
              <Camera size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          {profile?.role === 'CLEANER' && (
            <View className="flex-row gap-3 mt-5 pt-5 border-t border-slate-100">
              {[
                { label: 'Jobs', value: profile.jobsCompleted ?? 0 },
                { label: 'Rating', value: profile.ratingAverage?.toFixed(1) ?? '—' },
                { label: 'Balance', value: `$${profile.balance?.toFixed(0) ?? 0}` },
              ].map(({ label, value }) => (
                <View key={label} className="flex-1 items-center">
                  <Text className="text-lg font-display font-black text-slate-900">{String(value)}</Text>
                  <Text className="font-sans text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Settings toggle */}
        <View className="mx-5 mb-4 bg-white rounded-3xl px-5 py-4 flex-row items-center justify-between border border-slate-100">
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 bg-accent/10 rounded-2xl items-center justify-center">
              <Bell size={18} color="#3906d2" />
            </View>
            <View>
              <Text className="text-sm font-display font-black text-slate-900">Notifications</Text>
              <Text className="font-sans text-xs text-slate-400 font-medium">Job updates and alerts</Text>
            </View>
          </View>
          <Switch
            value={notificationsOn}
            onValueChange={setPushNotifications}
            trackColor={{ false: '#e2e8f0', true: '#3906d2' }}
            thumbColor="#fff"
          />
        </View>

        <View className="mx-5 mb-4 bg-white rounded-3xl px-5 py-5 border border-slate-100">
          <Text className="text-sm font-display font-black text-slate-900">Marketing and reminders</Text>
          <Text className="font-sans text-xs leading-5 text-slate-500 mt-1 mb-3">Choose how Detail may send product news. These choices are separate from booking and payment alerts. You can change them here at any time.</Text>
          {([
            ['emailEnabled','Email','Product announcements and offers by email.'],
            ['pushEnabled','Push announcements','Promotional push notifications on this device. Enable Notifications above too.'],
            ['inAppEnabled','In-app announcements','Promotional messages in your Detail notifications inbox.'],
            ['smsEnabled','SMS','Marketing texts from Detail. Carrier charges may apply. Each campaign includes a link to stop these messages.'],
            ['whatsappEnabled','WhatsApp','Marketing messages from Detail on WhatsApp. Each campaign includes a link to stop these messages.'],
            ['inactivityRemindersEnabled','Come-back reminders','A reminder after 7 days without opening Detail; at most once per inactive period.'],
          ] as const).map(([key,title,description])=><View key={key} className="flex-row items-center justify-between gap-4 py-3 border-t border-slate-100">
            <View className="flex-1"><Text className="font-sans-bold text-sm text-slate-800">{title}</Text><Text className="font-sans text-xs leading-4 text-slate-500 mt-0.5">{description}</Text></View>
            <Switch disabled={savingCommunication} value={communication[key]} onValueChange={value=>void setCommunicationPreference(key,value)} trackColor={{false:'#e2e8f0',true:'#3906d2'}} thumbColor="#fff" />
          </View>)}
        </View>

        {/* Menu groups */}
        {MENU_ITEMS.map(({ group, items }) => (
          <View key={group} className="mx-5 mb-4">
            <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
              {group}
            </Text>
            <View className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
              {items.map(({ icon: Icon, label, sub, onPress }, idx) => (
                <TouchableOpacity
                  key={label}
                  onPress={onPress}
                  className={`flex-row items-center gap-4 px-5 py-4 ${
                    idx < items.length - 1 ? 'border-b border-slate-50' : ''
                  }`}
                  activeOpacity={0.7}
                >
                  <View className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center">
                    <Icon size={18} color="#64748b" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-display font-black text-slate-900">{label}</Text>
                    <Text className="font-sans text-xs text-slate-400 font-medium mt-0.5">{sub}</Text>
                  </View>
                  <ChevronRight size={16} color="#cbd5e1" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={handleDeleteAccount} className="mx-5 mb-3 py-4 rounded-3xl items-center border border-red-200" activeOpacity={0.8}>
          <Text className="text-red-600 font-display font-black text-sm uppercase tracking-wider">Delete Account</Text>
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity
          onPress={handleSignOut}
          className="mx-5 mb-10 bg-red-50 py-4 rounded-3xl flex-row items-center justify-center gap-3 border border-red-100"
          activeOpacity={0.8}
        >
          <LogOut size={18} color="#ef4444" />
          <Text className="text-red-500 font-display font-black text-sm uppercase tracking-wider">Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
