// Aba "Aulas" da quadra no app (web: src/app/components/classes/CourtClassesTab.tsx).
import { ActivityIndicator, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { fetchCourtClasses } from './api';
import { ClassListCard } from './components';
import palette from '../../../tailwind.palette';

export function CourtClassesTab({ courtId }: { courtId: string }) {
  const q = useQuery({ queryKey: ['courtClasses', courtId], queryFn: () => fetchCourtClasses(courtId) });
  if (q.isPending) return <View className="items-center py-10"><ActivityIndicator color={palette.violet['600']} /></View>;
  if (!q.data?.length) {
    return (
      <View className="items-center py-10">
        <GraduationCap size={40} color={palette.gray['300']} />
        <Text className="text-sm text-gray-500 mt-3">Nenhuma aula disponível nesta quadra.</Text>
      </View>
    );
  }
  return <View className="gap-3">{q.data.map(c => <ClassListCard key={c.id} c={c} />)}</View>;
}
