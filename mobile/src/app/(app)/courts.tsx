import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Search } from 'lucide-react-native';
import { fetchCourts, type CourtListItem } from '@/features/courts/api';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyView, ErrorView, LoadingView } from '@/components/StateViews';
import { formatBRL, sportLabel } from '@/lib/format';
import { colors, fonts, MIN_TOUCH, radius, spacing, type } from '@/theme/tokens';

function CourtRow({ c }: { c: CourtListItem }) {
  const price = c.minSlotPrice ?? c.pricePerHour;
  return (
    <Card
      onPress={() => router.push({ pathname: '/court/[id]', params: { id: c.id } })}
      style={styles.row}
      accessibilityLabel={`${c.name}, ${c.venueName}, ${sportLabel(c.sport)}, a partir de ${formatBRL(price)} por hora`}
    >
      {c.image ? (
        <Image source={{ uri: c.image }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={styles.thumbEmoji}>🏟️</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={type.label} numberOfLines={1}>
          {c.venueName}
        </Text>
        <Text style={type.caption} numberOfLines={1}>
          {c.name} · {sportLabel(c.sport)}
        </Text>
        {!!(c.venueCity || c.venueAddress) && (
          <View style={styles.line}>
            <MapPin size={13} color={colors.textMuted} />
            <Text style={[type.caption, styles.flex]} numberOfLines={1}>
              {c.venueCity || c.venueAddress}
            </Text>
          </View>
        )}
        {price > 0 && (
          <Text style={styles.price}>
            {c.minSlotPrice != null ? 'a partir de ' : ''}
            {formatBRL(price)}/h
          </Text>
        )}
      </View>
    </Card>
  );
}

export default function CourtsScreen() {
  const q = useQuery({ queryKey: ['courts'], queryFn: fetchCourts });
  const [search, setSearch] = useState('');
  const [sport, setSport] = useState<string | null>(null);

  const sports = useMemo(() => {
    const labels = new Map<string, string>();
    for (const c of q.data ?? []) if (c.sport) labels.set(sportLabel(c.sport), c.sport);
    return [...labels.entries()].sort();
  }, [q.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? []).filter(c => {
      if (sport && sportLabel(c.sport) !== sport) return false;
      if (!term) return true;
      return [c.name, c.venueName, c.venueCity, c.venueAddress].join(' ').toLowerCase().includes(term);
    });
  }, [q.data, search, sport]);

  if (q.isPending) return <LoadingView />;
  if (q.isError) return <ErrorView onRetry={() => q.refetch()} />;

  return (
    <FlatList
      data={filtered}
      keyExtractor={c => c.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.search}>
            <Search size={18} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Clube, quadra ou cidade"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              accessibilityLabel="Buscar quadras"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          {sports.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="Todos" selected={!sport} onPress={() => setSport(null)} />
              {sports.map(([label]) => (
                <Chip key={label} label={label} selected={sport === label} onPress={() => setSport(label)} />
              ))}
            </ScrollView>
          )}
        </View>
      }
      ListEmptyComponent={
        <EmptyView
          emoji="🏟️"
          title={q.data.length ? 'Nenhuma quadra encontrada' : 'Nenhuma quadra disponível'}
          message={q.data.length ? 'Tente outro termo ou esporte.' : undefined}
        />
      }
      renderItem={({ item }) => <CourtRow c={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.text, paddingVertical: spacing.sm },
  chips: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 76, height: 76, borderRadius: radius.lg },
  thumbFallback: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 28 },
  info: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flex: { flex: 1 },
  price: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary, marginTop: 2 },
});
