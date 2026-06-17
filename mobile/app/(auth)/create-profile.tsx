import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Briefcase, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  auth,
  db,
  setDoc,
  doc,
  serverTimestamp,
} from '../../services/firebase';

type Role = 'CUSTOMER' | 'CLEANER';

export default function CreateProfileScreen() {
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [isLoading, setIsLoading] = useState(false);

  const handleContinue = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    if (!user) return;

    setIsLoading(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          email: user.email ?? '',
          displayName: name.trim(),
          photoURL: '',
          role,
          balance: 0,
          status: 'AVAILABLE',
          hasCompletedProfile: true,
          hasSetupPermissions: false,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      await refreshProfile();
      router.replace('/(auth)/permissions');
    } catch (err: any) {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 pt-12 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          {/* Progress */}
          <View className="flex-row gap-2 mb-10">
            {[1, 2, 3].map((step) => (
              <View
                key={step}
                className={`h-1.5 flex-1 rounded-full ${step === 1 ? 'bg-accent' : 'bg-slate-100'}`}
              />
            ))}
          </View>

          <Text className="text-3xl font-black text-slate-900 tracking-tight mb-2">
            Set up your profile
          </Text>
          <Text className="text-base text-slate-500 font-medium mb-8">
            Tell us a bit about yourself to get started
          </Text>

          {/* Name */}
          <View className="mb-6">
            <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              Full Name
            </Text>
            <TextInput
              className="border-2 border-slate-100 rounded-2xl px-4 py-4 text-base font-medium text-slate-900 bg-slate-50"
              placeholder="Your full name"
              placeholderTextColor="#94a3b8"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoFocus
            />
          </View>

          {/* Role selector */}
          <View className="mb-10">
            <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
              I want to
            </Text>
            <View className="gap-3">
              {([
                {
                  value: 'CUSTOMER',
                  label: 'Book a Cleaner',
                  sub: 'Find professionals for my home or office',
                  icon: User,
                },
                {
                  value: 'CLEANER',
                  label: 'Offer Cleaning Services',
                  sub: 'Earn money by accepting cleaning jobs',
                  icon: Briefcase,
                },
              ] as const).map(({ value, label, sub, icon: Icon }) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setRole(value)}
                  activeOpacity={0.8}
                  className={`flex-row items-center gap-4 p-5 rounded-3xl border-2 ${
                    role === value
                      ? 'border-accent bg-accent/5'
                      : 'border-slate-100 bg-slate-50'
                  }`}
                >
                  <View
                    className={`w-12 h-12 rounded-2xl items-center justify-center ${
                      role === value ? 'bg-accent' : 'bg-white border border-slate-100'
                    }`}
                  >
                    <Icon size={22} color={role === value ? '#fff' : '#94a3b8'} />
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`text-sm font-black ${
                        role === value ? 'text-accent' : 'text-slate-900'
                      }`}
                    >
                      {label}
                    </Text>
                    <Text className="text-xs text-slate-500 font-medium mt-0.5">{sub}</Text>
                  </View>
                  {role === value && <ChevronRight size={18} color="#3906d2" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            onPress={handleContinue}
            disabled={isLoading}
            activeOpacity={0.85}
            className="w-full bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-black text-sm uppercase tracking-widest">
                Continue
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
