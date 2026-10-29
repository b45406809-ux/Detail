import React from 'react';
import { View } from 'react-native';

/** A stable placeholder that keeps list screens recognizable while data loads. */
export function LoadingList({ rows = 5 }: { rows?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" className="flex-1 px-5 pt-1">
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="mb-3 flex-row items-center rounded-3xl border border-ink/5 bg-white p-4">
          <View className="mr-4 h-12 w-12 rounded-2xl bg-[#EBE8F7]" />
          <View className="flex-1 gap-2">
            <View className="h-3 w-2/3 rounded-full bg-[#EBE8F7]" />
            <View className="h-3 w-4/5 rounded-full bg-[#F3F1FC]" />
          </View>
        </View>
      ))}
    </View>
  );
}
