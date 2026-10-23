// Keep Mapbox's private DOWNLOADS:READ token out of the serialized Expo
// config. The upstream config plugin writes it only to native build files,
// which are consumed while resolving the native SDK dependency.
const mapboxPluginModule = require('@rnmapbox/maps/app.plugin');
const withMapbox = mapboxPluginModule.default || mapboxPluginModule;

module.exports = function withMapboxDownloadToken(config) {
  const token = process.env.MAPBOX_DOWNLOADS_TOKEN;
  return withMapbox(config, token ? { RNMapboxMapsDownloadToken: token } : {});
};
