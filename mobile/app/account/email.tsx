import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react-native';
import { GlassCard } from '../../components/glass';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';

export default function AccountEmailScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [isSending, setIsSending] = useState(false);
  const [pending, setPending] = useState(false);
  const [verified, setVerified] = useState(!!user?._user.email_confirmed_at);

  useEffect(() => {
    setEmail(user?.email ?? '');
    setVerified(!!user?._user.email_confirmed_at);
  }, [user?.email, user?._user.email_confirmed_at]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async event => {
      if (event !== 'USER_UPDATED' && event !== 'SIGNED_IN') return;
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? '');
      setVerified(!!data.user?.email_confirmed_at);
      if (data.user?.email_confirmed_at) {
        setPending(false);
        await refreshProfile();
      }
    });
    return () => subscription.unsubscribe();
  }, [refreshProfile]);

  const sendVerification = async () => {
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      Alert.alert('Enter a valid email', 'Use an address you can open to confirm ownership.');
      return;
    }
    setIsSending(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: normalized }, { emailRedirectTo: 'detail://account/email' });
      if (error) throw error;
      setPending(true);
      Alert.alert('Check your email', 'Open the confirmation link on this device. Your email is linked only after Supabase confirms it.');
    } catch (error) {
      Alert.alert('Could not send confirmation', error instanceof Error ? error.message : 'Check the address and try again.');
    } finally { setIsSending(false); }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4 bg-white border-b border-slate-100">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-slate-50 rounded-2xl items-center justify-center" accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-display font-black text-slate-900">Email address</Text>
      </View>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerClassName="flex-grow px-5 py-6" keyboardShouldPersistTaps="handled">
          <GlassCard style={{ padding: 20 }}>
            <View className="w-14 h-14 rounded-2xl bg-accent/10 items-center justify-center mb-5">
              {verified ? <ShieldCheck size={26} color="#059669" /> : <Mail size={26} color="#3906D2" />}
            </View>
            <Text className="text-2xl font-display font-black text-ink mb-2">{verified ? 'Email verified' : 'Add a verified email'}</Text>
            <Text className="font-sans text-sm text-ink/60 leading-6 mb-6">
              {verified ? 'This email is linked to your current account.' : 'Your existing phone account stays the same. Confirm an email to finish cleaner registration and use Paynow checkout.'}
            </Text>
            <Text className="text-xs font-display font-black text-ink/50 uppercase tracking-widest mb-2">Email address</Text>
            <TextInput
              className="border border-ink/10 rounded-2xl bg-white px-4 py-4 text-base text-ink mb-4"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!isSending}
            />
            {pending && !verified && <Text className="font-sans text-sm text-amber-700 mb-4">Confirmation sent. Open the link on this device, then return here.</Text>}
            <TouchableOpacity onPress={sendVerification} disabled={isSending || verified} className={`rounded-2xl py-4 items-center ${verified ? 'bg-emerald-600' : 'bg-accent'}`}>
              {isSending ? <ActivityIndicator color="#fff" /> : <Text className="font-display font-black uppercase tracking-widest text-white">{verified ? 'Verified' : pending ? 'Send another link' : 'Send confirmation link'}</Text>}
            </TouchableOpacity>
          </GlassCard>
          {!!profile?.email && !verified && <Text className="mt-4 px-2 font-sans text-xs text-ink/50">Account profile email: {profile.email}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
