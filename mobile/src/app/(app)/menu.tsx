// Port of src/app/components/MenuPage.tsx (web).
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { Calendar, ChevronRight, CreditCard, FileText, HelpCircle, Settings, Shield, User } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import palette from '../../../tailwind.palette';

const COLORS: Record<string, { bg: string; fg: string }> = {
  blue: { bg: 'bg-violet-100', fg: palette.violet['600'] },
  purple: { bg: 'bg-purple-100', fg: palette.purple['600'] },
  orange: { bg: 'bg-orange-100', fg: palette.orange['600'] },
  gray: { bg: 'bg-gray-100', fg: palette.gray['600'] },
};

const ITEMS: { Icon: typeof Calendar; label: string; description: string; href: Href; color: string }[] = [
  { Icon: Calendar, label: 'Minhas Reservas', description: 'Histórico e gestão de reservas', href: '/my-bookings', color: 'blue' },
  { Icon: CreditCard, label: 'Pagamentos', description: 'Métodos de pagamento e histórico', href: '/payments', color: 'purple' },
  { Icon: Settings, label: 'Configurações', description: 'Preferências do app', href: '/settings', color: 'gray' },
  { Icon: HelpCircle, label: 'Ajuda', description: 'Central de ajuda e suporte', href: '/help', color: 'orange' },
  { Icon: FileText, label: 'Termos de uso', description: 'Leia nossos termos', href: '/terms', color: 'gray' },
  { Icon: Shield, label: 'Política de privacidade', description: 'Como protegemos seus dados', href: '/privacy', color: 'gray' },
];

export default function MenuScreen() {
  const { session, profile, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  async function handleSignOut() {
    if (leaving) return;
    setLeaving(true);
    try {
      await signOut(); // the root guard then shows the welcome screen, like navigate('/') on the web
    } catch {
      setLeaving(false);
    }
  }

  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader title="Menu" />
      <ScrollView>
        <View className="px-6 py-6">
          <LinearGradient
            colors={[palette.violet['600'], palette.violet['700']]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 16, padding: 24 }}
          >
            <View className="flex-row items-center gap-4">
              <View className="w-16 h-16 bg-white/20 rounded-full items-center justify-center">
                <User size={32} color="#ffffff" />
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-white">{profile?.name ?? 'Jogador'}</Text>
                <Text className="text-sm text-violet-100">{session?.user.email}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View className="px-6 pb-6">
          <View className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {ITEMS.map(({ Icon, ...item }, i) => {
              const c = COLORS[item.color];
              return (
                <Pressable
                  key={item.label}
                  onPress={() => router.push(item.href)}
                  accessibilityRole="button"
                  className={`w-full flex-row items-center gap-4 p-4 active:bg-gray-50 ${i !== ITEMS.length - 1 ? 'border-b border-gray-100' : ''}`}
                >
                  <View className={`w-12 h-12 rounded-xl items-center justify-center ${c.bg}`}>
                    <Icon size={24} color={c.fg} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900 text-base">{item.label}</Text>
                    <Text className="text-sm text-gray-500">{item.description}</Text>
                  </View>
                  <ChevronRight size={20} color={palette.gray['400']} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="px-6 pb-6">
          <Pressable
            onPress={handleSignOut}
            disabled={leaving}
            accessibilityRole="button"
            className={`w-full bg-red-50 py-4 rounded-xl items-center active:bg-red-100 ${leaving ? 'opacity-60' : ''}`}
          >
            <Text className="text-red-600 font-semibold text-base">Sair da conta</Text>
          </Pressable>
        </View>

        <View className="px-6 pb-6 items-center">
          <Text className="text-sm text-gray-400">JoggaHub v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
