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
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 pt-6 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-12 h-12 bg-slate-50 rounded-2xl items-center justify-center mb-8"
          >
            <ArrowLeft size={20} color="#0f172a" />
          </TouchableOpacity>

          <Text className="text-3xl font-black text-slate-900 tracking-tight mb-2">
            Welcome back
          </Text>
          <Text className="text-base text-slate-500 font-medium mb-8">
            Sign in to your Detail account
          </Text>

          {/* Tab switcher */}
          <View className="flex-row bg-slate-100 rounded-2xl p-1 mb-8">
            {(['phone', 'email'] as AuthTab[]).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl ${
                  tab === t ? 'bg-white shadow-sm' : ''
                }`}
              >
                {t === 'phone' ? (
                  <Phone size={16} color={tab === t ? '#3906d2' : '#94a3b8'} />
                ) : (
                  <Mail size={16} color={tab === t ? '#3906d2' : '#94a3b8'} />
                )}
                <Text
                  className={`text-sm font-black uppercase tracking-wider ${
                    tab === t ? 'text-accent' : 'text-slate-400'
                  }`}
                >
                  {t === 'phone' ? 'Phone' : 'Email'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'phone' ? (
            <View className="gap-4">
              <View>
                <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                  Phone Number
                </Text>
                <View className="flex-row items-center border-2 border-slate-100 rounded-2xl overflow-hidden bg-slate-50">
                  <View className="px-4 py-4 border-r border-slate-100">
                    <Text className="text-sm font-bold text-slate-700">+1</Text>
                  </View>
                  <TextInput
                    className="flex-1 px-4 py-4 text-base font-medium text-slate-900"
                    placeholder="(555) 000-0000"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    autoFocus
                  />
                </View>
                <Text className="text-xs text-slate-400 font-medium mt-2 px-1">
                  We'll send a verification code to this number
                </Text>
              </View>

              <TouchableOpacity
                onPress={handlePhoneContinue}
                activeOpacity={0.85}
                className="w-full bg-accent py-5 rounded-[32px] items-center mt-4 shadow-lg shadow-accent/30"
              >
                <Text className="text-white font-black text-sm uppercase tracking-widest">
                  Send Code
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="gap-4">
              {/* Toggle new/existing account */}
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-bold text-slate-600">
                  {isNewAccount ? 'Create a new account' : 'Sign in to existing account'}
                </Text>
                <TouchableOpacity onPress={() => setIsNewAccount(!isNewAccount)}>
                  <Text className="text-sm font-black text-accent">
                    {isNewAccount ? 'Sign in' : 'Register'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View>
                <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                  Email
                </Text>
                <TextInput
                  className="border-2 border-slate-100 rounded-2xl px-4 py-4 text-base font-medium text-slate-900 bg-slate-50"
                  placeholder="you@example.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  autoFocus
                />
              </View>

              <View>
                <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                  Password
                </Text>
                <TextInput
                  className="border-2 border-slate-100 rounded-2xl px-4 py-4 text-base font-medium text-slate-900 bg-slate-50"
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              <TouchableOpacity
                onPress={handleEmailAuth}
                disabled={isLoading}
                activeOpacity={0.85}
                className="w-full bg-accent py-5 rounded-[32px] items-center mt-2 shadow-lg shadow-accent/30"
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
