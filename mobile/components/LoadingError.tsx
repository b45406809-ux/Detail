import React from 'react';
import { Pressable, Text, View } from 'react-native';

export function LoadingError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text accessibilityRole="alert" className="text-center font-sans text-sm text-ink/60">{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} className="mt-5 rounded-2xl bg-accent px-6 py-4">
        <Text className="font-display font-bold text-white">Try again</Text>
      </Pressable>
    </View>
  );
}
