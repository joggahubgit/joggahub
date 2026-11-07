// Port of src/app/components/classes/ClassesPage.tsx (web).
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Search } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { VioletHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchMyActiveClassIds, fetchOpenClasses, type ClassCard } from '@/features/classes/api';
import { ClassListCard } from '@/features/classes/components';
import { normalizeText } from '@/lib/shared';
import palette from '../../../../tailwind.palette';

export default function ClassesScreen() {
  const { profile, session } = useAuth();
  const userId = session!.user.id;
  const [query, setQuery] = useState('');
  const q = useQuery({ queryKey: ['openClasses'], queryFn: fetchOpenClasses });
  const mine = useQuery({ queryKey: ['myActiveClassIds', userId], queryFn: () => fetchMyActiveClassIds(userId) });

  // Cursos da cidade do jogador primeiro; busca por curso, professor, clube ou cidade.
  const myCity = normalizeText((profile?.location ?? '').split(',')[0] ?? '');
  const visible = useMemo(() => {
    const term = normalizeText(query);
    const list = (q.data ?? []).filter(
      c => !term || normalizeText(`${c.title} ${c.coach_name} ${c.venues?.name ?? ''} ${c.venues?.city ?? ''}`).includes(term),
    );
    const local = (c: ClassCard) => (myCity && normalizeText(c.venues?.city ?? '').startsWith(myCity) ? 0 : 1);
    return [...list].sort((a, b) => local(a) - local(b) || a.start_date.localeCompare(b.start_date));
  }, [q.data, query, myCity]);

  return (
    <View className="flex-1 bg-gray-50">
      <VioletHeader title="Aulas" fallback="/">
        <Text className="text-sm text-violet-100 mb-4">Cursos com professor nos clubes. Inscreva-se e pague pelo app.</Text>
        <View className="bg-white rounded-xl p-3 flex-row items-center gap-3">
          <Search size={20} color={palette.gray['400']} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar curso, professor, clube ou cidade"
            placeholderTextColor={palette.gray['400']}
            className="flex-1 text-gray-700 text-sm p-0"
            style={{ fontFamily: 'Inter_400Regular' }}
            accessibilityLabel="Buscar cursos"
            returnKeyType="search"
          />
        </View>
      </VioletHeader>

      {q.isPending ? (
        <View className="items-center py-16"><ActivityIndicator color={palette.violet['600']} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={c => c.id}
          contentContainerClassName="px-6 py-5 gap-3 pb-10"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); mine.refetch(); }} tintColor={palette.violet['600']} />}
          renderItem={({ item }) => <ClassListCard c={item} enrolled={mine.data?.has(item.id)} />}
          ListEmptyComponent={
            <View className="items-center py-14">
              <GraduationCap size={48} color={palette.gray['300']} />
              <Text className="text-gray-600 font-semibold mt-3">{query ? 'Nenhum curso encontrado' : 'Nenhum curso aberto no momento'}</Text>
              <Text className="text-sm text-gray-400 mt-1 text-center">Quando os clubes abrirem turmas, elas aparecem aqui.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
