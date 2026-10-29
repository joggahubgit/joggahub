// Port of src/app/components/FindCourts.tsx (web).
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, MapPin, Search, SlidersHorizontal, Star, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { VioletHeader } from '@/components/ui/PageHeader';
import { fetchCourts, type CourtListItem } from '@/features/courts/api';
import palette from '../../../tailwind.palette';

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', futsal: 'Futsal', society: 'Society', tennis: 'Tênis', padel: 'Padel',
  basketball: 'Basquete', volleyball: 'Vôlei', beach_tennis: 'Beach Tennis', futevolei: 'Futevôlei',
};
const sportLabel = (s: string | null) => (!s ? '—' : (SPORT_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1)));
const FALLBACK = 'https://images.unsplash.com/photo-1624880357913-a8539238245b?w=400&q=80';

function CourtCard({ court }: { court: CourtListItem }) {
  const price = court.minSlotPrice ?? court.pricePerHour;
  const place = [court.venueAddress, court.venueCity].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/court/[id]', params: { id: court.id } })}
      className="bg-white rounded-xl overflow-hidden border border-gray-200"
    >
      <View>
        <Image source={{ uri: court.image || FALLBACK }} style={{ width: '100%', height: 176 }} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={court.name} />
        <View className={`absolute top-3 right-3 px-2.5 py-1 rounded-full ${court.isActive ? 'bg-green-500' : 'bg-red-500'}`}>
          <Text className="text-xs font-bold text-white">{court.isActive ? 'Disponível' : 'Indisponível'}</Text>
        </View>
        {!!court.sport && (
          <View className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/50">
            <Text className="text-xs font-bold text-white">{sportLabel(court.sport)}</Text>
          </View>
        )}
      </View>
      <View className="p-4">
        <Text className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-0.5">{court.venueName || '—'}</Text>
        <Text className="font-bold text-gray-900 text-base">{court.name}</Text>
        {!!place && (
          <View className="flex-row items-center gap-1 mt-1">
            <MapPin size={14} color={palette.gray['500']} />
            <Text className="text-sm text-gray-500 flex-1" numberOfLines={1}>
              {place}
            </Text>
          </View>
        )}
        <View className="flex-row items-center justify-between mt-3">
          <View className="flex-row items-center gap-1">
            <Star size={16} color={palette.yellow['400']} fill={palette.yellow['400']} />
            <Text className="font-semibold text-gray-900 text-sm">{court.rating ?? '—'}</Text>
            {court.reviewCount ? <Text className="text-xs text-gray-400">({court.reviewCount})</Text> : null}
          </View>
          {price ? (
            <Text className="text-base font-bold text-violet-600">
              a partir de R$ {price}
              <Text className="text-xs text-gray-400">/h</Text>
            </Text>
          ) : (
            <Text className="text-sm text-gray-400">Preço não definido</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function ClearFilters({ small, onPress }: { small?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text className={`${small ? 'text-xs' : 'text-sm'} text-red-500 font-semibold`}>Limpar filtros</Text>
    </Pressable>
  );
}

export default function FindCourts() {
  const q = useQuery({ queryKey: ['courts'], queryFn: fetchCourts });
  const [search, setSearch] = useState('');
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const sportTypes = useMemo(() => [...new Set(all.map(c => c.sport).filter(Boolean))].sort(), [all]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const min = priceMin ? parseFloat(priceMin.replace(',', '.')) : null;
    const max = priceMax ? parseFloat(priceMax.replace(',', '.')) : null;
    return all.filter(c => {
      if (term && ![c.name, c.venueName, c.venueCity, c.venueAddress].filter(Boolean).join(' ').toLowerCase().includes(term)) return false;
      if (selectedSport && c.sport !== selectedSport) return false;
      if (min !== null && (c.pricePerHour ?? 0) < min) return false;
      if (max !== null && (c.pricePerHour ?? Infinity) > max) return false;
      if (onlyAvailable && !c.isActive) return false;
      return true;
    });
  }, [all, search, selectedSport, priceMin, priceMax, onlyAvailable]);

  const hasActiveFilters = !!(selectedSport || priceMin || priceMax || onlyAvailable);
  const activeCount = [selectedSport, priceMin || priceMax, onlyAvailable].filter(Boolean).length;
  const clearFilters = () => {
    setSelectedSport(null);
    setPriceMin('');
    setPriceMax('');
    setOnlyAvailable(false);
  };


  return (
    <View className="flex-1 bg-gray-50">
      <VioletHeader title="Encontrar Quadras" fallback="/">
        <View className="bg-white rounded-xl px-3 py-2.5 flex-row items-center gap-2">
          <Search size={16} color={palette.gray['400']} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome, clube ou cidade..."
            placeholderTextColor={palette.gray['400']}
            className="flex-1 text-gray-700 text-sm p-0"
            style={{ fontFamily: 'Inter_400Regular' }}
            accessibilityLabel="Buscar quadras"
            returnKeyType="search"
          />
          {!!search && (
            <Pressable onPress={() => setSearch('')} accessibilityLabel="Limpar busca" hitSlop={8}>
              <X size={16} color={palette.gray['400']} />
            </Pressable>
          )}
        </View>
      </VioletHeader>

      {/* Sport pills + filter button */}
      <View className="bg-white border-b border-gray-200 px-4 py-2.5">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2">
          <Pressable
            onPress={() => setShowFilters(f => !f)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showFilters }}
            className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${showFilters || hasActiveFilters ? 'bg-violet-600' : 'bg-gray-100'}`}
          >
            <SlidersHorizontal size={14} color={showFilters || hasActiveFilters ? '#ffffff' : palette.gray['700']} />
            <Text className={`text-sm font-semibold ${showFilters || hasActiveFilters ? 'text-white' : 'text-gray-700'}`}>Filtros</Text>
            {hasActiveFilters && (
              <View className="bg-white rounded-full w-4 h-4 items-center justify-center">
                <Text className="text-violet-600 text-xs font-bold">{activeCount}</Text>
              </View>
            )}
            {showFilters ? (
              <ChevronUp size={14} color={showFilters || hasActiveFilters ? '#ffffff' : palette.gray['700']} />
            ) : (
              <ChevronDown size={14} color={hasActiveFilters ? '#ffffff' : palette.gray['700']} />
            )}
          </Pressable>
          {sportTypes.map(sport => {
            const on = selectedSport === sport;
            return (
              <Pressable
                key={sport}
                onPress={() => setSelectedSport(on ? null : sport)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className={`px-3 py-1.5 rounded-full ${on ? 'bg-violet-600' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-gray-700'}`}>{sportLabel(sport)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {showFilters && (
        <View className="bg-white border-b border-gray-200 px-6 py-4 gap-4">
          <View>
            <Text className="text-sm font-semibold text-gray-700 mb-2">Preço por hora (R$)</Text>
            <View className="flex-row items-center gap-2">
              {[
                { v: priceMin, set: setPriceMin, ph: 'Mín' },
                { v: priceMax, set: setPriceMax, ph: 'Máx' },
              ].map((f, i) => (
                <View key={f.ph} className="flex-1 flex-row items-center gap-2">
                  {i === 1 && <Text className="text-gray-400 text-sm">–</Text>}
                  <TextInput
                    value={f.v}
                    onChangeText={f.set}
                    placeholder={f.ph}
                    placeholderTextColor={palette.gray['400']}
                    keyboardType="decimal-pad"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    style={{ fontFamily: 'Inter_400Regular' }}
                    accessibilityLabel={`Preço ${f.ph.toLowerCase()}`}
                  />
                </View>
              ))}
            </View>
          </View>
          <Pressable
            onPress={() => setOnlyAvailable(v => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: onlyAvailable }}
            className="flex-row items-center gap-3"
          >
            <View className={`w-4 h-4 rounded items-center justify-center border ${onlyAvailable ? 'bg-violet-600 border-violet-600' : 'border-gray-400'}`}>
              {onlyAvailable && <Check size={12} color="#ffffff" />}
            </View>
            <Text className="text-sm font-medium text-gray-700">Mostrar apenas disponíveis</Text>
          </Pressable>
          {hasActiveFilters && <ClearFilters onPress={clearFilters} />}
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={c => c.id}
        contentContainerClassName="px-6 py-4 gap-4"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={palette.violet['600']} />}
        ListHeaderComponent={
          <View className="gap-4">
            <View className="flex-row items-center justify-between">
              {q.isPending ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={palette.gray['500']} />
                  <Text className="text-sm font-semibold text-gray-500">Carregando...</Text>
                </View>
              ) : (
                <Text className="text-sm font-semibold text-gray-500">
                  {filtered.length} {filtered.length === 1 ? 'quadra encontrada' : 'quadras encontradas'}
                </Text>
              )}
              {hasActiveFilters && !q.isPending && <ClearFilters small onPress={clearFilters} />}
            </View>
            {q.isError && (
              <View className="bg-red-50 border border-red-200 rounded-xl p-4">
                <Text className="text-red-700 text-sm">{(q.error as Error)?.message ?? 'Erro ao carregar'}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          q.isPending || q.isError ? undefined : (
            <View className="items-center py-16">
              <View style={{ opacity: 0.3 }} className="mb-3">
                <Search size={40} color={palette.gray['400']} />
              </View>
              <Text className="font-semibold text-gray-600 text-base">Nenhuma quadra encontrada</Text>
              <Text className="text-sm mt-1 text-gray-400">Tente ajustar os filtros ou a busca</Text>
              {hasActiveFilters && (
                <Pressable onPress={clearFilters} className="mt-4" hitSlop={8}>
                  <Text className="text-violet-600 font-semibold text-sm">Limpar filtros</Text>
                </Pressable>
              )}
            </View>
          )
        }
        renderItem={({ item }) => <CourtCard court={item} />}
      />
    </View>
  );
}
