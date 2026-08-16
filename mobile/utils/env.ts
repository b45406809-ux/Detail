// __DEV__ is injected by Metro: true when running via expo start, false in production builds (EAS Build).
export const IS_DEV = __DEV__;
export const IS_PROD = !__DEV__;

// Demo mode: a *built* (EAS) app can also be flipped into safe/mocked
// behavior via EXPO_PUBLIC_DEMO_MODE, independent of __DEV__ (which is
// always false in any compiled app, dev-client or not). Use this to preview
// the UI on a real device without live Firebase Auth/Functions/Storage, and
// without mounting react-native-maps' native Google Maps view (which needs
// a configured Maps API key and otherwise crashes standalone Android builds).
export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

// "Safe to mock" — true in either a local dev-server session or a demo
// build. Existing DEV-only mock branches (phone OTP, payments, recaptcha)
// use this so the same mocked, backend-free behavior is reachable from a
// real installed APK, not just `expo start`.
export const IS_MOCK = IS_DEV || IS_DEMO;

// TEMPORARY: Cloud Functions can't be deployed yet (needs Firebase Blaze
// billing, not enabled), so every callFunction(...) call would otherwise
// fail with a "not found" error in a real build. While this is true,
// services/functions.ts routes named functions through
// services/functionSimulators.ts (client-side Firestore writes that
// replicate what the real Cloud Function would have done) instead of
// actually calling them — see the "SIMULATE MODE" banner in
// firestore.rules for the matching, temporarily-loosened security rules
// this depends on. Independent of IS_DEMO/IS_MOCK on purpose: Maps and
// phone-auth SMS stay simulated for their own separate reasons (missing
// Maps API key, missing SHA fingerprint) regardless of Functions/billing
// status. Flip to false (and re-tighten firestore.rules) once Blaze is
// enabled and the real Functions are deployed.
export const IS_SIMULATING_FUNCTIONS = process.env.EXPO_PUBLIC_SIMULATE_FUNCTIONS === 'true';
