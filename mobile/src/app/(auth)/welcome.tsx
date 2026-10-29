// Port of src/app/components/Landing.tsx (web).
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Trophy, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import palette from '../../../tailwind.palette';

const FEATURES = [
  { Icon: MapPin, title: 'Quadras perto de você', desc: 'Mais de 500 quadras disponíveis' },
  { Icon: Users, title: 'Comunidade ativa', desc: 'Conecte-se com jogadores' },
  { Icon: Trophy, title: 'Competições', desc: 'Participe de campeonatos' },
];

export default function Welcome() {
  // On the web both CTAs open protected pages, which send visitors to /auth.
  const toAuth = () => router.push('/login');
  return (
    <LinearGradient colors={[palette.violet['600'], palette.violet['800']]} className="flex-1">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        <ScrollView>
          <View className="px-6 py-8">
            <View className="items-center">
              <View className="bg-white/10 rounded-full p-4 mb-4">
                <Image source={require('../../../assets/logo.png')} style={{ width: 64, height: 64 }} contentFit="contain" tintColor="#ffffff" />
              </View>
              <Text className="text-4xl font-bold mb-2 text-white">JoggaHub</Text>
              <Text className="text-lg text-violet-100">Onde a comunidade joga</Text>
            </View>
          </View>

          <View className="px-6 mb-8">
            <View className="bg-white/10 rounded-2xl overflow-hidden">
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80' }}
                style={{ width: '100%', height: 256 }}
                contentFit="cover"
                accessibilityLabel="Jogadores de futebol"
              />
            </View>
          </View>

          <View className="px-6 gap-4 mb-12">
            <Pressable onPress={toAuth} accessibilityRole="button" className="w-full bg-white py-4 rounded-xl items-center shadow-lg active:bg-violet-50">
              <Text className="text-violet-600 font-semibold text-lg">⚽ Encontrar jogo</Text>
            </Pressable>
            <Pressable onPress={toAuth} accessibilityRole="button" className="w-full bg-violet-500 py-4 rounded-xl items-center border-2 border-white/30 active:bg-violet-400">
              <Text className="text-white font-semibold text-lg">🏟️ Reservar quadra</Text>
            </Pressable>
          </View>

          <View className="px-6 pb-12 gap-4">
            {FEATURES.map(({ Icon, title, desc }) => (
              <View key={title} className="bg-white/10 rounded-xl p-4 flex-row items-center gap-4">
                <View className="bg-white/20 rounded-full p-3">
                  <Icon size={24} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-white text-base">{title}</Text>
                  <Text className="text-sm text-violet-100">{desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View className="px-6 pb-8 items-center">
            <Pressable onPress={toAuth} accessibilityRole="link" hitSlop={12}>
              <Text className="text-violet-100 underline text-base">Já tem uma conta? Entrar</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
