import { useState } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image, ImageContentFit } from 'expo-image';

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  spinnerColor?: string;
  accessibilityLabel?: string;
};

/** Photo with disk caching and a spinner shown until the image has loaded. */
export function RemoteImage({ uri, style, contentFit = 'cover', spinnerColor = '#3906D2', accessibilityLabel }: Props) {
  const [loading, setLoading] = useState(true);
  return (
    <View style={style}>
      <Image
        source={{ uri, cacheKey: mediaCacheKey(uri) }}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        transition={150}
        recyclingKey={uri}
        accessibilityLabel={accessibilityLabel}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.spinner]}>
          <ActivityIndicator color={spinnerColor} />
        </View>
      )}
    </View>
  );
}

/**
 * Photo links are signed and change on every request, so cache by the storage path instead of the full link.
 * Otherwise the phone re-downloads every photo after each launch.
 */
export function mediaCacheKey(uri: string) {
  return /^https?:/i.test(uri) ? uri.split('?')[0] : uri;
}

/**
 * Kept for callers; intentionally does nothing. expo-image prefetch caches by full URL, while RemoteImage caches by
 * storage path, so prefetching would download every photo twice on mobile data.
 */
export function prefetchPhotos(_urls: (string | null | undefined)[] | null | undefined) {}

const styles = StyleSheet.create({
  spinner: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(57,6,210,0.06)' },
});
