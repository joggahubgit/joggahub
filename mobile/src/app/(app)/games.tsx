import { FlatList, RefreshControl, StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchOpenGames } from '@/features/games/api';
import { GameCard } from '@/features/games/GameCard';
import { EmptyView, ErrorView, LoadingView } from '@/components/StateViews';
import { colors, spacing, type } from '@/theme/tokens';

export default function OpenGamesScreen() {
  const q = useQuery({ queryKey: ['openGames'], queryFn: () => fetchOpenGames() });

  if (q.isPending) return <LoadingView />;
  if (q.isError) return <ErrorView onRetry={() => q.refetch()} />;

  return (
    <FlatList
      data={q.data}
      keyExtractor={g => g.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.primary} />}
      ListHeaderComponent={
        q.data.length ? (
          <Text style={type.caption}>
            {q.data.length} {q.data.length === 1 ? 'partida com vagas' : 'partidas com vagas'}
          </Text>
        ) : undefined
      }
      ListEmptyComponent={
        <EmptyView emoji="⚽" title="Nenhuma partida aberta" message="Novas partidas aparecem aqui assim que forem criadas." />
      }
      renderItem={({ item }) => <GameCard {...item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
});
