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
import { ArrowLeft, Phone, Mail } from 'lucide-react-native';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  db,
  setDoc,
  doc,
  serverTimestamp,
} from '../../services/firebase';
import { GlassCard } from '../../components/glass';
import { SocialSignInButtons } from '../../components/SocialSignInButtons';
import { gradients } from '../../constants/theme';

type AuthTab = 'phone' | 'email';

export default function SignInScreen() {
  const [tab, setTab] = useState<AuthTab>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handlePhoneContinue = () => {
    if (!phone.trim()) {
      Alert.alert('Phone required', 'Please enter your phone number.');
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { phone } });
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setIsLoading(true);
    try {
      if (isNewAccount) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: '',
          photoURL: '',
          role: 'CUSTOMER',
          balance: 0,
          status: 'AVAILABLE',
          hasCompletedProfile: false,
          hasSetupPermissions: false,
          createdAt: serverTimestamp(),
        });
        router.replace('/(auth)/create-profile');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        router.replace('/home');
      }
    } catch (err: any) {
      const message =
        err.code === 'auth/user-not-found'
          ? 'No account found. Try creating one.'
          : err.code === 'auth/wrong-password'
          ? 'Incorrect password.'
          : err.code === 'auth/invalid-email'
          ? 'Invalid email address.'
          : 'Authentication failed. Please try again.';
      Alert.alert('Sign In Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={gradients.dusk} style={{ flex: 1 }} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerClassName="flex-grow px-6 pt-6 pb-10" keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                onPress={() => router.back()}
                className="w-12 h-12 bg-white/10 border border-white/15 rounded-2xl items-center justify-center mb-8"
              >
                <ArrowLeft size={20} color="#fff" />
              </TouchableOpacity>

              <Text className="text-3xl font-black text-white tracking-tight mb-2">Welcome back</Text>
              <Text className="text-base text-white/60 font-medium mb-8">Sign in to your Detail account</Text>

              <GlassCard style={{ padding: 20 }}>
                {/* Tab switcher */}
                <View className="flex-row bg-white/40 rounded-2xl p-1 mb-6">
                  {(['phone', 'email'] as AuthTab[]).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setTab(t)}
                      className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl ${
                        tab === t ? 'bg-white shadow-sm' : ''
                      }`}
                    >
                      {t === 'phone' ? (
                        <Phone size={16} color={tab === t ? '#3906D2' : '#150256'} />
                      ) : (
                        <Mail size={16} color={tab === t ? '#3906D2' : '#150256'} />
                      )}
                      <Text
                        className={`text-sm font-black uppercase tracking-wider`}
                        style={{ color: tab === t ? '#3906D2' : 'rgba(21,2,86,0.5)' }}
                      >
                        {t === 'phone' ? 'Phone' : 'Email'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {tab === 'phone' ? (
                  <View className="gap-4">
                    <View>
                      <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">
                        Phone Number
                      </Text>
                      <View className="flex-row items-center border border-white/40 rounded-2xl overflow-hidden bg-white/50">
                        <View className="px-4 py-4 border-r border-white/40">
                          <Text className="text-sm font-bold text-ink">+1</Text>
                        </View>
                        <TextInput
                          className="flex-1 px-4 py-4 text-base font-medium text-ink"
                          placeholder="(555) 000-0000"
                          placeholderTextColor="rgba(21,2,86,0.35)"
                          keyboardType="phone-pad"
                          value={phone}
                          onChangeText={setPhone}
                          autoFocus
                        />
                      </View>
                      <Text className="text-xs text-ink/50 font-medium mt-2 px-1">
                        We'll send a verification code to this number
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={handlePhoneContinue}
                      activeOpacity={0.85}
                      className="w-full bg-accent py-5 rounded-[24px] items-center mt-2 shadow-lg shadow-accent/30"
                    >
                      <Text className="text-white font-black text-sm uppercase tracking-widest">Send Code</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="gap-4">
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className="text-sm font-bold text-ink/70">
                        {isNewAccount ? 'Create a new account' : 'Sign in to existing account'}
                      </Text>
                      <TouchableOpacity onPress={() => setIsNewAccount(!isNewAccount)}>
                        <Text className="text-sm font-black text-accent">
                          {isNewAccount ? 'Sign in' : 'Register'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View>
                      <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">Email</Text>
                      <TextInput
                        className="border border-white/40 rounded-2xl px-4 py-4 text-base font-medium text-ink bg-white/50"
                        placeholder="you@example.com"
                        placeholderTextColor="rgba(21,2,86,0.35)"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                        autoFocus
                      />
                    </View>

                    <View>
                      <Text className="text-xs font-black text-ink/50 uppercase tracking-widest mb-2">Password</Text>
                      <TextInput
                        className="border border-white/40 rounded-2xl px-4 py-4 text-base font-medium text-ink bg-white/50"
                        placeholder="••••••••"
                        placeholderTextColor="rgba(21,2,86,0.35)"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                      />
                    </View>

                    <TouchableOpacity
                      onPress={handleEmailAuth}
                      disabled={isLoading}
                      activeOpacity={0.85}
                      className="w-full bg-accent py-5 rounded-[24px] items-center mt-2 shadow-lg shadow-accent/30"
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white font-black text-sm uppercase tracking-widest">
                          {isNewAccount ? 'Create Account' : 'Sign In'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </GlassCard>

              <View className="mt-6">
                <SocialSignInButtons />
              </View>

              <View className="flex-row items-center justify-center gap-2 mt-8">
                <View className="w-4 h-4 rounded-full bg-white/10 items-center justify-center">
                  <View className="w-1.5 h-1.5 rounded-full bg-white/60" />
                </View>
                <Text className="text-white/40 text-xs font-bold">Bank-grade encryption. Fully verified pros.</Text>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
