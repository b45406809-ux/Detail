// __DEV__ is injected by Metro: true when running via expo start, false in production builds (EAS Build).
export const IS_DEV = __DEV__;
export const IS_PROD = !__DEV__;

// Demo mode: a *built* (EAS) app can also be flipped into safe/mocked
// behavior via EXPO_PUBLIC_DEMO_MODE, independent of __DEV__ (which is
// always false in any compiled app, dev-client or not). Use this to preview
// the UI on a real device without calling production services.
export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
// "Safe to mock" — true in either a local dev-server session or a demo
// build. Existing DEV-only mock branches (phone OTP, payments, recaptcha)
// use this so the same mocked, backend-free behavior is reachable from a
// real installed APK, not just `expo start`.
export const IS_MOCK = IS_DEV || IS_DEMO;
