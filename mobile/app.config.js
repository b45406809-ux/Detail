const appJson = require('./app.json');
const { generateNotificationSounds } = require('./scripts/generate-notification-sounds');

// This runs before Expo/EAS resolves plugin assets, ensuring the ignored WAV
// artifacts exist for expo-notifications without committing binary files.
generateNotificationSounds();

const expo = appJson.expo;
const mapboxAccessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const mapboxDownloadsToken = process.env.MAPBOX_DOWNLOADS_TOKEN;
if (process.env.EAS_BUILD_PROFILE && (!mapboxAccessToken || !mapboxDownloadsToken)) {
  throw new Error('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN and MAPBOX_DOWNLOADS_TOKEN are required for EAS builds.');
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
