const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Pure business-rule modules are shared with the web app (no imports, covered
// by the web's Vitest suite). Only this folder is exposed — never web UI code.
config.watchFolders = [path.resolve(__dirname, '../src/app/lib')];

module.exports = config;
