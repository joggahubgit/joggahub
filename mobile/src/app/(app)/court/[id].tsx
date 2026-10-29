// Port of src/app/components/CourtDetails.tsx (web).
// Deviations: Share works (it has no handler on the web); the favourite (heart)
// button is omitted because favourites don't exist; "Ver revisão" / "Revisar
// partida" open the website until the payment phase ships booking in the app.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, GraduationCap, Lock, Mail, MapPin, Phone, Share2, Star } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { fetchCourtPage, fetchOpenGamesBySlot, fetchSlotGrid, type VenueCourt } from '@/features/courts/api';
import { nextDays, type Duration, type SlotItem } from '@/features/courts/schedule';
import { getEnv } from '@/lib/env';
import { getMaxPlayersForSport, getMinPlayersForSport } from '@/lib/shared';
import { useRealtimeRefetch } from '@/lib/useRealtimeRefetch';
import palette from '../../../../tailwind.palette';

type TabType = 'home' | 'book' | 'open-games' | 'classes';
const TAB_LABEL: Record<TabType, string> = { home: 'Home', book: 'Agendar', 'open-games': 'Jogos Abertos', classes: 'Aulas' };

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', society: 'Society', futsal: 'Futsal', futevolei: 'Futevôlei',
  tennis: 'Tênis', padel: 'Padel', basketball: 'Basquete', volleyball: 'Vôlei', beach_tennis: 'Beach Tennis',
};
const sportLabel = (s: string) => SPORT_LABELS[s] ?? s;

interface Selected {
  slotId: string;
  courtId: string;
  courtName: string;
  time: string;
  endTime: string;
  price: number;
}

