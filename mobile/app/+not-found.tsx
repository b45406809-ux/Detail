import { Link, Stack } from 'expo-router';
import { View, Text } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-2xl font-display font-black text-slate-900 mb-2">Screen not found</Text>
        <Link href="/" className="text-accent font-bold text-base mt-4">
          Go home
        </Link>
      </View>
    </>
  );
}
