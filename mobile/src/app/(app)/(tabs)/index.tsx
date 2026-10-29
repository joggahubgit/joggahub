import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchOpenGames, fetchUpcomingGames } from '@/features/games/api';
import { GameCard } from '@/features/games/GameCard';
import { Card } from '@/components/Card';
import { ErrorView, LoadingView } from '@/components/StateViews';
import { colors, fonts, spacing, type } from '@/theme/tokens';

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={type.heading} accessibilityRole="header">
        {title}
      </Text>
      {action && onAction && (
        <Text onPress={onAction} style={styles.sectionAction} accessibilityRole="link" suppressHighlighting>
          {action}
        </Text>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { profile, session } = useAuth();
  const userId = session!.user.id; // guaranteed by the (app) guard
  const firstName = profile?.name?.split(' ')[0];

  const upcoming = useQuery({ queryKey: ['upcomingGames', userId], queryFn: () => fetchUpcomingGames(userId) });
  const open = useQuery({ queryKey: ['openGames', 'home'], queryFn: () => fetchOpenGames(3) });

  const refreshing = upcoming.isRefetching || open.isRefetching;
  const refresh = () => Promise.all([upcoming.refetch(), open.refetch()]);

  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { refresh(); }} tintColor={colors.primary} />}
      >
        <View>
          <Text style={type.caption}>Olá,</Text>
          <Text style={type.title} accessibilityRole="header">
            {firstName ?? 'Jogador'}
          </Text>
        </View>

        <Card onPress={() => router.push('/games')} style={styles.search} accessibilityLabel="Encontrar partidas abertas">
          <Search size={20} color={colors.primary} />
          <Text style={[type.label, styles.fill]}>Encontrar partidas</Text>
          <ChevronRight size={20} color={colors.textMuted} />
        </Card>

        <SectionHeader title="Próximas partidas" />
        {upcoming.isPending ? (
          <LoadingView />
        ) : upcoming.isError ? (
          <ErrorView onRetry={() => upcoming.refetch()} />
        ) : upcoming.data.length ? (
          upcoming.data.slice(0, 5).map(g => <GameCard key={g.id} {...g} />)
        ) : (
          <Card>
            <Text style={type.label}>Nenhuma partida marcada</Text>
            <Text style={type.caption}>Entre numa partida aberta ou reserve uma quadra.</Text>
          </Card>
        )}

        <SectionHeader title="Partidas abertas" action="Ver todas" onAction={() => router.push('/games')} />
        {open.isPending ? (
          <LoadingView />
        ) : open.isError ? (
          <ErrorView onRetry={() => open.refetch()} />
        ) : open.data.length ? (
          open.data.map(g => <GameCard key={g.id} {...g} />)
        ) : (
          <Card>
            <Text style={type.caption}>Nenhuma partida aberta com vagas no momento.</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  sectionAction: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary, padding: spacing.sm },
});
