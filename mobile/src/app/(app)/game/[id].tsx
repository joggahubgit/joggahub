import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { Clock, Crown, MapPin, Share2 } from 'lucide-react-native';
import { fetchGameDetail, type GameDetail, type GamePlayer } from '@/features/games/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyView, ErrorView, LoadingView } from '@/components/StateViews';
import { getEnv } from '@/lib/env';
import { formatBRL, gameWhen, sportLabel } from '@/lib/format';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

function statusBadge(g: GameDetail) {
  if (g.status === 'confirmed_booking') return <Badge label="Confirmada" tone="success" />;
  if (g.status === 'pending_results') return <Badge label="Aguardando resultado" tone="warning" />;
  if (g.status === 'completed') return <Badge label="Encerrada" tone="neutral" />;
  return g.isPrivate ? <Badge label="Agendada" tone="neutral" /> : <Badge label="Aguardando jogadores" tone="primary" />;
}

function shareMessage(g: GameDetail, url: string) {
  const head = g.isPrivate ? '🔒 Partida privada no JoggaHub!' : '⚽ Partida aberta no JoggaHub!';
  const spots = g.maxPlayers - g.currentPlayers;
  return [
    head,
    '',
    `🏟️ ${sportLabel(g.sport)}`,
    `📅 ${gameWhen(g.scheduledAt, g.endAt)}`,
    `📍 ${g.courtName}${g.venueName ? ` · ${g.venueName}` : ''}`,
    ...(g.isPrivate ? [] : [`👥 ${g.currentPlayers}/${g.maxPlayers} jogadores${spots > 0 ? ` · ${spots} vagas` : ''}`]),
    '',
    url,
  ].join('\n');
}

function PlayerRow({ p, isMe }: { p: GamePlayer; isMe: boolean }) {
  return (
    <View style={styles.player} accessible accessibilityLabel={`${p.name}${p.isOrganizer ? ', organizador' : ''}${isMe ? ', você' : ''}`}>
      <Avatar name={p.name} url={p.avatarUrl} size={40} />
      <View style={styles.flex}>
        <Text style={type.label} numberOfLines={1}>
          {p.name}
          {isMe ? ' (você)' : ''}
        </Text>
        {p.isOrganizer && (
          <View style={styles.inline}>
            <Crown size={13} color={colors.warning} />
            <Text style={type.caption}>Organizador</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const myId = session?.user.id;
  const q = useQuery({ queryKey: ['game', id], queryFn: () => fetchGameDetail(id), enabled: !!id });

  if (q.isPending) return <LoadingView />;
  if (q.isError) return <ErrorView onRetry={() => q.refetch()} />;
  const g = q.data;
  if (!g) return <EmptyView emoji="🔍" title="Partida não encontrada" />;
  if (g.unavailable) {
    return (
      <EmptyView
        emoji={g.unavailable === 'cancelled' ? '🚫' : '⏱️'}
        title={g.unavailable === 'cancelled' ? 'Partida cancelada' : 'Partida encerrada'}
        message="Esta partida não está mais ativa."
      />
    );
  }

  const webUrl = `${getEnv().webUrl}/open-game/${g.id}`;
  const isEnrolled = g.players.some(p => p.id === myId && (p.isOrganizer || p.paid));
  const spots = Math.max(0, g.maxPlayers - g.currentPlayers);
  const isFutevolei = g.sport === 'futevolei';
  const teamA = g.players.filter(p => p.team === 'a');
  const teamB = g.players.filter(p => p.team === 'b');

  return (
    <>
      <Stack.Screen options={{ title: sportLabel(g.sport) }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.primary} />}
      >
        <Card>
          <View style={styles.row}>
            <Text style={type.title}>{sportLabel(g.sport)}</Text>
            {statusBadge(g)}
          </View>
          <View style={styles.inline}>
            <Clock size={16} color={colors.textSecondary} />
            <Text style={type.body}>{gameWhen(g.scheduledAt, g.endAt)}</Text>
          </View>
          <View style={styles.inline}>
            <MapPin size={16} color={colors.textSecondary} />
            <Text style={[type.body, styles.flex]}>
              {g.courtName}
              {g.venueName ? ` · ${g.venueName}` : ''}
            </Text>
          </View>
          {!!g.venueAddress && <Text style={type.caption}>{g.venueAddress}</Text>}
          {!g.isPrivate && (
            <Text style={styles.price}>
              {formatBRL(g.pricePerPlayer)} <Text style={type.caption}>por jogador + taxa</Text>
            </Text>
          )}
        </Card>

        <Card>
          <View style={styles.row}>
            <Text style={type.heading}>Jogadores</Text>
            <Text style={type.caption}>
              {g.currentPlayers}/{g.maxPlayers}
            </Text>
          </View>
          {!g.isPrivate && g.status === 'scheduled' && (
            <Text style={type.caption}>
              {g.currentPlayers >= g.minPlayers
                ? 'Mínimo atingido.'
                : `Faltam ${g.minPlayers - g.currentPlayers} para o mínimo de ${g.minPlayers}.`}
              {spots > 0 ? ` ${spots} ${spots === 1 ? 'vaga livre' : 'vagas livres'}.` : ''}
            </Text>
          )}

          {isFutevolei ? (
            <View style={styles.teams}>
              {[
                { label: 'Dupla A', list: teamA },
                { label: 'Dupla B', list: teamB },
              ].map(t => (
                <View key={t.label} style={styles.team}>
                  <Text style={styles.teamLabel}>{t.label}</Text>
                  {t.list.length ? (
                    t.list.map(p => <PlayerRow key={p.id} p={p} isMe={p.id === myId} />)
                  ) : (
                    <Text style={type.caption}>Vagas abertas</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            g.players.map(p => <PlayerRow key={p.id} p={p} isMe={p.id === myId} />)
          )}
        </Card>

        <Button
          title="Compartilhar partida"
          variant="secondary"
          onPress={() => Share.share({ message: shareMessage(g, webUrl) }).catch(() => {})}
          accessibilityHint="Abre o menu de compartilhamento"
        />

        {/* Money-moving actions (join/leave/cancel/pay) ship in the payment phase. */}
        <Card style={styles.notice}>
          <View style={styles.inline}>
            <Share2 size={16} color={colors.primary} />
            <Text style={type.label}>{isEnrolled ? 'Você está nesta partida' : 'Entrar na partida'}</Text>
          </View>
          <Text style={type.caption}>
            {isEnrolled
              ? 'Sair ou cancelar pelo app chega em breve. Por enquanto, use o site.'
              : 'Entrar e pagar pelo app chega em breve. Por enquanto, use o site.'}
          </Text>
          <Button title="Abrir no site" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(webUrl).catch(() => {})} />
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  price: { fontFamily: fonts.bold, fontSize: 18, color: colors.primary, marginTop: spacing.xs },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  teams: { flexDirection: 'row', gap: spacing.md },
  team: { flex: 1, gap: spacing.xs, backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.md },
  teamLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
  notice: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
});
