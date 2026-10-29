// The web routes Aulas/Competições to mock screens topped by ComingSoonBanner.
// The app shows only the banner — no fake content.
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Construction } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PageHeader } from '@/components/ui/PageHeader';
import palette from '../../../tailwind.palette';

export function ComingSoonBanner({ label = 'Em breve' }: { label?: string }) {
  return (
    <View className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex-row items-center gap-3">
      <Construction size={20} color={palette.amber['600']} />
      <Text className="text-sm text-amber-800 flex-1">
        <Text className="text-sm font-semibold text-amber-800">{label}</Text> — esta funcionalidade ainda está em desenvolvimento.
      </Text>
    </View>
  );
}

export default function ComingSoon() {
  const { title } = useLocalSearchParams<{ title?: string }>();
  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader title={title ?? 'Em breve'} />
      <ComingSoonBanner />
    </View>
  );
}
