const appJson = require('./app.json');
const { generateNotificationSounds } = require('./scripts/generate-notification-sounds');

if (process.env.EAS_BUILD_PROFILE === 'production' && process.env.EXPO_PUBLIC_DEMO_MODE === 'true') {
  throw new Error('Demo mode is prohibited in the EAS production build profile.');
}

// This runs before Expo/EAS resolves plugin assets, ensuring the ignored WAV
// artifacts exist for expo-notifications without committing binary files.
generateNotificationSounds();

const expo = appJson.expo;
const mapboxAccessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const mapboxDownloadsToken = process.env.MAPBOX_DOWNLOADS_TOKEN;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (process.env.EAS_BUILD_PROFILE && (!mapboxAccessToken || !mapboxDownloadsToken)) {
  throw new Error('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN and MAPBOX_DOWNLOADS_TOKEN are required for EAS builds.');
}
if (process.env.EAS_BUILD_PROFILE && (!supabaseUrl || !supabasePublicKey)) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required for EAS builds.');
}
if (supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl)) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL must be the HTTPS URL of the Supabase project.');
}
if (supabasePublicKey && !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(supabasePublicKey)) {
  throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY must be a Supabase publishable or legacy anon key.');
}
expo.plugins = [
  ...(expo.plugins || []),
  './plugins/withMapboxDownloadToken',
];
expo.extra = {
  ...(expo.extra || {}),
  mapboxConfigured: Boolean(mapboxAccessToken),
  mapboxAccessToken: mapboxAccessToken || '',
};

module.exports = expo;
