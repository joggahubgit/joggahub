// Port of src/app/components/FindGames.tsx (web).
// Deviation: the web's search box doesn't filter anything; here it filters by club/court/sport.
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Clock, Search, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { VioletHeader } from '@/components/ui/PageHeader';
import { fetchOpenGames, type OpenGame } from '@/features/games/api';
import { wallDate, wallTime } from '@/lib/shared';
import palette from '../../../tailwind.palette';

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', society: 'Society', futsal: 'Futsal',
  tennis: 'Tênis', padel: 'Padel', basketball: 'Basquete',
  volleyball: 'Vôlei', beach_tennis: 'Beach Tennis', futevolei: 'Futevôlei',
};

function GameRow({ game }: { game: OpenGame }) {
  const spotsLeft = game.maxPlayers - game.currentPlayers;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/game/[id]', params: { id: game.id } })}
      className="bg-white rounded-2xl border border-gray-200 p-5"
    >
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1">
          <Text className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-0.5">{SPORT_LABELS[game.sport] ?? game.sport}</Text>
          <Text className="font-bold text-gray-900 text-base">{game.venueName || '—'}</Text>
          <Text className="text-sm text-gray-500">{game.courtName}</Text>
        </View>
        <View className="items-end">
          <Text className="text-xl font-bold text-violet-600">R$ {game.pricePerPlayer}</Text>
          <Text className="text-xs text-gray-400">por pessoa</Text>
        </View>
      </View>

      <View className="flex-row items-center gap-1.5 mb-3">
        <Clock size={16} color={palette.gray['600']} />
        <Text className="text-sm text-gray-600">
          {wallDate(game.scheduledAt, { weekday: 'short', day: 'numeric', month: 'short' })} · {wallTime(game.scheduledAt)}
        </Text>
      </View>

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Users size={16} color={palette.gray['400']} />
          <Text className="text-sm font-semibold text-gray-900">
            {game.currentPlayers}/{game.maxPlayers}
          </Text>
          <Text className="text-sm text-gray-500">jogadores</Text>
        </View>
        {spotsLeft > 0 ? (
          <View className="px-2.5 py-1 bg-green-100 rounded-full">
            <Text className="text-green-700 text-xs font-bold">
              {spotsLeft} {spotsLeft === 1 ? 'vaga' : 'vagas'}
            </Text>
          </View>
        ) : (
          <View className="px-2.5 py-1 bg-red-100 rounded-full">
            <Text className="text-red-600 text-xs font-bold">Completo</Text>
          </View>
        )}
      </View>

      <View className="mt-3 flex-row gap-1">
        {Array.from({ length: game.maxPlayers }).map((_, i) => (
          <View key={i} className={`flex-1 h-1.5 rounded-full ${i < game.currentPlayers ? 'bg-violet-600' : 'bg-gray-200'}`} />
        ))}
      </View>
    </Pressable>
  );
}

export default function FindGames() {
  const q = useQuery({ queryKey: ['openGames'], queryFn: () => fetchOpenGames() });
  const [search, setSearch] = useState('');
  const games = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return q.data ?? [];
    return (q.data ?? []).filter(g =>
      [g.venueName, g.courtName, SPORT_LABELS[g.sport] ?? g.sport, g.venueAddress].join(' ').toLowerCase().includes(term),
    );
  }, [q.data, search]);

  return (
    <View className="flex-1 bg-gray-50">
      <VioletHeader title="Encontrar Jogos" fallback="/">
        <View className="bg-white rounded-xl p-3 flex-row items-center gap-3">
          <Search size={20} color={palette.gray['400']} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar jogos..."
            placeholderTextColor={palette.gray['400']}
            className="flex-1 text-gray-700 text-sm p-0"
            style={{ fontFamily: 'Inter_400Regular' }}
            accessibilityLabel="Buscar jogos"
            returnKeyType="search"
          />
        </View>
      </VioletHeader>

      <FlatList
        data={games}
        keyExtractor={g => g.id}
        contentContainerClassName="px-6 py-6 gap-4"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={palette.violet['600']} />}
        ListHeaderComponent={
          q.isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={palette.gray['500']} />
              <Text className="text-sm font-semibold text-gray-500">Carregando jogos...</Text>
            </View>
          ) : (
            <Text className="text-sm font-semibold text-gray-500">
              {q.isError ? 'Não foi possível carregar. Puxe para tentar de novo.' : `${games.length} ${games.length === 1 ? 'jogo encontrado' : 'jogos encontrados'}`}
            </Text>
          )
        }
        ListEmptyComponent={
          q.isPending || q.isError ? undefined : (
            <View className="items-center py-20 gap-2">
              <Text className="text-4xl">⚽</Text>
              <Text className="font-semibold text-gray-700 text-base">Nenhum jogo aberto</Text>
              <Text className="text-sm text-gray-400">Que tal criar o primeiro?</Text>
            </View>
          )
        }
        renderItem={({ item }) => <GameRow game={item} />}
      />
    </View>
  );
}
