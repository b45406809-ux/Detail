// Small circular frosted button — the "locate me", "filter", "SOS" style buttons
// floating over the map in the reference screens.
import React from 'react';
import { TouchableOpacity, View, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassIconButtonProps {
  onPress?: () => void;
  size?: number;
  variant?: 'light' | 'dark';
  style?: ViewStyle;
  children: React.ReactNode;
  disabled?: boolean;
}

export function GlassIconButton({
  onPress,
  size = 44,
  variant = 'light',
  style,
  children,
  disabled,
}: GlassIconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: variant === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)',
        },
        style,
      ]}
    >
      <BlurView
        intensity={50}
        tint={variant === 'light' ? 'light' : 'dark'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: variant === 'light' ? 'rgba(255,255,255,0.5)' : 'rgba(13,10,36,0.5)' },
        ]}
      />
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#3906D2',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
