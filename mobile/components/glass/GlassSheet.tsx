// Frosted bottom-sheet panel — the floating "Request Cleaning" / tracking / bid
// panels that dock to the bottom of the map in the reference designs.
// Rounded only on the top corners so it reads as anchored to the screen edge.
import React from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface GlassSheetProps extends ViewProps {
  variant?: 'light' | 'dark';
  /** Pad the bottom by the device safe-area inset (default true). */
  safeBottom?: boolean;
  className?: string;
}

export function GlassSheet({
  variant = 'light',
  safeBottom = true,
  style,
  className,
  children,
  ...rest
}: GlassSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={className}
      style={[
        styles.wrap,
        {
          borderColor: variant === 'light' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.12)',
          paddingBottom: safeBottom ? Math.max(insets.bottom, 16) : 0,
        },
        style,
      ]}
      {...rest}
    >
      <BlurView
        intensity={Platform.OS === 'android' ? 65 : 50}
        tint={variant}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              variant === 'light' ? 'rgba(255,255,255,0.62)' : 'rgba(13,10,36,0.68)',
          },
        ]}
      />
      <View style={styles.handle} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: '#150256',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(120,113,180,0.35)',
    marginBottom: 12,
  },
});
