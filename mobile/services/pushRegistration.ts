import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { getExpoPushToken } from './notifications';

const PUSH_TOKEN_STORAGE_KEY = 'detail.push-token';

export async function registerCurrentPushDevice(): Promise<boolean> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return false;
  const token = await getExpoPushToken();
  if (!token) return false;
  const { error } = await supabase.functions.invoke('marketplace-api', {
    body: { name: 'registerPushDevice', data: { token } },
  });
  if (error) throw error;
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  return true;
}

export async function hasCurrentPushDevice(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY));
}

export async function unregisterCurrentPushDevice(): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY) ?? await getExpoPushToken();
  if (!token) return;
  const { error } = await supabase.functions.invoke('marketplace-api', {
    body: { name: 'unregisterPushDevice', data: { token } },
  });
  if (error) throw error;
  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}
