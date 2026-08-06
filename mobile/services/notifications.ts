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
    shouldPlaySound: false,
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
