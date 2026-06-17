import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '../../components/Logo';
import { ShieldCheck, Star, Zap } from 'lucide-react-native';

const FEATURES = [
  {
    icon: Zap,
    title: 'Instant Matching',
    sub: 'Get matched with a verified cleaner in minutes',
  },
  {
    icon: ShieldCheck,
    title: 'Vetted Professionals',
    sub: 'Every cleaner is background-checked and rated',
  },
  {
    icon: Star,
    title: 'Bid-Based Pricing',
    sub: 'You set the price and cleaners compete for your job',
  },
];

export default function WelcomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerClassName="flex-grow px-6 pt-12 pb-10"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View className="items-center mb-12">
          <View className="w-20 h-20 bg-accent/10 rounded-3xl items-center justify-center mb-6">
            <Logo size={48} color="#3906d2" />
          </View>
          <Text className="text-4xl font-black text-slate-900 tracking-tight text-center">
            Your home,{'\n'}spotless.
          </Text>
          <Text className="text-base text-slate-500 font-medium text-center mt-3 leading-relaxed">
            Connect with professional cleaners in your area — fast, trusted, and affordable.
          </Text>
        </View>

        {/* Feature pills */}
        <View className="gap-3 mb-12">
          {FEATURES.map(({ icon: Icon, title, sub }) => (
            <View
              key={title}
              className="flex-row items-center gap-4 bg-slate-50 rounded-3xl p-4 border border-slate-100"
            >
              <View className="w-12 h-12 bg-accent/10 rounded-2xl items-center justify-center">
                <Icon size={22} color="#3906d2" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-black text-slate-900">{title}</Text>
                <Text className="text-xs text-slate-500 font-medium mt-0.5">{sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTAs */}
        <View className="gap-3">
          <TouchableOpacity
            onPress={() => router.push('/(auth)/sign-in')}
            activeOpacity={0.85}
            className="w-full bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
          >
            <Text className="text-white font-black text-sm uppercase tracking-widest">
              Get Started
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/sign-in')}
            activeOpacity={0.85}
            className="w-full bg-white border-2 border-slate-100 py-5 rounded-[32px] items-center"
          >
            <Text className="text-slate-900 font-black text-sm uppercase tracking-widest">
              Sign In
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="text-center text-xs text-slate-400 font-medium mt-6 px-4">
          By continuing you agree to our{' '}
          <Text className="text-accent font-bold">Terms of Service</Text> and{' '}
          <Text className="text-accent font-bold">Privacy Policy</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
