const { withPodfile } = require('@expo/config-plugins');

// React Native's RCT-Folly pod intentionally omits its generated config header
// when FOLLY_NO_CONFIG is set. NitroModules' Clang module scan can still look
// for the header, so provide the empty stub that this no-config mode expects.
module.exports = function withFollyConfigStub(config) {
  return withPodfile(config, (config) => {
    const marker = '# Detail Folly no-config header for NitroModules';
    if (config.modResults.contents.includes(marker)) return config;

    const postInstall = /(\n\s*react_native_post_install\([\s\S]*?\n\s*\)\n)/;
    if (!postInstall.test(config.modResults.contents)) {
      throw new Error('Unable to locate react_native_post_install in the generated Podfile.');
    }

    const workaround = `\n    ${marker}\n    require 'fileutils'\n    folly_config_paths = [\n      File.join(installer.sandbox.root, 'RCT-Folly', 'folly', 'folly-config.h'),\n      File.join(installer.sandbox.root, 'Headers', 'Public', 'RCT-Folly', 'folly', 'folly-config.h')\n    ]\n    folly_config_paths.each do |folly_config|\n      FileUtils.mkdir_p(File.dirname(folly_config))\n      File.write(folly_config, "#pragma once\\n#define FOLLY_HAS_COROUTINES 0\\n") unless File.exist?(folly_config)\n    end\n`;
    config.modResults.contents = config.modResults.contents.replace(
      postInstall,
      (_match, hook) => `${hook}${workaround}`,
    );
    return config;
  });
};
