import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { signMediaValue } from '../services/storage';

type Props = { userId?: string; photo?: string | null; name?: string; size: number; radius?: number };

/**
 * A person's profile picture, loaded through the cached photo loader. Always prefers the
 * account's current photo path (profile-photos/<id>/avatar.jpg) over a copied link that may
 * have expired, and falls back to the initial while loading or if there is no photo.
 */
export function ProfileAvatar({ userId, photo, name, size, radius }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUri(null);
    const canonical = userId ? `detail-media/profile-photos/${userId}/avatar.jpg` : '';
    const stored = typeof photo === 'string' ? photo : '';
    const source = canonical || stored;
    if (!source) return;
    void signMediaValue(source)
      .then(url => { if (active && typeof url === 'string') setUri(url); })
      .catch(() => {
        // Fall back to a stored https link (e.g. a social sign-in avatar) when there is no uploaded photo.
        if (active && /^https?:/i.test(stored)) setUri(stored);
      });
    return () => { active = false; };
  }, [userId, photo]);
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const borderRadius = radius ?? size / 3;
  return (
    <View style={{ width: size, height: size, borderRadius, overflow: 'hidden' }} className="bg-accent/10 items-center justify-center">
      {uri ? <RemoteImage uri={uri} style={{ width: size, height: size }} accessibilityLabel={`${name || 'User'} profile picture`} />
        : <Text style={{ fontSize: size / 2.6 }} className="font-display font-black text-accent">{initial}</Text>}
    </View>
  );
}
