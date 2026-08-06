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
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Briefcase, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { auth, db, setDoc, doc, serverTimestamp } from '../../services/firebase';
import { GlassCard } from '../../components/glass';
import { gradients } from '../../constants/theme';

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
    <View style={{ flex: 1 }}>
      <LinearGradient colors={gradients.dusk} style={{ flex: 1 }} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerClassName="flex-grow px-6 pt-8 pb-10" keyboardShouldPersistTaps="handled">
              <View className="flex-row gap-2 mb-8">
                {[1, 2, 3].map((step) => (
                  <View
                    key={step}
                    className="h-1.5 flex-1 rounded-full"
                    style={{ backgroundColor: step === 1 ? '#fff' : 'rgba(255,255,255,0.2)' }}
                  />
                ))}
              </View>

              <Text className="text-3xl font-black text-white tracking-tight mb-2">Set up your profile</Text>
              <Text className="text-base text-white/60 font-medium mb-8">
                Tell us a bit about yourself to get started
              </Text>

              <GlassCard style={{ padding: 20 }}>
                <View className="mb-6">
                  <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">Full Name</Text>
                  <TextInput
                    className="border border-white/40 rounded-2xl px-4 py-4 text-base font-medium text-ink bg-white/50"
                    placeholder="Your full name"
                    placeholderTextColor="rgba(21,2,86,0.35)"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoFocus
                  />
                </View>

                <View>
                  <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-3">I want to</Text>
                  <View className="gap-3">
                    {(
                      [
                        {
                          value: 'CUSTOMER',
                          label: 'Book a Cleaner',
                          sub: 'Find pros for my home or car',
                          icon: User,
                        },
                        {
                          value: 'CLEANER',
                          label: 'Offer Cleaning Services',
                          sub: 'Earn money by accepting cleaning jobs',
                          icon: Briefcase,
                        },
                      ] as const
                    ).map(({ value, label, sub, icon: Icon }) => (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setRole(value)}
                        activeOpacity={0.8}
                        className="flex-row items-center gap-4 p-4 rounded-3xl border"
                        style={{
                          borderColor: role === value ? '#3906D2' : 'rgba(255,255,255,0.4)',
                          backgroundColor: role === value ? 'rgba(57,6,210,0.1)' : 'rgba(255,255,255,0.4)',
                        }}
                      >
                        <View
                          className="w-12 h-12 rounded-2xl items-center justify-center"
                          style={{ backgroundColor: role === value ? '#3906D2' : 'rgba(255,255,255,0.6)' }}
                        >
                          <Icon size={22} color={role === value ? '#fff' : '#150256'} />
                        </View>
                        <View className="flex-1">
                          <Text
                            className="text-sm font-black"
                            style={{ color: role === value ? '#3906D2' : '#150256' }}
                          >
                            {label}
                          </Text>
                          <Text className="text-xs text-ink/50 font-medium mt-0.5">{sub}</Text>
                        </View>
                        {role === value && <ChevronRight size={18} color="#3906D2" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </GlassCard>

              <TouchableOpacity
                onPress={handleContinue}
                disabled={isLoading}
                activeOpacity={0.85}
                className="w-full bg-white py-5 rounded-[28px] items-center mt-8"
              >
                {isLoading ? (
                  <ActivityIndicator color="#3906D2" />
                ) : (
                  <Text className="font-black text-sm uppercase tracking-widest" style={{ color: '#3906D2' }}>
                    Continue
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
