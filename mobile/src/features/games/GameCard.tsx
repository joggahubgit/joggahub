import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Clock, MapPin, Users } from 'lucide-react-native';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { formatBRL, gameWhen, sportLabel } from '@/lib/format';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';
import type { GameStatusKind } from './api';

const STATUS: Record<GameStatusKind, { label: string; tone: 'success' | 'warning' | 'primary' | 'neutral' }> = {
  pending_payment: { label: 'Pagamento pendente', tone: 'warning' },
  confirmed: { label: 'Confirmada', tone: 'success' },
  waiting: { label: 'Aguardando jogadores', tone: 'primary' },
  scheduled: { label: 'Agendada', tone: 'neutral' },
};

interface Props {
  id: string;
  sport: string;
  courtName: string;
  venueName: string;
  scheduledAt: string;
  endAt?: string | null;
  currentPlayers: number;
  maxPlayers: number;
  statusKind?: GameStatusKind;
  pricePerPlayer?: number;
}

export function GameCard(p: Props) {
  const filled = p.maxPlayers ? Math.min(1, p.currentPlayers / p.maxPlayers) : 0;
  const spots = Math.max(0, p.maxPlayers - p.currentPlayers);
  const status = p.statusKind ? STATUS[p.statusKind] : null;

  return (
    <Card
      onPress={() => router.push({ pathname: '/game/[id]', params: { id: p.id } })}
      accessibilityLabel={`${sportLabel(p.sport)} em ${p.courtName}, ${gameWhen(p.scheduledAt)}, ${p.currentPlayers} de ${p.maxPlayers} jogadores`}
    >
      <View style={styles.row}>
        <Text style={styles.sport}>{sportLabel(p.sport)}</Text>
        {status ? <Badge label={status.label} tone={status.tone} /> : null}
        {p.pricePerPlayer != null && !status ? <Text style={styles.price}>{formatBRL(p.pricePerPlayer)}</Text> : null}
      </View>

      <View style={styles.line}>
        <MapPin size={15} color={colors.textSecondary} />
        <Text style={type.caption} numberOfLines={1}>
          {p.courtName}
          {p.venueName ? ` · ${p.venueName}` : ''}
        </Text>
      </View>
      <View style={styles.line}>
        <Clock size={15} color={colors.textSecondary} />
        <Text style={type.caption}>{gameWhen(p.scheduledAt, p.endAt)}</Text>
      </View>

      <View style={styles.line}>
        <Users size={15} color={colors.textSecondary} />
        <Text style={type.caption}>
          {p.currentPlayers}/{p.maxPlayers} jogadores
          {spots > 0 ? ` · ${spots} ${spots === 1 ? 'vaga' : 'vagas'}` : ' · completa'}
        </Text>
      </View>
      <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.fill, { width: `${filled * 100}%` }]} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sport: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  price: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bar: { height: 6, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden', marginTop: spacing.xs },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.full },
});
