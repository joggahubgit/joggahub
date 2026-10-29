import type { ExpoConfig } from 'expo/config';

const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const isProd = appEnv === 'production';

// TODO(decision): confirm the final identifiers before the first store build.
// They cannot be changed after the app is published.
const BUNDLE_ID = 'com.joggahub.app';

const config: ExpoConfig = {
  name: isProd ? 'JoggaHub' : `JoggaHub (${appEnv})`,
  slug: 'joggahub',
  scheme: 'joggahub',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    // Separate IDs let dev and prod builds live side by side on one device.
    bundleIdentifier: isProd ? BUNDLE_ID : `${BUNDLE_ID}.${appEnv}`,
    supportsTablet: false,
  },
  android: {
    package: isProd ? BUNDLE_ID : `${BUNDLE_ID}.${appEnv}`,
    adaptiveIcon: {
      backgroundColor: '#7C3AED',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-font',
    ['expo-splash-screen', { image: './assets/splash-icon.png', backgroundColor: '#7C3AED', imageWidth: 160 }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
