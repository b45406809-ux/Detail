import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
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
} from 'lucide-react-native';
import { Linking } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { auth, signOut } from '../../services/firebase';
import { StarRating } from '../../components/StarRating';
import { IS_MOCK } from '../../utils/env';

export default function ProfileScreen() {
  const { user, profile } = useAuth();
  const [notificationsOn, setNotificationsOn] = useState(true);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
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
                onPress: () =>
                  IS_MOCK
                    ? Alert.alert('[DEV] Portfolio', 'Portfolio upload coming in next release.')
                    : Alert.alert('Coming Soon', 'Portfolio photos are coming in the next update.'),
              },
            ]
          : []),
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
          <Text className="text-2xl font-black text-slate-900 tracking-tight">Profile</Text>
        </View>

        {/* Profile card */}
        <View className="mx-5 mb-6 bg-white rounded-4xl p-6 border border-slate-100 shadow-sm">
          <View className="flex-row items-center gap-4">
            <View className="w-16 h-16 bg-accent rounded-3xl items-center justify-center">
              <Text className="text-2xl font-black text-white">
                {profile?.displayName?.charAt(0) ?? '?'}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xl font-black text-slate-900">
                {profile?.displayName ?? 'User'}
              </Text>
              <Text className="text-sm text-slate-500 font-medium">{user?.email}</Text>
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
            <TouchableOpacity className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center border border-slate-100">
              <User size={18} color="#64748b" />
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
                  <Text className="text-lg font-black text-slate-900">{String(value)}</Text>
                  <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
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
              <Text className="text-sm font-black text-slate-900">Notifications</Text>
              <Text className="text-xs text-slate-400 font-medium">Job updates and alerts</Text>
            </View>
          </View>
          <Switch
            value={notificationsOn}
            onValueChange={setNotificationsOn}
            trackColor={{ false: '#e2e8f0', true: '#3906d2' }}
            thumbColor="#fff"
          />
        </View>

        {/* Menu groups */}
        {MENU_ITEMS.map(({ group, items }) => (
          <View key={group} className="mx-5 mb-4">
            <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
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
                    <Text className="text-sm font-black text-slate-900">{label}</Text>
                    <Text className="text-xs text-slate-400 font-medium mt-0.5">{sub}</Text>
                  </View>
                  <ChevronRight size={16} color="#cbd5e1" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign out */}
        <TouchableOpacity
          onPress={handleSignOut}
          className="mx-5 mb-10 bg-red-50 py-4 rounded-3xl flex-row items-center justify-center gap-3 border border-red-100"
          activeOpacity={0.8}
        >
          <LogOut size={18} color="#ef4444" />
          <Text className="text-red-500 font-black text-sm uppercase tracking-wider">Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
