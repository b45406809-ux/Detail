// The "Detail." wordmark — used on the splash, onboarding, and auth screens
// where the reference designs show the full brand name rather than just the
// D. mark. Matches the Drive-supplied logo typography (black weight + dot).
import React from 'react';
import { Text, View } from 'react-native';

interface WordmarkProps {
  size?: number;
  color?: string;
  dotColor?: string;
}

export function Wordmark({ size = 40, color = '#FFFFFF', dotColor }: WordmarkProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text
        style={{
          fontSize: size,
          lineHeight: size * 1.05,
          fontFamily: 'PublicSans_900Black',
          color,
          letterSpacing: -0.5,
        }}
      >
        Detail
      </Text>
      <Text
        style={{
          fontSize: size,
          lineHeight: size * 1.05,
          fontFamily: 'PublicSans_900Black',
          color: dotColor ?? color,
        }}
      >
        .
      </Text>
    </View>
  );
}
