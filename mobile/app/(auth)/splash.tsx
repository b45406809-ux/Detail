import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { router } from 'expo-router';
import { Logo } from '../../components/Logo';

export default function SplashScreen() {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 120,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 400,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      router.replace('/(auth)/welcome');
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 bg-accent items-center justify-center">
      <Animated.View
        style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}
        className="items-center"
      >
        <Logo size={80} color="#fff" />
        <Text className="text-white text-4xl font-black tracking-tight mt-4">Detail</Text>
      </Animated.View>

      <Animated.View style={{ opacity: subtitleOpacity }} className="absolute bottom-20">
        <Text className="text-white/70 text-xs font-bold uppercase tracking-widest">
          Professional Cleaning
        </Text>
      </Animated.View>
    </View>
  );
}
