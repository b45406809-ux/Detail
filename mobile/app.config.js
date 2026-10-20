const appJson = require('./app.json');
const { generateNotificationSounds } = require('./scripts/generate-notification-sounds');

// This runs before Expo/EAS resolves plugin assets, ensuring the ignored WAV
// artifacts exist for expo-notifications without committing binary files.
generateNotificationSounds();

const expo = appJson.expo;
const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
if (mapsApiKey) {
  expo.ios.config = { ...(expo.ios.config || {}), googleMapsApiKey: mapsApiKey };
  expo.android.config = { ...(expo.android.config || {}), googleMaps: { ...(expo.android.config?.googleMaps || {}), apiKey: mapsApiKey } };
}

module.exports = expo;
