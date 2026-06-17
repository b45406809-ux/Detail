// This directory is superseded by app/(tabs)/ and root-level app/ screens.
// Delete this (app)/ directory to resolve route conflicts.
import { Stack } from 'expo-router';
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
