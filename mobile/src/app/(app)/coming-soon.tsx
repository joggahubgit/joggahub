// The web routes Aulas/Competições to mock screens topped by ComingSoonBanner.
// The app shows only the banner — no fake content.
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { ComingSoonBanner } from '@/components/ui/ComingSoonBanner';

export default function ComingSoon() {
  const { title } = useLocalSearchParams<{ title?: string }>();
  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader title={title ?? 'Em breve'} />
      <ComingSoonBanner />
    </View>
  );
}
