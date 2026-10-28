import { router } from 'expo-router';

/** Return to the previous screen, or recover to the authenticated home route
 * when a deep link or cold-start screen has no navigation history. */
export function goBackSafely() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/home');
}
