import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Logo } from '../../components/Logo';
import { Wordmark } from '../../components/Wordmark';
import { gradients } from '../../constants/theme';

export default function SplashScreen() {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkTranslate = useRef(new Animated.Value(12)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 120 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(wordmarkOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(wordmarkTranslate, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
      Animated.timing(subtitleOpacity, { toValue: 1, duration: 400, delay: 150, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => router.replace('/(auth)/welcome'), 2400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.dusk} style={StyleSheet.absoluteFill} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} />

      {/* Soft radial glow behind the mark, echoing the intro animation */}
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

      <View style={styles.center}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim, alignItems: 'center' }}>
          <Logo size={72} color="#fff" />
        </Animated.View>
        <Animated.View
          style={{
            opacity: wordmarkOpacity,
            transform: [{ translateY: wordmarkTranslate }],
            marginTop: 14,
          }}
        >
          <Wordmark size={38} color="#fff" />
        </Animated.View>
      </View>

      <Animated.View style={[styles.footer, { opacity: subtitleOpacity }]}>
        <Text style={styles.footerLabel}>PREMIUM SERVICE PLATFORM</Text>
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
        <Text style={styles.footerSub}>FULLY VERIFIED &amp; ENCRYPTED</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(115,87,242,0.45)',
  },
  center: { alignItems: 'center' },
  footer: { position: 'absolute', bottom: 64, alignItems: 'center', gap: 12 },
  footerLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { backgroundColor: '#fff', width: 16 },
  footerSub: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
});
