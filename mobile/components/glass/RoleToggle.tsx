// CUSTOMER / CLEANER segmented pill toggle seen on the home screen in the
// reference designs. Sliding indigo pill behind the active label.
import React, { useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, Animated } from 'react-native';

interface RoleToggleProps {
  value: 'CUSTOMER' | 'CLEANER';
  onChange: (value: 'CUSTOMER' | 'CLEANER') => void;
}

export function RoleToggle({ value, onChange }: RoleToggleProps) {
  const anim = useRef(new Animated.Value(value === 'CLEANER' ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value === 'CLEANER' ? 1 : 0,
      useNativeDriver: true,
      friction: 9,
      tension: 80,
    }).start();
  }, [value]);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 104] });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.pill, { transform: [{ translateX }] }]} />
      <TouchableOpacity
        style={styles.tab}
        activeOpacity={0.8}
        onPress={() => onChange('CUSTOMER')}
      >
        <Text style={[styles.label, value === 'CUSTOMER' && styles.labelActive]}>Customer</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} activeOpacity={0.8} onPress={() => onChange('CLEANER')}>
        <Text style={[styles.label, value === 'CLEANER' && styles.labelActive]}>Cleaner</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 999,
    padding: 4,
    width: 208,
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  pill: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 100,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#3906D2',
    shadowColor: '#3906D2',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  tab: {
    width: 100,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#150256',
    letterSpacing: 0.2,
  },
  labelActive: {
    color: '#ffffff',
  },
});
