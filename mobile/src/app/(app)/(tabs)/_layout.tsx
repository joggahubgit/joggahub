// Port of src/app/components/BottomNav.tsx (web): Início / Comunidade / Perfil.
import { Tabs } from 'expo-router';
import { House, User, Users } from 'lucide-react-native';
import palette from '../../../../tailwind.palette';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.violet['600'],
        tabBarInactiveTintColor: palette.gray['400'],
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: palette.gray['200'], borderTopWidth: 1, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: 'Inter_400Regular', fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: ({ color }) => <House color={color} size={24} /> }} />
      <Tabs.Screen name="community" options={{ title: 'Comunidade', tabBarIcon: ({ color }) => <Users color={color} size={24} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ({ color }) => <User color={color} size={24} /> }} />
    </Tabs>
  );
}
