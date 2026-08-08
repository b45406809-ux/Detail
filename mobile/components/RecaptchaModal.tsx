import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { FirebaseOptions } from 'firebase/app';

/**
 * Firebase Phone Auth needs an ApplicationVerifier — normally a browser
 * reCAPTCHA widget. `expo-firebase-recaptcha` used to provide this for
 * Expo/RN via a WebView, but its native companion module (expo-firebase-core)
 * ships an Android build.gradle written for a pre-AGP-8 toolchain (deprecated
 * `classifier` Jar property, missing `components.release`) and fails to build
 * under SDK 52's Gradle 8.10 — see PluginError/EAS_BUILD_UNKNOWN_GRADLE_ERROR.
 *
 * This is a local, dependency-free port of the same technique — an invisible
 * reCAPTCHA rendered inside a WebView pointed at Firebase's hosted
 * `firebase.auth.RecaptchaVerifier` widget — using only `react-native-webview`,
 * which we already depend on and which builds cleanly.
 */

export type RecaptchaModalHandle = {
  /** Matches Firebase's ApplicationVerifier shape: { type, verify() }. */
  type: 'recaptcha';
  verify(): Promise<string>;
};

type Props = {
  firebaseConfig: FirebaseOptions;
  title?: string;
  cancelLabel?: string;
};

function getHtml(firebaseConfig: FirebaseOptions, invisible: boolean) {
  return `<!DOCTYPE html><html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script>firebase.initializeApp(${JSON.stringify(firebaseConfig)});</script>
  <style>
    html, body { height: 100%; ${invisible ? 'padding:0;margin:0;' : ''} }
    #recaptcha-btn { width: 100%; height: 100%; padding: 0; margin: 0; border: 0; }
  </style>
</head>
<body>
  ${invisible
    ? `<button id="recaptcha-btn" type="button" onclick="onClickButton()"></button>`
    : `<div id="recaptcha-cont" class="g-recaptcha"></div>`}
  <script>
    function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
    function onVerify(token) { post({ type: 'verify', token: token }); }
    function onLoad() {
      post({ type: 'load' });
      window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier("${invisible ? 'recaptcha-btn' : 'recaptcha-cont'}", {
        size: "${invisible ? 'invisible' : 'normal'}",
        callback: onVerify
      });
      window.recaptchaVerifier.render();
    }
    function onError() { post({ type: 'error' }); }
    function onClickButton() {
      var timer = setInterval(function () {
        var iframes = document.getElementsByTagName('iframe');
        var full = false;
        for (var i = 0; i < iframes.length; i++) {
          var parent = iframes[i].parentNode ? iframes[i].parentNode.parentNode : undefined;
          var hidden = parent && parent.style.opacity == 0;
          full = full || (!hidden && iframes[i].src.indexOf('google.com/recaptcha/api2/bframe') >= 0);
        }
        if (full) { clearInterval(timer); post({ type: 'fullChallenge' }); }
      }, 100);
    }
    window.addEventListener('message', function (event) {
      if (event.data && event.data.verify) document.getElementById('recaptcha-btn').click();
    });
  </script>
  <script src="https://www.google.com/recaptcha/api.js?onload=onLoad&render=explicit" onerror="onError()"></script>
</body></html>`;
}

/**
 * Invisible-first reCAPTCHA verifier. Renders nothing by default; falls back
 * to a visible modal challenge if Google decides the invisible attempt isn't
 * enough (same UX as expo-firebase-recaptcha's "attemptInvisibleVerification").
 */
export const RecaptchaModal = forwardRef<RecaptchaModalHandle, Props>(function RecaptchaModal(
  { firebaseConfig, title = 'reCAPTCHA', cancelLabel = 'Cancel' },
  ref
) {
  const [visible, setVisible] = useState(false);
  const [visibleLoaded, setVisibleLoaded] = useState(false);
  const [invisibleLoaded, setInvisibleLoaded] = useState(false);
  const [invisibleVerify, setInvisibleVerify] = useState(false);
  const [key, setKey] = useState(1);
  const pending = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void } | null>(null);
  const invisibleRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    type: 'recaptcha' as const,
    verify() {
      return new Promise<string>((resolve, reject) => {
        pending.current = { resolve, reject };
        setInvisibleVerify(true);
      });
    },
  }));

  const onMessage = (fromInvisible: boolean) => (event: WebViewMessageEvent) => {
    const data = JSON.parse(event.nativeEvent.data);
    switch (data.type) {
      case 'load':
        if (fromInvisible) setInvisibleLoaded(true);
        else setVisibleLoaded(true);
        break;
      case 'error':
        pending.current?.reject(new Error('Failed to load reCAPTCHA'));
        pending.current = null;
        setVisible(false);
        setInvisibleVerify(false);
        break;
      case 'verify':
        pending.current?.resolve(data.token);
        pending.current = null;
        setVisible(false);
        setInvisibleVerify(false);
        setInvisibleLoaded(false);
        setKey((k) => k + 1);
        break;
      case 'fullChallenge':
        // Invisible check wasn't enough — fall back to a visible challenge.
        setInvisibleVerify(false);
        setVisible(true);
        break;
    }
  };

  const cancel = () => {
    pending.current?.reject(new Error('Cancelled by user'));
    pending.current = null;
    setVisible(false);
  };

  React.useEffect(() => {
    if (invisibleRef.current && invisibleLoaded && invisibleVerify) {
      invisibleRef.current.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', {data: { verify: true }})); true;`
      );
    }
  }, [invisibleLoaded, invisibleVerify]);

  return (
    <View style={styles.container}>
      <WebView
        key={`invisible${key}`}
        ref={invisibleRef}
        style={styles.invisible}
        javaScriptEnabled
        source={{ baseUrl: `https://${firebaseConfig.authDomain}`, html: getHtml(firebaseConfig, true) }}
        onMessage={onMessage(true)}
      />

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={cancel}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.cancel}>
              <TouchableOpacity onPress={cancel}>
                <Text style={styles.cancelLabel}>{cancelLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.content}>
            <WebView
              javaScriptEnabled
              source={{ baseUrl: `https://${firebaseConfig.authDomain}`, html: getHtml(firebaseConfig, false) }}
              onMessage={onMessage(false)}
            />
            {!visibleLoaded && (
              <View style={styles.loader}>
                <ActivityIndicator size="large" />
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: 0, height: 0 },
  invisible: { width: 300, height: 300 },
  modalContainer: { flex: 1 },
  header: {
    backgroundColor: '#FBFBFB',
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomColor: '#CECECE',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: { position: 'absolute', left: 8, justifyContent: 'center' },
  cancelLabel: { color: '#3906D2', fontWeight: '700' },
  title: { fontWeight: 'bold' },
  content: { flex: 1 },
  loader: { ...StyleSheet.absoluteFillObject, paddingTop: 20, justifyContent: 'flex-start', alignItems: 'center' },
});
