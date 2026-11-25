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
        source={{ uri }}
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

/** Start downloading photos before they are shown so previews open instantly. */
export function prefetchPhotos(urls: (string | null | undefined)[] | null | undefined) {
  const list = (urls ?? []).filter((url): url is string => typeof url === 'string' && /^https?:/i.test(url));
  if (list.length) void Image.prefetch(list, 'memory-disk').catch(() => undefined);
}

const styles = StyleSheet.create({
  spinner: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(57,6,210,0.06)' },
});
