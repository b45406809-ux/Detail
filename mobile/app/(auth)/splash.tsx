import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { router } from 'expo-router';

// This is the actual Detail intro video (brand swoosh → D. mark → wordmark),
// trimmed to end on the Detail wordmark before the production credit.
// Falls through to welcome automatically when it finishes, with a
// safety timeout in case playback stalls on a given device.
const INTRO_SOURCE = require('../../assets/intro.mp4');

export default function SplashScreen() {
  const [didNavigate, setDidNavigate] = useState(false);
  const navigatedRef = useRef(false);

  const player = useVideoPlayer(INTRO_SOURCE, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  const goNext = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    setDidNavigate(true);
    router.replace('/(auth)/welcome');
  };

  useEffect(() => {
    const sub = player.addListener('playToEnd', goNext);
    // Safety net: never strand the user on the splash if the video fails to
    // load or the playToEnd event doesn't fire on a given device/codec.
    const timer = setTimeout(goNext, 8000);
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  return (
    <View style={styles.root}>
      {!didNavigate && (
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          nativeControls={false}
          contentFit="cover"
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#3906D2' },
});
