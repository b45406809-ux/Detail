import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, ClipboardList, MapPinned, MessageCircle, UserRound, ArrowRight } from 'lucide-react-native';
import { Wordmark } from '../../components/Wordmark';

const SLIDES = [
  {
    icon: ShieldCheck,
    badge: 'GET TO KNOW YOUR CLEANER',
    title: 'Choose with confidence',
    sub: 'Browse cleaner profiles and look for the verified badge when choosing who to book.',
    note: 'A verified badge confirms identity, not a background check.',
  },
  {
    icon: ClipboardList,
    badge: 'YOUR JOB, YOUR CHOICE',
    title: 'Compare quotes with ease',
    sub: 'Tell us what needs cleaning. Nearby cleaners can send quotes, and you choose the one that works for you.',
    note: '',
  },
  {
    icon: MapPinned,
    badge: 'FROM BOOKING TO FINISH',
    title: 'Stay in the loop',
    sub: 'Keep up with your booking, chat with your cleaner and review payment options before you confirm.',
    note: '',
  },
];

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
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
        {SLIDES.map(({ icon: Icon, badge, title, sub, note }, i) => (
          <ScrollView key={badge} style={{ width }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
            <View style={{ height: Math.max(190, Math.min(270, height * 0.30)) }} className="rounded-[28px] bg-brand-50 px-6 justify-center overflow-hidden">
              <View className="self-center w-full max-w-[260px] rounded-[22px] bg-white p-5 border border-brand-100">
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-2xl bg-brand-50 items-center justify-center">
                    {i === 0 ? <UserRound size={24} color="#3906D2" strokeWidth={1.7} /> : <Icon size={24} color="#3906D2" strokeWidth={1.7} />}
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="font-sans-bold text-sm text-ink">{i === 0 ? 'Cleaner profile' : i === 1 ? 'Your cleaning request' : 'Your booking'}</Text>
                    <Text className="font-sans text-xs text-ink/50 mt-1">{i === 0 ? 'Get to know your cleaner' : i === 1 ? 'Share what you need' : 'Updates in one place'}</Text>
                  </View>
                </View>
                <View className="mt-5 pt-4 border-t border-brand-50 flex-row items-center gap-2">
                  {i === 0 ? <ShieldCheck size={18} color="#3906D2" /> : <MessageCircle size={18} color="#3906D2" />}
                  <Text className="font-sans-bold text-sm text-ink">{i === 0 ? 'Look for the verified badge' : i === 1 ? 'Compare quotes from cleaners' : 'Chat with your cleaner'}</Text>
                </View>
              </View>
            </View>

            <Text className="mt-7 mb-3 font-sans-bold text-[11px] tracking-wider text-accent">{badge}</Text>
            <Text className="text-ink text-[30px] leading-[36px] font-display tracking-tight mb-3">
              {title}
            </Text>
            <Text className="font-sans text-ink/60 text-base leading-6">{sub}</Text>
            {!!note && <Text className="mt-3 font-sans text-ink/40 text-xs leading-5">{note}</Text>}
          </ScrollView>
        ))}
      </ScrollView>

      <View className="px-6 pb-6 pt-3">
        <View className="flex-row justify-center gap-2 mb-6" accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
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
          className="w-full bg-accent py-4 rounded-2xl items-center flex-row justify-center gap-2"
        >
          <Text className="text-white font-sans-bold text-base">
            {isLast ? 'Get started' : 'Continue'}
          </Text>
          <ArrowRight size={18} color="#fff" />
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
