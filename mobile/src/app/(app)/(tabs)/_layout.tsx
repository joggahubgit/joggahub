import { Tabs } from 'expo-router';
import { House, User } from 'lucide-react-native';
import { colors, fonts } from '@/theme/tokens';

// Mirrors the web BottomNav (Início / Comunidade / Perfil). Comunidade, Quadras
// and Partidas are added in Phase 3/4 with their real data — no placeholder tabs.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Início', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tabs>
  );
}
