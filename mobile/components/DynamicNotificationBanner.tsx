// Animation sequence adapted for Expo 52 from expo-dynamic-notifications (MIT).
// See third-party/expo-dynamic-notifications-LICENSE.txt.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

export type DynamicNotification = {
  title: string;
  body: string;
  data: { type?: string; jobId?: string; supportCaseId?: string };
};

export function DynamicNotificationBanner({
  notification,
  onPress,
  onDismiss,
}: {
  notification: DynamicNotification | null;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!notification) return;
    progress.stopAnimation();
    reveal.stopAnimation();
    progress.setValue(0);
    reveal.setValue(0);
    // The reference library drops the island, expands it, then reveals content.
    const enter = Animated.sequence([
      Animated.spring(progress, { toValue: 1, damping: 18, stiffness: 190, mass: 0.8, useNativeDriver: true }),
      Animated.timing(reveal, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]);
    enter.start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(reveal, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) dismissRef.current(); });
    }, 5200);
    return () => { clearTimeout(timer); enter.stop(); };
  }, [notification, progress, reveal]);

  if (!notification) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <Animated.View style={[styles.position, { top: Math.max(insets.top, 12) + 8, opacity: progress, transform: [{ translateY }, { scale }] }]}>
        <View style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${notification.title}. ${notification.body}. Open notification`} onPress={onPress} style={styles.contentButton}>
            <View style={styles.brandMark}><Text style={styles.brandD}>D</Text></View>
            <Animated.View style={[styles.copy, { opacity: reveal }]}>
              <View style={styles.brandRow}>
                <Text style={styles.brand}>DETAIL</Text>
                <View style={styles.dot} />
                <Text style={styles.update}>UPDATE</Text>
              </View>
              <Text numberOfLines={1} style={styles.title}>{notification.title}</Text>
              <Text numberOfLines={2} style={styles.body}>{notification.body}</Text>
            </Animated.View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" hitSlop={12} onPress={onDismiss} style={styles.dismiss}>
            <X size={16} color="#70698B" />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 2000, elevation: 2000 },
  position: { position: 'absolute', left: 14, right: 14 },
  card: {
    minHeight: 84, flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingLeft: 13, paddingRight: 10,
    borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(57,6,210,0.12)',
    shadowColor: '#150256', shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 14,
  },
  contentButton: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  brandMark: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#3906D2', alignItems: 'center', justifyContent: 'center' },
  brandD: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', lineHeight: 28 },
  copy: { flex: 1, minWidth: 0, marginLeft: 11, marginRight: 5 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  brand: { color: '#3906D2', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#A39BBE', marginHorizontal: 6 },
  update: { color: '#928BAA', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: '#19142D', fontSize: 14, fontWeight: '800' },
  body: { color: '#716B85', fontSize: 11, lineHeight: 15, marginTop: 2 },
  dismiss: { alignSelf: 'flex-start', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
});
