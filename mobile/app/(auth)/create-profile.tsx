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
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Briefcase, ChevronRight, Camera } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { auth, db, setDoc, doc, serverTimestamp } from '../../services/supabase';
import { uploadProfilePhoto } from '../../services/storage';
import { GlassCard } from '../../components/glass';

type Role = 'CUSTOMER' | 'CLEANER';

export default function CreateProfileScreen() {
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [photoURL, setPhotoURL] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handlePickPhoto = async () => {
    Alert.alert('Profile Photo', 'Add a photo so people recognize you', [
      { text: 'Take Photo', onPress: () => chooseImage(true) },
      { text: 'Choose from Gallery', onPress: () => chooseImage(false) },
      ...(photoURL ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => setPhotoURL('') }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const chooseImage = async (fromCamera: boolean) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera/photo access to add your profile photo.');
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setIsUploadingPhoto(true);
      const url = await uploadProfilePhoto(result.assets[0].uri);
      setPhotoURL(url);
    } catch {
      Alert.alert('Upload Failed', 'Could not upload photo. You can still proceed or try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

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
          photoURL: photoURL.trim(),
          role,
          balance: 0,
          status: 'AVAILABLE',
          hasCompletedProfile: true,
          hasSetupPermissions: false,
          hasAgreedToTerms: true,
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
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerClassName="flex-grow px-6 pt-8 pb-10" keyboardShouldPersistTaps="handled">
          <View className="flex-row gap-2 mb-8">
            {[1, 2, 3].map((step) => (
              <View
                key={step}
                className="h-1.5 flex-1 rounded-full"
                style={{ backgroundColor: step === 1 ? '#3906D2' : 'rgba(15,11,46,0.1)' }}
              />
            ))}
          </View>

          <Text className="text-3xl font-black text-ink tracking-tight mb-2">Set up your profile</Text>
          <Text className="text-base text-ink/50 font-medium mb-6">
            Tell us a bit about yourself to get started
          </Text>

          {/* Profile photo picker */}
          <View className="items-center mb-6">
            <TouchableOpacity
              onPress={handlePickPhoto}
              disabled={isUploadingPhoto}
              activeOpacity={0.85}
              className="relative"
            >
              <View className="w-24 h-24 rounded-full bg-accent/10 items-center justify-center border-2 border-accent overflow-hidden">
                {isUploadingPhoto ? (
                  <ActivityIndicator color="#3906D2" size="small" />
                ) : photoURL ? (
                  <Image source={{ uri: photoURL }} className="w-full h-full" />
                ) : (
                  <User size={38} color="#3906D2" />
                )}
              </View>
              <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-accent items-center justify-center border-2 border-white shadow-sm">
                <Camera size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text className="text-xs font-bold text-ink/50 mt-2">
              {photoURL ? 'Tap to change photo' : 'Add profile picture (Optional)'}
            </Text>
          </View>

          <GlassCard style={{ padding: 20 }}>
            <View className="mb-6">
              <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">Full Name</Text>
              <TextInput
                className="border border-ink/10 rounded-2xl px-4 py-4 text-base font-medium text-ink bg-ink/[0.02]"
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
                          borderColor: role === value ? '#3906D2' : 'rgba(15,11,46,0.1)',
                          backgroundColor: role === value ? 'rgba(57,6,210,0.1)' : 'rgba(15,11,46,0.02)',
                        }}
                      >
                        <View
                          className="w-12 h-12 rounded-2xl items-center justify-center"
                          style={{ backgroundColor: role === value ? '#3906D2' : 'rgba(15,11,46,0.05)' }}
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
            className="w-full bg-accent py-5 rounded-[28px] items-center mt-8 shadow-lg shadow-accent/30"
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-black text-sm uppercase tracking-widest text-white">Continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
