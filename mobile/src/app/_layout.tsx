import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { envResult } from '@/lib/env';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { colors, spacing } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { session, initializing } = useAuth();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync().catch(() => {});
  }, [initializing]);

  if (initializing) return null; // native splash stays visible

  const signedIn = !!session;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Guards: screens are unreachable — even by deep link — unless the condition holds. */}
      <Stack.Protected guard={signedIn}>
        {/* Every signed-in screen lives under (app) so new routes are protected by default. */}
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function ConfigError({ message }: { message: string }) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <View style={styles.error}>
      <Text style={styles.errorTitle}>Build mal configurado</Text>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Fall back to system fonts rather than hanging on the splash if loading fails.
  if (!fontsLoaded && !fontError) return null;
  if (!envResult.ok) return <ConfigError message={envResult.error} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  error: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, backgroundColor: colors.background },
  errorTitle: { fontSize: 20, fontWeight: '700', color: colors.danger },
  errorText: { fontSize: 15, color: colors.text },
});
