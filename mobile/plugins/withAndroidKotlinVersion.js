const { withGradleProperties } = require('@expo/config-plugins');

const KOTLIN_VERSION = '2.1.21';

module.exports = function withAndroidKotlinVersion(config) {
  return withGradleProperties(config, (config) => {
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
};
