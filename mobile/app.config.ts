import type { ExpoConfig } from 'expo/config';

const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const isProd = appEnv === 'production';

// Permanent store identifier (cannot change after the first publish).
const BUNDLE_ID = 'br.com.joggahub.app';

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
    infoPlist: {
      // Only standard HTTPS/TLS: skips the export-compliance question on every upload.
      ITSAppUsesNonExemptEncryption: false,
    },
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
    // The image picker would otherwise add microphone/camera permissions we never use.
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-font',
    // Permission prompts (pt-BR). Only asked when the user taps the related button.
    ['expo-image-picker', { photosPermission: 'O JoggaHub usa suas fotos para você escolher a foto do seu perfil.', cameraPermission: false, microphonePermission: false }],
    ['expo-location', { locationWhenInUsePermission: 'O JoggaHub usa sua localização apenas para preencher sua cidade no perfil.' }],
    ['expo-splash-screen', { image: './assets/splash-icon.png', backgroundColor: '#7C3AED', imageWidth: 160 }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
