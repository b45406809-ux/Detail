// Detail-branded fallback shown in demo mode, Expo Go, or when Mapbox is not configured.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin } from 'lucide-react-native';

export function MapPlaceholder({ style }: { style?: any }) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={['#DDD5FD', '#BCAAFB', '#9580F7']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      {/* faint grid, evokes a map without pretending to be one */}
      <View style={styles.grid} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 14}%` }]} />
        ))}
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 20}%` }]} />
        ))}
      </View>
      <View style={styles.pin}>
        <MapPin size={28} color="#3906D2" />
      </View>
      <Text style={styles.label}>Live map is unavailable in this build</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  grid: { ...StyleSheet.absoluteFillObject },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(57,6,210,0.08)' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(57,6,210,0.08)' },
  pin: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  label: { fontSize: 12, fontWeight: '700', color: '#27049C', letterSpacing: 0.3 },
});