function WeekStrip({ days, selected, onSelect }: { days: ReturnType<typeof nextDays>; selected: string; onSelect: (d: string) => void }) {
  return (
    <View className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 py-4">
        {days.map(day => {
          const on = day.date === selected;
          return (
            <Pressable
              key={day.date}
              onPress={() => onSelect(day.date)}
              accessibilityRole="button"
              accessibilityLabel={`${day.dayLabel} ${day.dayNum} ${day.monthLabel}`}
              accessibilityState={{ selected: on }}
              className="items-center gap-1"
            >
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{day.dayLabel}</Text>
              <View className={`w-11 h-11 rounded-full items-center justify-center ${on ? 'bg-gray-900' : 'bg-gray-100'}`}>
                <Text className={`font-bold text-base ${on ? 'text-white' : 'text-gray-800'}`}>{day.dayNum}</Text>
              </View>
              <Text className="text-xs text-gray-400">{day.monthLabel}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CourtBlock({ court, children }: { court: VenueCourt; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
        <View>
          <Text className="font-bold text-gray-900 text-base">{court.name}</Text>
          {!!court.sport && <Text className="text-xs text-gray-500">{sportLabel(court.sport)}</Text>}
        </View>
      </View>
      <View className="p-4">{children}</View>
    </View>
  );
}

function EmptyCard({ emoji, title, lines }: { emoji: string; title: string; lines: string[] }) {
  return (
    <View className="bg-white rounded-2xl shadow-sm p-10 items-center gap-2">
      <Text className="text-4xl">{emoji}</Text>
      <Text className="font-semibold text-gray-700 text-base">{title}</Text>
      {lines.map(l => (
        <Text key={l} className="text-sm text-gray-400 text-center">
          {l}
        </Text>
      ))}
    </View>
  );
}

/** 4-column grid like the web's grid-cols-4 gap-2. */
function SlotGrid({ children }: { children: React.ReactNode }) {
  return <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>{children}</View>;
}
function SlotCell({ children }: { children: React.ReactNode }) {
  return <View style={{ width: '25%', padding: 4 }}>{children}</View>;
}

export default function CourtDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const weekDays = useMemo(() => nextDays(14), []);
  const [activeTab, setActiveTab] = useState<TabType>('book');
  const [imageIndex, setImageIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState(weekDays[1].date);
  const [duration, setDuration] = useState<Duration>(90);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Selected | null>(null);
  const [selectedOpenSlot, setSelectedOpenSlot] = useState<Selected | null>(null);
  const [payMode, setPayMode] = useState<'full' | 'split'>('full');

  const page = useQuery({ queryKey: ['court', id], queryFn: () => fetchCourtPage(id), enabled: !!id });
  const venueCourts = page.data?.courts ?? [];
  const courtIds = venueCourts.map(c => c.id).join(',');
  const grid = useQuery({
    queryKey: ['slots', courtIds, selectedDate],
    queryFn: () => fetchSlotGrid(venueCourts, selectedDate),
    enabled: venueCourts.length > 0,
    staleTime: 0,
  });
  const openBySlot = useQuery({
    queryKey: ['openBySlot', courtIds, selectedDate],
    queryFn: () => fetchOpenGamesBySlot(venueCourts.map(c => c.id), selectedDate),
    enabled: venueCourts.length > 0,
    staleTime: 0,
  });

  // Realtime: the club changing availability or cancelling a booking refreshes the grid.
  useRealtimeRefetch(venueCourts.length ? `court-details-${id}` : null, ['slots', 'bookings'], () => {
    setSelectedSlot(null);
    grid.refetch();
    openBySlot.refetch();
  });

  const selectDate = (d: string) => {
    setSelectedDate(d);
    setSelectedSlot(null);
    setSelectedOpenSlot(null);
  };

  if (page.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator color={palette.violet['600']} />
      </View>
    );
  }
  if (!page.data) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-gray-600 text-base mb-4">{page.isError ? 'Não foi possível carregar a quadra.' : 'Quadra não encontrada.'}</Text>
        <Pressable onPress={() => (page.isError ? page.refetch() : router.back())}>
          <Text className="text-violet-600 font-semibold">{page.isError ? 'Tentar de novo' : 'Voltar'}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const court = page.data;
  const venue = court.venue;
  const images = court.images;
  const slotsByCourt = grid.data ?? {};
  const webUrl = `${getEnv().webUrl}/court-details/${id}`;
  const sportFor = (courtId: string) => venueCourts.find(c => c.id === courtId)?.sport ?? '';

  const totalAvailable = Object.values(slotsByCourt).flat().filter(s => s.available90 && !s.gameId).length;
  const noSlots = Object.values(slotsByCourt).every(s => s.length === 0);
  const privateMin = selectedSlot ? getMinPlayersForSport(sportFor(selectedSlot.courtId)) : 0;
  const privateMax = selectedSlot ? getMaxPlayersForSport(sportFor(selectedSlot.courtId)) : 0;
  const openMin = selectedOpenSlot ? getMinPlayersForSport(sportFor(selectedOpenSlot.courtId)) : 0;
  const openMax = selectedOpenSlot ? getMaxPlayersForSport(sportFor(selectedOpenSlot.courtId)) : 0;

  const pickSlot = (slot: SlotItem, c: VenueCourt) => {
    if (slot.gameId) return router.push({ pathname: '/game/[id]', params: { id: slot.gameId } });
    const available = duration === 90 ? slot.available90 : slot.available120;
    if (!available) return;
    setSelectedSlot({
      slotId: slot.id,
      courtId: c.id,
      courtName: c.name,
      time: slot.time,
      endTime: duration === 90 ? slot.endTime90 : slot.endTime120,
      price: slot.pricePerHour * (duration / 60),
    });
  };

  const share = () =>
    Share.share({ message: `${venue?.name ? `${venue.name} · ` : ''}${court.name} no JoggaHub\n${webUrl}` }).catch(() => {});
  const refreshing = page.isRefetching || grid.isRefetching;

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="pb-6"
        stickyHeaderIndices={[2]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              page.refetch();
              grid.refetch();
              openBySlot.refetch();
            }}
            tintColor={palette.violet['600']}
          />
        }
      >
        {/* Image gallery */}
        <View className="bg-black">
          <Image source={{ uri: images[imageIndex] }} style={{ width: '100%', height: 288 }} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={court.name} />
          <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
            <View className="flex-row justify-between px-4 pt-4">
              <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Voltar" className="bg-white p-2 rounded-full shadow-lg">
                <ArrowLeft size={20} color={palette.gray['900']} />
              </Pressable>
              <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Compartilhar" className="bg-white p-2 rounded-full shadow-lg">
                <Share2 size={20} color={palette.gray['900']} />
              </Pressable>
            </View>
          </SafeAreaView>
          {images.length > 1 && (
            <>
              <Pressable
                onPress={() => setImageIndex(p => (p - 1 + images.length) % images.length)}
                accessibilityLabel="Foto anterior"
                className="absolute left-4 bg-white/90 p-2 rounded-full shadow-lg"
                style={{ top: 120 }}
              >
                <ChevronLeft size={24} color={palette.gray['900']} />
              </Pressable>
              <Pressable
                onPress={() => setImageIndex(p => (p + 1) % images.length)}
                accessibilityLabel="Próxima foto"
                className="absolute right-4 bg-white/90 p-2 rounded-full shadow-lg"
                style={{ top: 120 }}
              >
                <ChevronRight size={24} color={palette.gray['900']} />
              </Pressable>
            </>
          )}
          <View className="absolute bottom-4 left-0 right-0 flex-row justify-center gap-2">
            {images.map((_, idx) => (
              <Pressable key={idx} onPress={() => setImageIndex(idx)} accessibilityLabel={`Foto ${idx + 1}`}>
                <View className={`h-2 rounded-full ${idx === imageIndex ? 'bg-white w-6' : 'bg-white/60 w-2'}`} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Venue / court header */}
        <View className="bg-white px-6 py-4 border-b border-gray-200">
          {!!venue?.name && <Text className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-0.5">{venue.name}</Text>}
          <Text className="text-2xl font-bold text-gray-900 mb-1">{court.name}</Text>
          <View className="flex-row items-center gap-4">
            {court.rating > 0 && (
              <View className="flex-row items-center gap-1">
                <Star size={16} color={palette.yellow['400']} fill={palette.yellow['400']} />
                <Text className="font-semibold text-sm">{court.rating}</Text>
                <Text className="text-gray-400 text-xs">({court.reviews})</Text>
              </View>
            )}
            {!!venue?.address && (
              <View className="flex-row items-center gap-1">
                <MapPin size={16} color={palette.gray['500']} />
                <Text className="text-sm text-gray-500">{venue.city || venue.address}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Tabs (sticky) */}
        <View className="bg-white border-b border-gray-200 shadow-sm">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(Object.keys(TAB_LABEL) as TabType[]).map(tab => {
              const on = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  className={`px-6 py-4 border-b-2 ${on ? 'border-violet-600' : 'border-transparent'}`}
                >
                  <Text className={`font-semibold text-base ${on ? 'text-violet-600' : 'text-gray-600'}`}>{TAB_LABEL[tab]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View className="px-4 py-4">
          {/* HOME TAB */}
          {activeTab === 'home' && (
            <View className="gap-4">
              <View className="bg-white rounded-2xl p-6 shadow-sm">
                <Text className="font-bold text-gray-900 mb-3 text-lg">Sobre</Text>
                {venue?.description ? (
                  <Text className="text-gray-600 text-sm mb-4">{venue.description}</Text>
                ) : (
                  <Text className="text-gray-400 text-sm mb-4 italic">Sem descrição cadastrada.</Text>
                )}
                <View className="gap-3">
                  {!!venue?.address && (
                    <View className="flex-row items-center gap-3">
                      <MapPin size={20} color={palette.violet['600']} />
                      <Text className="text-sm text-gray-700 flex-1">
                        {venue.address}
                        {venue.city ? `, ${venue.city}` : ''}
                      </Text>
                    </View>
                  )}
                  {!!venue?.phone && (
                    <View className="flex-row items-center gap-3">
                      <Phone size={20} color={palette.violet['600']} />
                      <Text className="text-sm text-gray-700">{venue.phone}</Text>
                    </View>
                  )}
                  {!!venue?.email && (
                    <View className="flex-row items-center gap-3">
                      <Mail size={20} color={palette.violet['600']} />
                      <Text className="text-sm text-gray-700">{venue.email}</Text>
                    </View>
                  )}
                  {!!venue?.openingHours && (
                    <View className="flex-row items-center gap-3">
                      <Clock size={20} color={palette.violet['600']} />
                      <Text className="text-sm text-gray-700">{venue.openingHours}</Text>
                    </View>
                  )}
                </View>
              </View>
              {court.amenities.length > 0 && (
                <View className="bg-white rounded-2xl p-6 shadow-sm">
                  <Text className="font-bold text-gray-900 mb-4 text-lg">Comodidades</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {court.amenities.map(a => (
                      <View key={a} className="px-4 py-2 bg-violet-50 rounded-full">
                        <Text className="text-violet-700 text-sm font-medium">{a}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* BOOK TAB */}
          {activeTab === 'book' && (
            <View className="gap-4">
              <WeekStrip days={weekDays} selected={selectedDate} onSelect={selectDate} />

              <View className="flex-row items-center justify-between px-1 gap-3">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm text-gray-600 font-medium">Duração:</Text>
                  <View className="flex-row bg-gray-100 rounded-lg p-0.5">
                    {([90, 120] as const).map(d => (
                      <Pressable
                        key={d}
                        onPress={() => {
                          setDuration(d);
                          setSelectedSlot(null);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: duration === d }}
                        className={`px-3 py-1.5 rounded-md ${duration === d ? 'bg-white shadow-sm' : ''}`}
                      >
                        <Text className={`text-xs font-bold ${duration === d ? 'text-gray-900' : 'text-gray-500'}`}>{d === 90 ? '1h30' : '2h'}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-gray-500">Só livres</Text>
                  <Pressable
                    onPress={() => setAvailableOnly(v => !v)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: availableOnly }}
                    accessibilityLabel="Só livres"
                    className={`w-10 h-5 rounded-full justify-center ${availableOnly ? 'bg-gray-900' : 'bg-gray-300'}`}
                  >
                    <View className="w-4 h-4 bg-white rounded-full shadow" style={{ marginLeft: availableOnly ? 22 : 2 }} />
                  </Pressable>
                </View>
              </View>

              {grid.isPending ? (
                <View className="items-center py-12">
                  <ActivityIndicator color={palette.gray['400']} />
                </View>
              ) : venueCourts.length === 0 ? (
                <View className="bg-white rounded-2xl shadow-sm p-10 items-center">
                  <Text className="text-sm text-gray-400">Nenhuma quadra cadastrada neste clube.</Text>
                </View>
              ) : noSlots ? (
                <EmptyCard emoji="📅" title="Nenhum horário disponível" lines={['Não há horários cadastrados para este dia.', 'Tente selecionar outra data.']} />
              ) : totalAvailable === 0 && availableOnly ? (
                <EmptyCard emoji="📅" title="Nenhum horário livre" lines={['Todos os horários estão ocupados neste dia.', 'Tente outra data.']} />
              ) : (
                venueCourts.map(c => {
                  const slots = (slotsByCourt[c.id] ?? []).filter(s => (availableOnly ? (duration === 90 ? s.available90 : s.available120) : true));
                  if (!slots.length) return null;
                  return (
                    <CourtBlock key={c.id} court={c}>
                      <SlotGrid>
                        {slots.map(slot => {
                          const isSelected = selectedSlot?.time === slot.time && selectedSlot?.courtId === c.id;
                          const isAvailable = duration === 90 ? slot.available90 : slot.available120;
                          const hasGame = !!slot.gameId;
                          const box = isSelected
                            ? 'bg-gray-900 border-gray-900'
                            : hasGame
                              ? 'bg-violet-50 border-violet-200'
                              : isAvailable
                                ? 'bg-white border-gray-200'
                                : 'border-transparent';
                          const txt = isSelected ? 'text-white' : hasGame ? 'text-violet-700' : isAvailable ? 'text-gray-900' : 'text-gray-300 line-through';
                          return (
                            <SlotCell key={slot.id}>
                              <Pressable
                                onPress={() => pickSlot(slot, c)}
                                disabled={!isAvailable && !hasGame}
                                accessibilityRole="button"
                                accessibilityLabel={`${slot.time}${hasGame ? ', jogo aberto' : isAvailable ? ', disponível' : ', ocupado'}`}
                                accessibilityState={{ disabled: !isAvailable && !hasGame, selected: isSelected }}
                                className={`py-2 px-1 rounded-xl border items-center gap-0.5 ${box}`}
                              >
                                <Text className={`text-xs font-semibold ${txt}`}>{slot.time}</Text>
                                {hasGame && <Text className="text-[9px] font-bold text-violet-500">Jogo</Text>}
                              </Pressable>
                            </SlotCell>
                          );
                        })}
                      </SlotGrid>
                    </CourtBlock>
                  );
                })
              )}

              {selectedSlot && (
                <View className="bg-white rounded-2xl shadow-sm p-5 border-2 border-violet-500 gap-4">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5 mb-0.5">
                        <Lock size={14} color={palette.violet['600']} />
                        <Text className="text-xs font-bold text-violet-600 uppercase tracking-wide">Nova Partida Privada</Text>
                      </View>
                      <Text className="text-xl font-bold text-gray-900">
                        {selectedSlot.time} – {selectedSlot.endTime}
                        <Text className="text-sm text-gray-400"> {duration === 90 ? '1h30' : '2h'}</Text>
                      </Text>
                      <Text className="text-sm text-gray-500">{selectedSlot.courtName}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-2xl font-bold text-gray-900">R$ {selectedSlot.price.toFixed(0)}</Text>
                      <Text className="text-xs text-gray-400">quadra · {duration === 90 ? '1h30' : '2h'}</Text>
                    </View>
                  </View>

                  <View>
                    <Text className="text-sm font-semibold text-gray-700 mb-2">Como deseja pagar?</Text>
                    <View className="gap-2">
                      {(['full', 'split'] as const).map(mode => {
                        const on = payMode === mode;
                        return (
                          <Pressable
                            key={mode}
                            onPress={() => setPayMode(mode)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: on }}
                            className={`w-full flex-row items-center gap-3 p-3 rounded-xl border-2 ${on ? 'border-violet-500 bg-violet-50' : 'border-gray-200'}`}
                          >
                            <View className={`w-4 h-4 rounded-full border-2 ${on ? 'border-violet-600 bg-violet-600' : 'border-gray-300'}`} />
                            <View className="flex-1">
                              <Text className="font-semibold text-sm text-gray-900">{mode === 'full' ? 'Pagar tudo' : 'Dividir com o grupo'}</Text>
                              <Text className="text-xs text-gray-500">{mode === 'full' ? 'Você cobre o valor completo da quadra' : 'Cada jogador paga sua parte'}</Text>
                            </View>
                            {mode === 'full' ? (
                              <Text className="text-sm font-bold text-gray-900">R$ {selectedSlot.price.toFixed(0)}</Text>
                            ) : (
                              <Text className="text-sm font-bold text-gray-900">
                                R$ {(selectedSlot.price / privateMin).toFixed(2)}
                                <Text className="text-xs text-gray-500">/pessoa</Text>
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                      {payMode === 'split' && (
                        <View className="bg-blue-50 rounded-xl p-3.5 border border-blue-100 gap-2">
                          <Text className="text-sm text-blue-900 leading-relaxed">
                            {privateMin === privateMax ? 'A quadra fecha com ' : 'A quadra abre para até '}
                            <Text className="text-sm font-bold text-blue-900">{privateMax} jogadores</Text>. Cada um autoriza{' '}
                            <Text className="text-sm font-bold text-blue-900">R$ {((selectedSlot.price / privateMin) * 1.08 + 2.5).toFixed(2)}</Text> no cartão — quanto mais jogadores entrarem, menos cada um paga.
                          </Text>
                          <Text className="text-sm text-blue-900 leading-relaxed">2 horas antes do jogo o valor é ajustado e cobrado automaticamente.</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View className="flex-row gap-3 pt-1">
                    <Pressable onPress={() => setSelectedSlot(null)} className="px-4 py-3 border-2 border-gray-200 rounded-xl">
                      <Text className="text-gray-600 font-semibold text-sm">Cancelar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/private-game-review',
                          params: {
                            slotId: selectedSlot.slotId,
                            courtId: selectedSlot.courtId,
                            courtName: selectedSlot.courtName,
                            venueName: venue?.name ?? '',
                            courtSport: sportFor(selectedSlot.courtId),
                            date: selectedDate,
                            time: selectedSlot.time,
                            endTime: selectedSlot.endTime,
                            price: String(selectedSlot.price),
                            maxPlayers: String(privateMax),
                            payMode,
                          },
                        })
                      }
                      className="flex-1 bg-violet-600 py-3 rounded-xl items-center active:bg-violet-700"
                    >
                      <Text className="text-white font-bold text-base">Ver revisão →</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* OPEN GAMES TAB */}
          {activeTab === 'open-games' && (
            <View className="gap-4">
              <WeekStrip days={weekDays} selected={selectedDate} onSelect={selectDate} />

              {grid.isPending ? (
                <View className="items-center py-12">
                  <ActivityIndicator color={palette.gray['400']} />
                </View>
              ) : venueCourts.length === 0 ? (
                <View className="bg-white rounded-2xl shadow-sm p-10 items-center">
                  <Text className="text-sm text-gray-400">Nenhuma quadra cadastrada neste clube.</Text>
                </View>
              ) : noSlots ? (
                <EmptyCard emoji="😔" title="Nenhum horário disponível" lines={['Não há slots cadastrados para este dia.', 'Tente outra data.']} />
              ) : (
                venueCourts.map(c => {
                  const slots = slotsByCourt[c.id] ?? [];
                  if (!slots.length) return null;
                  return (
                    <CourtBlock key={c.id} court={c}>
                      <SlotGrid>
                        {slots.map(slot => {
                          const game = openBySlot.data?.[slot.id];
                          const isSelected = selectedOpenSlot?.slotId === slot.id;
                          const spotsLeft = game ? game.maxPlayers - game.currentPlayers : null;
                          const isFull = !!game && spotsLeft === 0;
                          const available = slot.available90;
                          const box = isSelected
                            ? 'bg-gray-900 border-gray-900'
                            : game && !isFull
                              ? 'bg-violet-50 border-violet-200'
                              : isFull
                                ? 'bg-gray-100 border-transparent'
                                : available
                                  ? 'bg-white border-gray-200'
                                  : 'border-transparent';
                          const txt = isSelected
                            ? 'text-white'
                            : game && !isFull
                              ? 'text-violet-700'
                              : isFull
                                ? 'text-gray-300'
                                : available
                                  ? 'text-gray-900'
                                  : 'text-gray-300 line-through';
                          return (
                            <SlotCell key={slot.id}>
                              <Pressable
                                onPress={() => {
                                  if (game && !isFull) router.push({ pathname: '/game/[id]', params: { id: game.id } });
                                  else if (!game && available)
                                    setSelectedOpenSlot(
                                      isSelected
                                        ? null
                                        : { slotId: slot.id, courtId: c.id, courtName: c.name, time: slot.time, endTime: slot.endTime90, price: slot.pricePerHour * 1.5 },
                                    );
                                }}
                                disabled={(!available && !game) || isFull}
                                accessibilityRole="button"
                                accessibilityLabel={`${slot.time}${game && !isFull ? `, partida aberta, ${spotsLeft} vagas` : isFull ? ', cheio' : available ? ', disponível' : ', ocupado'}`}
                                className={`py-3 px-1 rounded-xl border items-center gap-0.5 ${box}`}
                              >
                                <Text className={`text-xs font-semibold ${txt}`}>{slot.time}</Text>
                                {game && !isFull && (
                                  <Text className={`text-[10px] font-bold ${txt}`}>
                                    {spotsLeft} vaga{spotsLeft !== 1 ? 's' : ''}
                                  </Text>
                                )}
                                {isFull && <Text className="text-[10px] text-gray-300">Cheio</Text>}
                              </Pressable>
                            </SlotCell>
                          );
                        })}
                      </SlotGrid>
                    </CourtBlock>
                  );
                })
              )}

              {!grid.isPending && venueCourts.length > 0 && (
                <View className="flex-row items-center gap-4 px-1">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-3 h-3 rounded border border-gray-200 bg-white" />
                    <Text className="text-xs text-gray-400">Disponível</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-3 h-3 rounded border border-violet-200 bg-violet-50" />
                    <Text className="text-xs text-gray-400">Partida aberta</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-3 h-3 rounded" />
                    <Text className="text-xs text-gray-400 line-through">Ocupado</Text>
                  </View>
                </View>
              )}

              {selectedOpenSlot && (
                <View className="bg-white rounded-2xl shadow-sm border-2 border-gray-900 overflow-hidden">
                  <View className="bg-gray-900 px-5 py-4">
                    <Text className="text-xs font-semibold uppercase tracking-widest text-white opacity-60 mb-1">Nova partida aberta</Text>
                    <View className="flex-row items-end justify-between">
                      <View>
                        <Text className="text-2xl font-bold text-white">{selectedOpenSlot.time}</Text>
                        <Text className="text-sm text-white opacity-70 mt-0.5">
                          {selectedOpenSlot.courtName} ·{' '}
                          {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-2xl font-bold text-white">R$ {(selectedOpenSlot.price / openMin).toFixed(2)}</Text>
                        <Text className="text-xs text-white opacity-60">por jogador</Text>
                      </View>
                    </View>
                  </View>
                  <View className="p-5 gap-5">
                    <View className="gap-2">
                      <View className="flex-row justify-between">
                        <Text className="text-sm text-gray-600">Valor total da quadra</Text>
                        <Text className="text-sm font-semibold text-gray-900">R$ {selectedOpenSlot.price}</Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="text-sm text-gray-600">Dividido por {openMin} jogadores (mínimo)</Text>
                        <Text className="text-sm font-semibold text-gray-900">= R$ {(selectedOpenSlot.price / openMin).toFixed(2)}/pessoa</Text>
                      </View>
                      <View className="border-t border-gray-100 pt-2 flex-row justify-between">
                        <Text className="text-sm font-bold text-gray-900">Você paga agora</Text>
                        <Text className="text-sm font-bold text-violet-600">R$ {(selectedOpenSlot.price / openMin).toFixed(2)}</Text>
                      </View>
                    </View>
                    <View>
                      <Text className="text-xs text-gray-500 mb-2">{openMax - 1} vagas abertas para outros jogadores</Text>
                      <View className="flex-row gap-2">
                        {Array.from({ length: openMax }).map((_, i) => (
                          <View key={i} className={`flex-1 h-1.5 rounded-full ${i === 0 ? 'bg-gray-900' : 'bg-gray-200'}`} />
                        ))}
                      </View>
                    </View>
                    <View className="flex-row gap-3">
                      <Pressable onPress={() => setSelectedOpenSlot(null)} className="px-4 py-3 border-2 border-gray-200 rounded-xl">
                        <Text className="text-gray-600 font-semibold text-sm">Cancelar</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/open-game-review',
                            params: {
                              slotId: selectedOpenSlot.slotId,
                              courtId: selectedOpenSlot.courtId,
                              courtName: selectedOpenSlot.courtName,
                              courtSport: sportFor(selectedOpenSlot.courtId),
                              venueName: venue?.name ?? '',
                              date: selectedDate,
                              time: selectedOpenSlot.time,
                              endTime: selectedOpenSlot.endTime,
                              totalPrice: String(selectedOpenSlot.price),
                              maxPlayers: String(openMax),
                              minPlayers: String(openMin),
                            },
                          })
                        }
                        className="flex-1 bg-gray-900 py-3 rounded-xl items-center justify-center active:bg-gray-800"
                      >
                        <Text className="text-white font-bold text-sm">Revisar partida</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* CLASSES TAB */}
          {activeTab === 'classes' && (
            <View className="items-center py-10">
              <GraduationCap size={40} color={palette.gray['300']} />
              <Text className="text-sm text-gray-500 mt-3">Nenhuma aula disponível nesta quadra.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
