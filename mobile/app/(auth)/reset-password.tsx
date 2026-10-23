import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyRound } from 'lucide-react-native';
import { GlassCard } from '../../components/glass';
import { supabase } from '../../services/supabase';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const savePassword = async () => {
    if (password.length < 8) {
      Alert.alert('Password too short', 'Choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      Alert.alert('Passwords do not match', 'Enter the same new password in both fields.');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert('Password updated', 'You can now sign in with your new password.', [
        { text: 'Continue', onPress: () => router.replace('/home') },
      ]);
    } catch (error) {
      Alert.alert('Could not update password', error instanceof Error ? error.message : 'Request a new reset link and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10" keyboardShouldPersistTaps="handled">
          <View className="w-16 h-16 bg-accent/10 rounded-3xl items-center justify-center mb-6 border border-accent/20">
            <KeyRound size={30} color="#3906D2" />
          </View>
          <Text className="text-3xl font-display font-black text-ink tracking-tight mb-2">Choose a new password</Text>
          <Text className="font-sans text-base text-ink/50 font-medium mb-8">Use at least 8 characters. Your reset link must still be valid.</Text>
          <GlassCard style={{ padding: 20 }}>
            <View className="gap-4">
              <TextInput
                className="border border-ink/10 rounded-2xl bg-white/70 px-4 py-4 text-base text-ink"
                placeholder="New password"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                value={password}
                onChangeText={setPassword}
              />
              <TextInput
                className="border border-ink/10 rounded-2xl bg-white/70 px-4 py-4 text-base text-ink"
                placeholder="Confirm new password"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                value={confirmation}
                onChangeText={setConfirmation}
              />
              <TouchableOpacity onPress={savePassword} disabled={isSaving || !password || !confirmation} className={`items-center rounded-2xl py-4 ${password && confirmation ? 'bg-accent' : 'bg-ink/10'}`}>
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text className={`font-display font-black uppercase tracking-widest ${password && confirmation ? 'text-white' : 'text-ink/40'}`}>Update Password</Text>}
              </TouchableOpacity>
            </View>
          </GlassCard>
          <TouchableOpacity onPress={() => router.replace('/(auth)/forgot-password')} className="mt-6 items-center py-3">
            <Text className="font-sans font-bold text-accent">Request a new reset link</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
