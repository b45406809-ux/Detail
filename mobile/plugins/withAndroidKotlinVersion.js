const { withGradleProperties, withProjectBuildGradle } = require('@expo/config-plugins');

const KOTLIN_VERSION = '2.1.21';

module.exports = function withAndroidKotlinVersion(config) {
  config = withGradleProperties(config, (config) => {
    const properties = config.modResults;
    const existing = properties.findIndex(
      (property) => property.type === 'property' && property.key === 'android.kotlinVersion',
    );

    const property = {
      type: 'property',
      key: 'android.kotlinVersion',
      value: KOTLIN_VERSION,
    };

    if (existing === -1) {
      properties.push(property);
    } else {
      properties[existing] = property;
    }

    return config;
  });

  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config;

    // Keep the generated root build script aligned with the Gradle property.
    // Some Expo module scripts read the root ext version during buildscript
    // evaluation and otherwise fall back to Kotlin 1.9.25.
    config.modResults.contents = config.modResults.contents.replace(
      /kotlinVersion\s*=\s*findProperty\('android\.kotlinVersion'\)\s*\?:\s*'[^']+'/,
      `kotlinVersion = findProperty('android.kotlinVersion') ?: '${KOTLIN_VERSION}'`,
    );
    return config;
  });
};
