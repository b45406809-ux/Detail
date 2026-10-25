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
    badge: 'Identity status',
    title: 'Know who\nyou are booking',
    sub: 'Some cleaner accounts complete identity verification through Didit. A verified badge reflects identity status; it is not a background check or a guarantee.',
  },
  {
    icon: Zap,
    badge: 'You set the price',
    title: 'Bid-Based\nPricing',
    sub: 'Post a job for house or car cleaning and let nearby pros compete with their best offer.',
  },
  {
    icon: MapPinned,
    badge: 'Payment choices',
    title: 'Job updates,\nclear terms',
    sub: 'Share location while online or working, and review the available payment method and booking terms before you confirm.',
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
    const nextIndex = index + 1;
    setIndex(nextIndex);
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-6 pt-2">
        <Wordmark size={20} color="#150256" />
        {!isLast && (
          <TouchableOpacity testID="welcome-skip" accessibilityRole="button" accessibilityLabel="Skip onboarding" onPress={() => router.push('/(auth)/sign-in')}>
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
          testID="welcome-next"
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get Started' : 'Continue'}
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
