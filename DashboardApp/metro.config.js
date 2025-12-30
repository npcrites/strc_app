/**
 * Metro configuration for React Native
 * https://facebook.github.io/metro/docs/configuration
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Reduce file watching to prevent EMFILE errors
config.watchFolders = [__dirname];
config.resolver.blockList = [
  // Block watching node_modules to reduce file count
  /node_modules\/.*\/node_modules\/react-native\/.*/,
];

// Reduce the number of files Metro watches
config.watcher = {
  additionalExts: ['cjs', 'mjs'],
  healthCheck: {
    enabled: true,
  },
};

module.exports = config;

