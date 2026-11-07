// Port of src/app/components/Community.tsx (web).
// Deviations: the Messages tab shows only the "Em breve" banner (the web lists
// three made-up conversations and a fake unread badge); the header search icon
// is omitted (no action on the web).
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, MapPin, Trophy } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ComingSoonBanner } from '@/components/ui/ComingSoonBanner';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchClubRankings, fetchFeed, fetchMyFutevoleiVenues, fetchRankings, type FeedPerson, type RankingRow } from '@/features/community/api';
import { PROVISIONAL_MATCHES_THRESHOLD } from '@/lib/shared';
import palette from '../../../../tailwind.palette';

type Tab = 'feed' | 'ranking' | 'messages';
type Scope = 'geral' | 'cidade' | 'clube';

function AvatarCircle({ name, url, size = 40, text = 'text-sm', border = true }: { name: string; url: string | null; size?: number; text?: string; border?: boolean }) {
  const box = { width: size, height: size, borderRadius: size / 2, ...(border ? { borderWidth: 2, borderColor: '#ffffff' } : {}) };
  return url ? (
    <Image source={{ uri: url }} style={box} contentFit="cover" />
  ) : (
    <View className="bg-violet-600 items-center justify-center" style={box}>
      <Text className={`text-white font-bold ${text}`}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const feedDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

function TeamBox({ team, winner }: { team: FeedPerson[]; winner: boolean }) {
  return (
    <View className={`flex-1 rounded-lg p-3 ${winner ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
      <View className="flex-row mb-2">
        {team.map((p, i) => (
          <View key={p.id} style={{ marginLeft: i ? -8 : 0 }}>
            <AvatarCircle name={p.name} url={p.avatarUrl} />
          </View>
        ))}
      </View>
      <Text className="text-xs font-semibold text-gray-900" numberOfLines={1}>
        {team.map(p => p.name.split(' ')[0]).join(' & ')}
      </Text>
      {winner && <Text className="text-[11px] font-bold text-green-600 mt-0.5">VENCEDOR</Text>}
    </View>
  );
}

/** Option picker standing in for the web's <select>. */
function SelectField({ value, options, onChange, label }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value)?.label ?? '';
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current}`}
        className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg flex-row items-center justify-between bg-white"
      >
        <Text className="text-sm font-medium text-gray-700">{current}</Text>
        <ChevronDown size={16} color={palette.gray['500']} />
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <Text className="font-bold text-gray-900 text-lg mb-3">{label}</Text>
        <ScrollView style={{ maxHeight: 360 }}>
          {options.map(o => (
            <Pressable
              key={o.value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`px-3 py-3 rounded-xl ${o.value === value ? 'bg-violet-50' : ''}`}
            >
              <Text className={`text-base ${o.value === value ? 'text-violet-700 font-semibold' : 'text-gray-700'}`}>{o.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const PODIUM = {
  1: { bg: 'bg-yellow-400', pt: 'pt-4', size: 80, text: 'text-2xl', name: 'font-bold text-base', rating: 'text-gray-700', place: 'text-3xl text-yellow-700' },
  2: { bg: 'bg-gray-300', pt: 'pt-8', size: 64, text: 'text-xl', name: 'font-semibold text-sm', rating: 'text-gray-600', place: 'text-2xl text-gray-600' },
  3: { bg: 'bg-orange-300', pt: 'pt-12', size: 56, text: 'text-lg', name: 'font-semibold text-sm', rating: 'text-gray-600', place: 'text-xl text-orange-700' },
} as const;

/** Podium step "growing" from its base (web: scaleY 0→1, origin bottom). */
function PodiumColumn({ player, place, visible, delay }: { player: RankingRow; place: 1 | 2 | 3; visible: boolean; delay: number }) {
  const [anim] = useState(() => new Animated.Value(0));
  const [height, setHeight] = useState(0);
  useEffect(() => {
    anim.setValue(0);
    if (visible) Animated.timing(anim, { toValue: 1, duration: 1100, delay, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }, [visible, delay, anim]);
  const cfg = PODIUM[place];
  // RN scales from the centre: shift by half the height so the base stays put.
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height / 2, 0] });
  return (
    <Pressable onPress={() => router.push({ pathname: '/player/[id]', params: { id: player.id } })} className="flex-1 items-center">
      <Animated.View onLayout={e => setHeight(e.nativeEvent.layout.height)} className="rounded-t-xl overflow-hidden w-full" style={{ transform: [{ translateY }, { scaleY: anim }] }}>
        <View className={`${cfg.bg} p-4 ${cfg.pt} items-center`}>
          {place === 1 && (
            <View className="mb-2">
              <Trophy size={24} color={palette.yellow['700']} />
            </View>
          )}
          <View className="mb-2">
            <AvatarCircle name={player.name} url={player.avatarUrl} size={cfg.size} text={cfg.text} border={false} />
          </View>
          <Text className={`text-gray-900 ${cfg.name}`}>{player.name.split(' ')[0]}</Text>
          <Text className={`text-xs ${cfg.rating}`}>{player.rating.toFixed(2)}</Text>
          <Text className={`font-bold mt-2 ${cfg.place}`}>{place}°</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function FadeIn({ visible, delay, children, scaleFrom = 1 }: { visible: boolean; delay: number; children: React.ReactNode; scaleFrom?: number }) {
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    anim.setValue(0);
    if (visible) Animated.timing(anim, { toValue: 1, duration: 400, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [visible, delay, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] });
  return <Animated.View style={{ opacity: anim, transform: [{ translateY }, { scale }] }}>{children}</Animated.View>;
}

export default function Community() {
  const { session, profile } = useAuth();
  const userId = session!.user.id;
  const [tab, setTab] = useState<Tab>('ranking');
  const [scope, setScope] = useState<Scope>('geral');
  const [cityPick, setCityPick] = useState<string | null>(null);
  const [venuePick, setVenuePick] = useState<string | null>(null);

  const rankings = useQuery({ queryKey: ['rankings'], queryFn: fetchRankings });
  const venues = useQuery({ queryKey: ['myFutevoleiVenues', userId], queryFn: () => fetchMyFutevoleiVenues(userId) });
  const feed = useQuery({ queryKey: ['feed'], queryFn: fetchFeed });

  const all = useMemo(() => rankings.data ?? [], [rankings.data]);
  const cityOptions = useMemo(() => [...new Set(all.map(r => r.location).filter(Boolean) as string[])].sort(), [all]);
  // Default city: the user's own if it appears in the ranking, else the first one found (like the web).
  const defaultCity = profile?.location && all.some(r => r.location === profile.location) ? profile.location : (all.find(r => r.location)?.location ?? '');
  const selectedCity = cityPick ?? defaultCity;
  const selectedVenueId = venuePick ?? venues.data?.[0]?.id ?? '';
  const club = useQuery({ queryKey: ['clubRankings', selectedVenueId], queryFn: () => fetchClubRankings(selectedVenueId), enabled: !!selectedVenueId && scope === 'clube' });

  const cityRankings = useMemo(() => all.filter(r => r.location === selectedCity).map((r, i) => ({ ...r, position: i + 1 })), [all, selectedCity]);
  const active = scope === 'geral' ? all : scope === 'cidade' ? cityRankings : (club.data ?? []);
  const loading = scope === 'clube' ? club.isPending && !!selectedVenueId : rankings.isPending;
  const me = active.find(r => r.id === userId);
  const visible = !loading && active.length > 0;
  const rest = active.slice(active.length >= 3 ? 3 : 0);
  // Remount the list when the visible ranking changes so the entrance animation replays, like the web.
  const listKey = `${scope}|${selectedCity}|${selectedVenueId}|${active.length}`;

  const refresh = () => {
    rankings.refetch();
    venues.refetch();
    feed.refetch();
    if (scope === 'clube') club.refetch();
  };

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-violet-600">
        <View className="bg-violet-600 px-6 py-4">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-bold text-white">Comunidade</Text>
          </View>
        </View>
      </SafeAreaView>

      <View className="bg-white border-b border-gray-200 px-6 flex-row gap-6">
        {(['feed', 'ranking', 'messages'] as Tab[]).map(t => {
          const on = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: on }} className={`py-4 border-b-2 ${on ? 'border-violet-600' : 'border-transparent'}`}>
              <Text className={`font-semibold text-base ${on ? 'text-violet-600' : 'text-gray-500'}`}>{t === 'feed' ? 'Feed' : t === 'ranking' ? 'Ranking' : 'Mensagens'}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerClassName="pb-20"
        refreshControl={<RefreshControl refreshing={rankings.isRefetching || feed.isRefetching} onRefresh={refresh} tintColor={palette.violet['600']} />}
      >
        {tab === 'feed' && (
          <View className="px-6 py-6 gap-4">
            {feed.isPending ? (
              <Text className="text-sm text-gray-400">Carregando...</Text>
            ) : !feed.data?.length ? (
              <Text className="text-sm text-gray-500">{feed.isError ? 'Não foi possível carregar o feed.' : 'Ainda não há partidas de futevôlei confirmadas na comunidade.'}</Text>
            ) : (
              feed.data.map(item => (
                <View key={item.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <View className="flex-row items-center gap-1 mb-3">
                    <MapPin size={14} color={palette.gray['400']} />
                    <Text className="text-xs text-gray-400 flex-1" numberOfLines={1}>
                      {item.venueName}
                      {item.date ? ` · ${feedDate(item.date)}` : ''}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <TeamBox team={item.teamA} winner={item.winningTeam === 'a'} />
                    <Text className="text-xs font-bold text-gray-400">vs</Text>
                    <TeamBox team={item.teamB} winner={item.winningTeam === 'b'} />
                  </View>
                  <Text className="text-sm font-bold text-gray-900 text-center mt-3">{item.sets.map(s => `${s.a}-${s.b}`).join(', ')}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'ranking' && (
          <View className="py-6">
            <View className="px-6 mb-4">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ranking · Futevôlei</Text>
              <View className="flex-row gap-2">
                {(['geral', 'cidade', 'clube'] as Scope[]).map(s => {
                  const on = scope === s;
                  return (
                    <Pressable key={s} onPress={() => setScope(s)} accessibilityRole="button" accessibilityState={{ selected: on }} className={`px-3 py-1.5 rounded-full ${on ? 'bg-violet-600' : 'bg-gray-100'}`}>
                      <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-gray-600'}`}>{s === 'geral' ? 'Geral' : s === 'cidade' ? 'Cidade' : 'Clube'}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {scope === 'cidade' &&
                (cityOptions.length === 0 ? (
                  <Text className="text-sm text-gray-400 mt-3">Nenhuma cidade cadastrada entre os jogadores ranqueados ainda.</Text>
                ) : (
                  <SelectField label="Cidade" value={selectedCity} options={cityOptions.map(c => ({ value: c, label: c }))} onChange={setCityPick} />
                ))}

              {scope === 'clube' &&
                (venues.isPending ? null : !venues.data?.length ? (
                  <Text className="text-sm text-gray-400 mt-3">Você ainda não jogou futevôlei em nenhum clube.</Text>
                ) : (
                  <>
                    <SelectField label="Clube" value={selectedVenueId} options={venues.data.map(v => ({ value: v.id, label: v.name }))} onChange={setVenuePick} />
                    <Text className="text-[12px] text-gray-400 mt-2">Só aparecem jogadores com {PROVISIONAL_MATCHES_THRESHOLD}+ partidas de futevôlei confirmadas.</Text>
                  </>
                ))}
            </View>

            {loading ? (
              <Text className="px-6 text-sm text-gray-400">Carregando...</Text>
            ) : active.length === 0 ? (
              <Text className="px-6 text-sm text-gray-500">{scope === 'clube' && !venues.data?.length ? '' : 'Nenhum jogador encontrado nesse recorte.'}</Text>
            ) : (
              <View key={listKey}>
                {active.length >= 3 && (
                  <View className="px-6 mb-6">
                    <View className="flex-row items-end justify-center gap-2 mb-6">
                      <PodiumColumn player={active[1]} place={2} visible={visible} delay={150} />
                      <PodiumColumn player={active[0]} place={1} visible={visible} delay={350} />
                      <PodiumColumn player={active[2]} place={3} visible={visible} delay={0} />
                    </View>
                  </View>
                )}

                <View className="px-6 gap-2">
                  {rest.map((player, i) => (
                    <FadeIn key={player.id} visible={visible} delay={Math.min(i * 60, 400)}>
                      <Pressable
                        onPress={() => router.push({ pathname: '/player/[id]', params: { id: player.id } })}
                        className="bg-white rounded-xl p-4 border border-gray-200 flex-row items-center gap-3 active:border-violet-200"
                      >
                        <Text className="text-lg font-bold text-gray-400 w-8 text-center">{player.position}°</Text>
                        <AvatarCircle name={player.name} url={player.avatarUrl} size={48} text="text-lg" border={false} />
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="font-semibold text-gray-900 text-base flex-shrink" numberOfLines={1}>
                              {player.name}
                            </Text>
                            {player.matches_played < PROVISIONAL_MATCHES_THRESHOLD && (
                              <View className="bg-amber-100 px-1 py-0.5 rounded">
                                <Text className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Provisório</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-sm text-gray-600">{player.matches_played} partidas</Text>
                        </View>
                        <Text className="font-bold text-violet-600 text-base">{player.rating.toFixed(2)}</Text>
                      </Pressable>
                    </FadeIn>
                  ))}
                </View>

                {me && (
                  <View className="px-6 mt-6">
                    <FadeIn visible={visible} delay={Math.min(rest.length * 60, 400) + 100} scaleFrom={0.96}>
                      <Pressable onPress={() => router.navigate('/profile')} className="bg-violet-600 rounded-xl p-4 flex-row items-center gap-3">
                        <Text className="text-lg font-bold w-8 text-center text-white">{me.position}°</Text>
                        <View className="w-12 h-12 bg-white/20 rounded-full items-center justify-center overflow-hidden">
                          {me.avatarUrl ? (
                            <Image source={{ uri: me.avatarUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                          ) : (
                            <Text className="text-lg font-bold text-white">{me.name.charAt(0).toUpperCase()}</Text>
                          )}
                        </View>
                        <View className="flex-1">
                          <Text className="font-semibold text-white text-base">Você</Text>
                          <Text className="text-sm text-violet-100">{me.matches_played} partidas</Text>
                        </View>
                        <Text className="font-bold text-white text-base">{me.rating.toFixed(2)}</Text>
                      </Pressable>
                    </FadeIn>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {tab === 'messages' && (
          <View className="py-6">
            <ComingSoonBanner />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
