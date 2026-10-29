import { useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, Phone } from 'lucide-react-native';
import { fetchCourtPage, fetchSlotGrid } from '@/features/courts/api';
import { DURATIONS, nextDays, type Duration, type SlotItem } from '@/features/courts/schedule';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyView, ErrorView, LoadingView } from '@/components/StateViews';
import { getEnv } from '@/lib/env';
import { formatBRL, sportLabel } from '@/lib/format';
import { useRealtimeRefetch } from '@/lib/useRealtimeRefetch';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

type Tab = 'book' | 'club';

interface Selection {
  courtId: string;
  courtName: string;
  slot: SlotItem;
}

function SlotChip({ slot, duration, selected, onPress }: { slot: SlotItem; duration: Duration; selected: boolean; onPress: () => void }) {
  const available = duration === 90 ? slot.available90 : slot.available120;
  const hasGame = !!slot.gameId;
  const label = hasGame
    ? `${slot.time}, partida aberta`
    : available
      ? `${slot.time}, disponível`
      : `${slot.time}, indisponível`;
  return (
    <Pressable
      onPress={available || hasGame ? onPress : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !available && !hasGame, selected }}
      style={[
        styles.slot,
        hasGame && styles.slotGame,
        !available && !hasGame && styles.slotOff,
        selected && styles.slotSelected,
      ]}
    >
      <Text
        style={[
          styles.slotText,
          hasGame && styles.slotGameText,
          !available && !hasGame && styles.slotOffText,
          selected && styles.slotSelectedText,
        ]}
      >
        {slot.time}
      </Text>
      {hasGame && <Text style={styles.slotSub}>partida</Text>}
    </Pressable>
  );
}

