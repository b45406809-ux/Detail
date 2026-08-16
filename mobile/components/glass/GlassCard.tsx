// Frosted-glass card — the signature "glassmorphism" surface used across Detail:
// floating panels over the map, bottom sheets, and elevated content cards.
// Built on expo-blur's native BlurView so it actually samples what's behind it
// (unlike a flat translucent <View>, which NativeWind's `bg-white/10` alone would give you).
import React from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';
import { BlurView, BlurTint } from 'expo-blur';

interface GlassCardProps extends ViewProps {
  /** 'light' = frosted white glass (default, for light surfaces / over map).
   *  'dark'  = frosted dark glass (for photo headers, splash-style screens).
   *  'brand' = frosted indigo glass (for CTAs and accents on top of glass). */
  variant?: 'light' | 'dark' | 'brand';
  /** Blur strength 0-100. Defaults per variant. */
  intensity?: number;
  /** Disable the blur and fall back to a flat tinted surface (Android perf / static contexts). */
  noBlur?: boolean;
  /** Stretch the content wrapper to fill the card (flex: 1). Off by default —
   *  most cards auto-size to their content (e.g. list rows, the permissions
   *  panel), and forcing flex:1 there squashes them. Opt in for a
   *  *fixed-height* card whose content needs to center/fill vertically
   *  (e.g. welcome.tsx's illustration card). */
  fillContent?: boolean;
  className?: string;
}

const VARIANT_TINT: Record<string, BlurTint> = {
  light: 'light',
  dark: 'dark',
  brand: 'dark',
};

const VARIANT_OVERLAY: Record<string, string> = {
  light: 'rgba(255,255,255,0.55)',
  dark: 'rgba(13,10,36,0.55)',
  brand: 'rgba(57,6,210,0.45)',
};

// Flat fallback when blur is disabled — needs to be more opaque since there's
// no real blur underneath to soften whatever content sits behind the card.
const VARIANT_OVERLAY_FLAT: Record<string, string> = {
  light: 'rgba(255,255,255,0.92)',
  dark: 'rgba(13,10,36,0.92)',
  brand: 'rgba(57,6,210,0.92)',
};

const VARIANT_BORDER: Record<string, string> = {
  light: 'rgba(255,255,255,0.6)',
  dark: 'rgba(255,255,255,0.12)',
  brand: 'rgba(255,255,255,0.25)',
};

export function GlassCard({
  variant = 'light',
  intensity,
  // expo-blur's Android implementation has known rendering glitches in release
  // builds (distorted/garbled card shapes instead of a clean blur) — default
  // to the flat tinted fallback there and reserve real BlurView for iOS,
  // unless a caller explicitly opts in with noBlur={false}.
  noBlur = Platform.OS === 'android',
  fillContent = false,
  style,
  className,
  children,
  ...rest
}: GlassCardProps) {
  const resolvedIntensity = intensity ?? (Platform.OS === 'android' ? 55 : 40);

  return (
    <View
      className={className}
      style={[styles.wrap, { borderColor: VARIANT_BORDER[variant] }, style]}
      {...rest}
    >
      {!noBlur && (
        <BlurView
          intensity={resolvedIntensity}
          tint={VARIANT_TINT[variant]}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: noBlur ? VARIANT_OVERLAY_FLAT[variant] : VARIANT_OVERLAY[variant] },
        ]}
      />
      <View style={fillContent ? styles.fillContent : undefined}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fillContent: {
    flex: 1,
  },
  wrap: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#3906D2',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
