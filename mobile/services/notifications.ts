/**
 * Expo push token registration. Called once the user has granted the
 * notifications permission (see (auth)/permissions.tsx). Silently no-ops
 * when running in Expo Go / a simulator, or when the project has no EAS
 * `projectId` configured yet — none of those can produce a real push token,
 * and the app must keep working (DEV mode simulates delivery locally).
 */
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getExpoPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null; // simulators can't receive push

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null; // not linked to an EAS project yet

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    console.warn('Push token registration skipped:', err);
    return null;
  }
}

export async function configureNotificationChannels() {
  if (process.env.EXPO_OS === 'android') {
    await Notifications.setNotificationChannelAsync('bookings', { name: 'Booking updates', importance: Notifications.AndroidImportance.HIGH, sound: 'booking.wav', vibrationPattern: [0, 250, 150, 250], lightColor: '#3906D2' });
    await Notifications.setNotificationChannelAsync('urgent', { name: 'Payments & urgent', importance: Notifications.AndroidImportance.MAX, sound: 'urgent.wav', vibrationPattern: [0, 500, 200, 500], lightColor: '#E5484D' });
  }
}
