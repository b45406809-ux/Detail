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
import { IS_MOCK } from '../utils/env';

export type NotificationTarget =
  | { pathname: '/support'; params: { caseId: string } }
  | '/instant-offers'
  | { pathname: '/job/[jobId]'; params: { jobId: string } }
  | { pathname: '/booking/offers'; params: { jobId: string } }
  | { pathname: '/tracking/[jobId]'; params: { jobId: string } };

export function resolveNotificationTarget(data: { type?: string; jobId?: string; supportCaseId?: string }): NotificationTarget | null {
  if (data.supportCaseId) return { pathname: '/support', params: { caseId: data.supportCaseId } };
  if (data.type === 'INSTANT_BOOKING_OFFER') return '/instant-offers';
  if (data.type === 'NEW_SCHEDULED_JOB' && data.jobId) return { pathname: '/job/[jobId]', params: { jobId: data.jobId } };
  if (data.type === 'INSTANT_BOOKING_ACCEPTED' && data.jobId) return { pathname: '/booking/offers', params: { jobId: data.jobId } };
  if (!data.jobId) return null;
  const offerTypes = ['BOOKING_CREATED', 'NEW_BID'];
  return { pathname: offerTypes.includes(data.type ?? '') ? '/booking/offers' : '/tracking/[jobId]', params: { jobId: data.jobId } };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Foreground notifications use Detail's branded in-app banner. Background
    // notifications continue to use the native OS tray and lock-screen UI.
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export async function getExpoPushToken(): Promise<string | null> {
  try {
    if (IS_MOCK) return null; // mock builds must not register a live Expo push endpoint
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
