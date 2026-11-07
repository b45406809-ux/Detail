import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, ClipboardList, MapPinned, MessageCircle, UserRound } from 'lucide-react-native';
import { Wordmark } from '../../components/Wordmark';

const SLIDES = [
  {
    icon: ShieldCheck,
    badge: 'Identity status',
    title: 'Choose with confidence',
    sub: 'Browse cleaner profiles and look for the verified badge when choosing who to book.',
    note: 'A verified badge confirms identity, not a background check.',
  },
  {
    icon: ClipboardList,
    badge: 'Compare quotes',
    title: 'Compare quotes with ease',
    sub: 'Tell us what needs cleaning. Nearby cleaners can send quotes, and you choose the one that works for you.',
    note: '',
  },
  {
    icon: MapPinned,
    badge: 'Booking updates',
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
            <View style={{ height: Math.max(250, Math.min(310, height * 0.36)), backgroundColor: '#F3F2F6' }} className="rounded-[28px] px-6 justify-center overflow-hidden">
              <View className="absolute top-5 left-5 rounded-full bg-white px-3 py-1.5"><Text className="font-sans-bold text-xs text-ink">{badge}</Text></View>
              <View className="absolute self-center w-3/5 h-28 rounded-[22px] bg-white/40" style={{ top: '32%' }} />
              <View className="self-center w-full max-w-[260px] rounded-[22px] bg-white p-5" style={{ marginTop: 35 }}>
                {i === 2 && <View className="h-14 rounded-xl bg-ink/5 mb-4 items-center justify-center"><View className="absolute w-full h-1 bg-white" style={{ transform: [{ rotate: '-12deg' }] }} /><MapPinned size={24} color="#3906D2" /></View>}
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-2xl bg-brand-50 items-center justify-center">
                    {i === 0 ? <UserRound size={24} color="#3906D2" strokeWidth={1.7} /> : <Icon size={24} color="#3906D2" strokeWidth={1.7} />}
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="font-sans-bold text-sm text-ink">{i === 0 ? 'Identity verified' : i === 1 ? 'Your cleaning request' : 'Your booking'}</Text>
                    <Text className="font-sans text-xs text-ink/50 mt-1">{i === 0 ? 'Through Didit' : i === 1 ? 'Share what you need' : 'Updates in one place'}</Text>
                  </View>
                </View>
                <View className="mt-5 pt-4 border-t border-brand-50 flex-row items-center gap-2">
                  {i === 0 ? <ShieldCheck size={18} color="#3906D2" /> : <MessageCircle size={18} color="#3906D2" />}
                  <Text className="font-sans-bold text-sm text-ink flex-1">{i === 0 ? 'Not a background check or a guarantee' : i === 1 ? 'Compare quotes from cleaners' : 'Chat with your cleaner'}</Text>
                </View>
              </View>
            </View>

            <Text className="mt-7 text-ink text-[30px] leading-[36px] font-display tracking-tight mb-3">
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
              className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-ink' : 'bg-ink/20'}`}
            />
          ))}
        </View>

        <TouchableOpacity
          testID="welcome-next"
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get Started' : 'Continue'}
          onPress={goNext}
          activeOpacity={0.88}
          className="w-full bg-accent py-4 rounded-full items-center flex-row justify-center gap-2"
        >
          <Text className="text-white font-sans-bold text-base">
            {isLast ? 'Get started' : 'Continue'}
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
