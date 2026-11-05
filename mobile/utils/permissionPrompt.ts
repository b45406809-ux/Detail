import { Linking } from 'react-native';
import { appAlert } from '@/components/AppDialog';

/** The OS can stop presenting its prompt after a denial; settings is then the only route. */
export function showPermissionDenied(message: string, canAskAgain: boolean) {
  appAlert('Permission needed', message, [
    { text: 'Not now', style: 'cancel' },
    ...(!canAskAgain ? [{ text: 'Open settings', onPress: () => { void Linking.openSettings().catch(() => undefined); } }] : []),
  ]);
}