export default function CourtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const days = useMemo(() => nextDays(14), []);
  const [tab, setTab] = useState<Tab>('book');
  const [date, setDate] = useState(days[1].date); // tomorrow by default, like the web
  const [duration, setDuration] = useState<Duration>(90);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);

  const page = useQuery({ queryKey: ['court', id], queryFn: () => fetchCourtPage(id), enabled: !!id });
  const courts = page.data?.courts ?? [];
  const grid = useQuery({
    queryKey: ['slots', courts.map(c => c.id).join(','), date],
    queryFn: () => fetchSlotGrid(courts, date),
    enabled: courts.length > 0,
    staleTime: 0, // availability must always be fresh
  });

  // The club can change availability or cancel a booking at any time.
  useRealtimeRefetch(courts.length ? `court-slots-${id}` : null, ['slots', 'bookings'], () => {
    setSelection(null);
    grid.refetch();
  });

  if (page.isPending) return <LoadingView />;
  if (page.isError) return <ErrorView onRetry={() => page.refetch()} />;
  if (!page.data) return <EmptyView emoji="🔍" title="Quadra não encontrada" />;

  const { venue, images, amenities } = page.data;
  const webUrl = `${getEnv().webUrl}/court-details/${id}`;

  const pick = (courtId: string, courtName: string, slot: SlotItem) => {
    if (slot.gameId) {
      router.push({ pathname: '/game/[id]', params: { id: slot.gameId } });
      return;
    }
    setSelection(prev => (prev?.slot.id === slot.id ? null : { courtId, courtName, slot }));
  };

  const selEnd = selection ? (duration === 90 ? selection.slot.endTime90 : selection.slot.endTime120) : '';
  const selPrice = selection ? selection.slot.pricePerHour * (duration / 60) : 0;

  return (
    <>
      <Stack.Screen options={{ title: venue?.name ?? 'Quadra' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={page.isRefetching || grid.isRefetching}
            onRefresh={() => {
              page.refetch();
              grid.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {images[0] ? (
          <Image source={{ uri: images[0] }} style={styles.hero} contentFit="cover" cachePolicy="memory-disk" />
        ) : null}

        <View style={styles.titleBlock}>
          <Text style={type.title}>{venue?.name ?? 'Quadra'}</Text>
          {!!(venue?.address || venue?.city) && (
            <View style={styles.inline}>
              <MapPin size={15} color={colors.textSecondary} />
              <Text style={[type.caption, styles.flex]}>{[venue?.address, venue?.city].filter(Boolean).join(' · ')}</Text>
            </View>
          )}
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {(['book', 'club'] as Tab[]).map(t => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'book' ? 'Agendar' : 'Clube'}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'club' ? (
          <Card>
            {!!venue?.description && <Text style={type.body}>{venue.description}</Text>}
            {!!venue?.openingHours && (
              <View style={styles.inline}>
                <Clock size={15} color={colors.textSecondary} />
                <Text style={type.caption}>{venue.openingHours}</Text>
              </View>
            )}
            {!!venue?.phone && (
              <Pressable onPress={() => Linking.openURL(`tel:${venue.phone}`)} accessibilityRole="link" style={styles.inline}>
                <Phone size={15} color={colors.primary} />
                <Text style={styles.link}>{venue.phone}</Text>
              </Pressable>
            )}
            <Text style={[type.label, styles.mt]}>Quadras</Text>
            {courts.map(c => (
              <Text key={c.id} style={type.caption}>
                {c.name} · {sportLabel(c.sport)}
                {c.pricePerHour ? ` · ${formatBRL(c.pricePerHour)}/h` : ''}
              </Text>
            ))}
            {amenities.length > 0 && (
              <>
                <Text style={[type.label, styles.mt]}>Comodidades</Text>
                <Text style={type.caption}>{amenities.join(' · ')}</Text>
              </>
            )}
          </Card>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
              {days.map(d => {
                const active = d.date === date;
                return (
                  <Pressable
                    key={d.date}
                    onPress={() => {
                      setDate(d.date);
                      setSelection(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.dayLabel} ${d.dayNum}`}
                    accessibilityState={{ selected: active }}
                    style={[styles.day, active && styles.dayActive]}
                  >
                    <Text style={[styles.dayLabel, active && styles.dayTextActive]}>{d.dayLabel}</Text>
                    <Text style={[styles.dayNum, active && styles.dayTextActive]}>{d.dayNum}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.filters}>
              {DURATIONS.map(d => (
                <Chip
                  key={d}
                  label={d === 90 ? '1h30' : '2h'}
                  selected={duration === d}
                  onPress={() => {
                    setDuration(d);
                    setSelection(null);
                  }}
                />
              ))}
              <Chip label="Só disponíveis" selected={onlyAvailable} onPress={() => setOnlyAvailable(v => !v)} />
            </View>

            {grid.isPending ? (
              <LoadingView />
            ) : grid.isError ? (
              <ErrorView onRetry={() => grid.refetch()} />
            ) : (
              courts.map(c => {
                const all = grid.data[c.id] ?? [];
                const list = onlyAvailable
                  ? all.filter(s => s.gameId || (duration === 90 ? s.available90 : s.available120))
                  : all;
                return (
                  <Card key={c.id}>
                    <View style={styles.rowBetween}>
                      <Text style={type.label}>{c.name}</Text>
                      <Text style={type.caption}>{sportLabel(c.sport)}</Text>
                    </View>
                    {list.length ? (
                      <View style={styles.slots}>
                        {list.map(s => (
                          <SlotChip
                            key={s.id}
                            slot={s}
                            duration={duration}
                            selected={selection?.slot.id === s.id}
                            onPress={() => pick(c.id, c.name, s)}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={type.caption}>Nenhum horário {onlyAvailable ? 'disponível ' : ''}neste dia.</Text>
                    )}
                  </Card>
                );
              })
            )}

            {selection && (
              <Card style={styles.summary}>
                <Text style={type.heading}>
                  {selection.slot.time} – {selEnd}
                </Text>
                <Text style={type.caption}>
                  {selection.courtName} · {duration === 90 ? '1h30' : '2h'}
                </Text>
                <Text style={styles.price}>{formatBRL(selPrice)}</Text>
                {/* Booking moves money — it ships in the payment phase. */}
                <Text style={type.caption}>Reservar ou criar partida pelo app chega em breve. Por enquanto, use o site.</Text>
                <Button title="Reservar no site" onPress={() => WebBrowser.openBrowserAsync(webUrl).catch(() => {})} />
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { width: '100%', height: 180, borderRadius: radius.xl },
  titleBlock: { gap: spacing.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  mt: { marginTop: spacing.sm },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary, paddingVertical: spacing.xs },
  tabs: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: radius.lg, padding: 4 },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
  days: { gap: spacing.sm },
  day: {
    width: 56,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayLabel: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textSecondary },
  dayNum: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  dayTextActive: { color: colors.onPrimary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    minWidth: 72,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  slotOff: { backgroundColor: colors.border, borderColor: colors.border },
  slotOffText: { color: colors.textMuted, textDecorationLine: 'line-through' },
  slotGame: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  slotGameText: { color: colors.primary },
  slotSub: { fontFamily: fonts.medium, fontSize: 10, color: colors.primary },
  slotSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotSelectedText: { color: colors.onPrimary },
  summary: { borderColor: colors.primary, borderWidth: 2 },
  price: { fontFamily: fonts.bold, fontSize: 20, color: colors.primary },
});
