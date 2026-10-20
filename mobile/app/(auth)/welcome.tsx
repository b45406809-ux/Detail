import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, Zap, MapPinned } from 'lucide-react-native';
import { Wordmark } from '../../components/Wordmark';
import { GlassCard } from '../../components/glass';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: ShieldCheck,
    badge: 'Elite Verified',
    title: 'Trusted\nProfessionals',
    sub: 'Every cleaner on Detail undergoes a rigorous identity and background verification process.',
  },
  {
    icon: Zap,
    badge: 'You set the price',
    title: 'Bid-Based\nPricing',
    sub: 'Post a job for house or car cleaning and let nearby pros compete with their best offer.',
  },
  {
    icon: MapPinned,
    badge: 'Payment protected',
    title: 'Live Tracking,\nSecure Pay',
    sub: 'Watch your cleaner arrive in real time and only release payment once you confirm the job.',
  },
];

export default function WelcomeScreen() {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const goNext = () => {
    if (isLast) return router.push('/(auth)/sign-in');
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-6 pt-2">
        <Wordmark size={20} color="#150256" />
        {!isLast && (
          <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')}>
            <Text className="font-sans text-ink/40 text-sm font-bold">Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {SLIDES.map(({ icon: Icon, badge, title, sub }, i) => (
          <View key={i} style={{ width, paddingHorizontal: 28, paddingTop: 24 }}>
            <GlassCard variant="brand" fillContent style={{ height: 300, marginBottom: 32 }}>
              <View className="flex-1 items-center justify-center">
                <View className="absolute top-5 left-5 bg-white/15 border border-white/25 px-3 py-1.5 rounded-full">
                  <Text className="text-white text-[11px] font-display font-black tracking-wide">{badge}</Text>
                </View>
                <View className="w-24 h-24 rounded-[28px] bg-white/15 border border-white/25 items-center justify-center">
                  <Icon size={44} color="#fff" strokeWidth={1.75} />
                </View>
              </View>
            </GlassCard>

            <Text className="text-ink text-[34px] leading-[38px] font-display font-black tracking-tight mb-3">
              {title}
            </Text>
            <Text className="font-sans text-ink/50 text-base font-medium leading-relaxed">{sub}</Text>
          </View>
        ))}
      </ScrollView>

      <View className="px-7 pb-8 pt-4">
        <View className="flex-row justify-center gap-2 mb-8">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              className={`h-1.5 rounded-full ${i === index ? 'w-7 bg-accent' : 'w-1.5 bg-ink/10'}`}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={goNext}
          activeOpacity={0.88}
          className="w-full bg-accent py-5 rounded-[28px] items-center flex-row justify-center gap-2 shadow-lg shadow-accent/30"
        >
          <Text className="text-white font-display font-black text-sm uppercase tracking-widest">
            {isLast ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>

        {isLast && (
          <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')} className="mt-5 items-center">
            <Text className="font-sans text-ink/40 text-sm font-bold">
              Already have an account? <Text className="text-accent font-display font-black">Log In</Text>
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
