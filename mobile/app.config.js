const appJson = require('./app.json');
const { generateNotificationSounds } = require('./scripts/generate-notification-sounds');

// This runs before Expo/EAS resolves plugin assets, ensuring the ignored WAV
// artifacts exist for expo-notifications without committing binary files.
generateNotificationSounds();

module.exports = appJson.expo;
