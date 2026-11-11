const appJson = require('./app.json');
const { generateNotificationSounds } = require('./scripts/generate-notification-sounds');

if (process.env.EAS_BUILD_PROFILE === 'production' && process.env.EXPO_PUBLIC_DEMO_MODE === 'true') {
  throw new Error('Demo mode is prohibited in the EAS production build profile.');
}

// This runs before Expo/EAS resolves plugin assets, ensuring the ignored WAV
// artifacts exist for expo-notifications without committing binary files.
generateNotificationSounds();

module.exports = ({ config = appJson.expo } = {}) => {
  const expo = { ...appJson.expo, ...config };
  if (process.env.DETAIL_ANDROID_VERSION_CODE) {
    const versionCode = Number(process.env.DETAIL_ANDROID_VERSION_CODE);
    if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) {
      throw new Error('DETAIL_ANDROID_VERSION_CODE must be a valid Google Play version code.');
    }
    expo.android = { ...expo.android, versionCode };
  }
  // EAS file variables provide the Firebase configuration without committing it.
  if (process.env.GOOGLE_SERVICES_JSON) {
    const fs = require('fs');
    const firebaseConfig = JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICES_JSON, 'utf8'));
    if (!firebaseConfig.client?.some((client) => client.client_info?.android_client_info?.package_name === expo.android.package)) {
      throw new Error('GOOGLE_SERVICES_JSON must contain a Firebase Android app matching the configured package.');
    }
    expo.android = { ...expo.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON };
  }
  const mapboxAccessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const mapboxDownloadsToken = process.env.MAPBOX_DOWNLOADS_TOKEN;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabasePublicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const stagingUrl = process.env.EXPO_PUBLIC_STAGING_SUPABASE_URL;
  const stagingPublicKey = process.env.EXPO_PUBLIC_STAGING_SUPABASE_ANON_KEY;
  const isStagingProfile = process.env.EXPO_PUBLIC_APP_BUILD_PROFILE === 'staging';
  const isProductionProfile = process.env.EAS_BUILD_PROFILE === 'production'
    || process.env.EXPO_PUBLIC_APP_BUILD_PROFILE === 'production';
  if (isProductionProfile && process.env.EXPO_PUBLIC_USE_STAGING_AUTH === 'true') {
    throw new Error('Production EAS profiles cannot enable staging auth.');
  }
  if (isStagingProfile && process.env.EXPO_PUBLIC_USE_STAGING_AUTH !== 'true') {
    throw new Error('Staging EAS profiles must enable EXPO_PUBLIC_USE_STAGING_AUTH.');
  }
  if (isStagingProfile && (!stagingUrl || !stagingPublicKey)) {
    throw new Error('Staging EAS profiles require EXPO_PUBLIC_STAGING_SUPABASE_URL and EXPO_PUBLIC_STAGING_SUPABASE_ANON_KEY.');
  }
  const normalizeSupabaseUrl = (value) => value?.replace(/\/+$/, '').toLowerCase();
  if (isStagingProfile && normalizeSupabaseUrl(stagingUrl) === normalizeSupabaseUrl(supabaseUrl)) {
    throw new Error('Staging EAS profiles must use a Supabase project separate from the production URL.');
  }
  if (process.env.EAS_BUILD_PROFILE && (!mapboxAccessToken || !mapboxDownloadsToken)) {
    throw new Error('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN and MAPBOX_DOWNLOADS_TOKEN are required for EAS builds.');
  }
  if (process.env.EAS_BUILD_PROFILE && (!supabaseUrl || !supabasePublicKey)) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required for EAS builds.');
  }
  if (supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl)) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be the HTTPS URL of the Supabase project.');
  }
  if (stagingUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(stagingUrl)) {
    throw new Error('EXPO_PUBLIC_STAGING_SUPABASE_URL must be the HTTPS URL of an isolated Supabase project.');
  }
  if (stagingPublicKey && !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(stagingPublicKey)) {
    throw new Error('EXPO_PUBLIC_STAGING_SUPABASE_ANON_KEY must be a Supabase publishable or legacy anon key.');
  }
  if (supabasePublicKey && !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(supabasePublicKey)) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY must be a Supabase publishable or legacy anon key.');
  }

  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
  const iosClientIdSuffix = '.apps.googleusercontent.com';
  const iosUrlScheme = iosClientId.endsWith(iosClientIdSuffix)
    ? `com.googleusercontent.apps.${iosClientId.slice(0, -iosClientIdSuffix.length)}`
    // Android builds do not use this URL scheme. Set the iOS client ID in EAS
    // before building iOS so the plugin registers the real reversed client ID.
    : 'com.googleusercontent.apps.detail-unconfigured';

  expo.plugins = [
    ...(expo.plugins || []),
    './plugins/withAndroidKotlinVersion',
    './plugins/withMapboxDownloadToken',
    ['@twilio/voice-react-native-sdk', { apsEnvironment: 'production' }],
    ['react-native-nitro-google-signin', { iosUrlScheme }],
  ];
  expo.extra = {
    ...(expo.extra || {}),
    mapboxConfigured: Boolean(mapboxAccessToken),
    mapboxAccessToken: mapboxAccessToken || '',
    androidPushConfigured: Boolean(process.env.GOOGLE_SERVICES_JSON),
  };

  return expo;
};

// Keep the config executable for CI safety checks that invoke this file
// directly, while Expo itself consumes the exported dynamic config function.
if (require.main === module) module.exports();
