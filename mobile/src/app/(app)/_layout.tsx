import { Stack } from 'expo-router';
import { colors, fonts } from '@/theme/tokens';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { fontFamily: fonts.semibold, color: colors.text },
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="games" options={{ title: 'Partidas abertas' }} />
      <Stack.Screen name="game/[id]" options={{ title: 'Partida' }} />
      <Stack.Screen name="courts" options={{ title: 'Quadras' }} />
      <Stack.Screen name="court/[id]" options={{ title: 'Quadra' }} />
    </Stack>
  );
}
