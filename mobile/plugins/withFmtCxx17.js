const { withPodfile } = require('@expo/config-plugins');

// React Native 0.79 pins fmt 11.0.2. Apple Clang 21 in Xcode 26 rejects
// fmt's consteval formatting paths when fmt is compiled as C++20. Keep the
// workaround scoped to the fmt pod; the app and the other pods retain their
// configured language standard.
module.exports = function withFmtCxx17(config) {
  return withPodfile(config, (config) => {
    const marker = '# Detail fmt Xcode 26 compatibility';
    if (config.modResults.contents.includes(marker)) return config;

    const postInstall = /(\n\s*react_native_post_install\([\s\S]*?\n\s*\)\n)/;
    if (!postInstall.test(config.modResults.contents)) {
      throw new Error('Unable to locate react_native_post_install in the generated Podfile.');
    }

    const workaround = `\n    ${marker}\n    installer.pods_project.targets.each do |target|\n      next unless target.name == 'fmt'\n\n      target.build_configurations.each do |build_config|\n        build_config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'\n      end\n    end\n`;
    config.modResults.contents = config.modResults.contents.replace(
      postInstall,
      (_match, hook) => `${hook}${workaround}`,
    );
    return config;
  });
};
