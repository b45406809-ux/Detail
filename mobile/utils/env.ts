// __DEV__ is injected by Metro: true when running via expo start, false in production builds (EAS Build).
export const IS_DEV = __DEV__;
export const IS_PROD = !__DEV__;

// Demo mode: a *built* (EAS) app can also be flipped into safe/mocked
// behavior via EXPO_PUBLIC_DEMO_MODE, independent of __DEV__ (which is
// always false in any compiled app, dev-client or not). Use this to preview
// the UI on a real device without calling production services.
export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
export const IS_PRODUCTION_BUILD = process.env.EXPO_PUBLIC_APP_BUILD_PROFILE === 'production';
if(IS_PRODUCTION_BUILD&&IS_DEMO)throw new Error('Demo mode is prohibited in the EAS production build profile.');
// Explicit staging builds can exercise real auth and marketplace flows on
// Appetize and physical devices. Production builds cannot opt into staging.
export const IS_STAGING_AUTH = !IS_PRODUCTION_BUILD && !IS_DEMO && process.env.EXPO_PUBLIC_USE_STAGING_AUTH === 'true';
if(IS_PRODUCTION_BUILD&&process.env.EXPO_PUBLIC_USE_STAGING_AUTH==='true')throw new Error('Staging auth is prohibited in the EAS production build profile.');
if(process.env.EXPO_PUBLIC_APP_BUILD_PROFILE==='staging'&&!IS_STAGING_AUTH)throw new Error('Staging builds must use the isolated staging backend.');
// Default local development and demo builds stay on the mock backend, while
// an explicitly selected staging build can exercise real OTP/provider flows.
export const IS_MOCK = IS_DEMO || (IS_DEV && !IS_STAGING_AUTH);
export const APP_ENVIRONMENT = IS_DEMO ? 'DEMO' : IS_STAGING_AUTH ? 'STAGING' : IS_MOCK ? 'LOCAL MOCK' : 'PRODUCTION';
