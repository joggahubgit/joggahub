// Port of src/app/components/PlayerStatsSection.tsx (web), incl. the chart
// "draw" and efficacy ring animations.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PROVISIONAL_MATCHES_THRESHOLD, wallDate, wallTime } from '@/lib/shared';
import { fetchPlayerStats, type PersonRef, type ResultStatus } from './api';
import palette from '../../../tailwind.palette';

const VIOLET = '#7c3aed'; // the web hardcodes this hex in the SVGs
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STATUS_BADGE: Record<Exclude<ResultStatus, 'confirmed' | 'pending'>, { label: string; bg: string; fg: string }> = {
  disputed: { label: 'Em disputa', bg: 'bg-red-100', fg: 'text-red-700' },
  draw: { label: 'Empate', bg: 'bg-gray-200', fg: 'text-gray-600' },
  invalid: { label: 'Inválido', bg: 'bg-gray-200', fg: 'text-gray-600' },
};

function InitialsCircle({ person, size = 36, text = 'text-xs' }: { person: PersonRef | null | undefined; size?: number; text?: string }) {
  if (!person) return null;
  const box = { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#ffffff' };
  return person.avatarUrl ? (
    <Image source={{ uri: person.avatarUrl }} style={box} contentFit="cover" />
  ) : (
    <View className="bg-violet-600 items-center justify-center" style={box}>
      <Text className={`text-white font-bold ${text}`}>{person.name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function PlayerCell({ person }: { person: PersonRef | null | undefined }) {
  return (
    <View className="items-center gap-1 w-16">
      {person ? <InitialsCircle person={person} size={44} text="text-sm" /> : <View className="w-11 h-11 rounded-full bg-gray-100" />}
      {person && (
        <Text className="text-[12px] text-gray-700 font-medium text-center w-full" numberOfLines={1}>
          {person.name.split(' ')[0]}
        </Text>
      )}
      {person?.rating != null && (
        <View className="bg-lime-100 px-1.5 py-0.5 rounded">
          <Text className="text-[11px] font-bold text-lime-700">{person.rating.toFixed(1).replace('.', ',')}</Text>
        </View>
      )}
    </View>
  );
}

function RatingChart({ points }: { points: { rating: number }[] }) {
  const [draw] = useState(() => new Animated.Value(0));
  useEffect(() => {
    draw.setValue(0);
    Animated.timing(draw, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [points.length, draw]);

  if (points.length < 2) return <Text className="text-xs text-gray-400 text-center py-8">Jogue mais partidas pra ver sua evolução aqui.</Text>;

  const W = 300;
  const H = 100;
  const PAD = 8;
  const values = points.map(p => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = points.map((p, i) => [PAD + (i / (points.length - 1)) * (W - PAD * 2), H - PAD - ((p.rating - min) / range) * (H - PAD * 2)] as const);
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${path} L${coords[coords.length - 1][0].toFixed(1)},${H - PAD} L${coords[0][0].toFixed(1)},${H - PAD} Z`;
  const last = coords[coords.length - 1];
  const length = coords.reduce((acc, [x, y], i) => (i ? acc + Math.hypot(x - coords[i - 1][0], y - coords[i - 1][1]) : 0), 0);
  // Same timings as the web: line 0–0.9s, area fades in from 0.6s, end dot pops at 0.9s.
  const dashOffset = draw.interpolate({ inputRange: [0, 0.75, 1], outputRange: [length, 0, 0] });
  const areaOpacity = draw.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 0.15] });
  const dotR = draw.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0, 0, 4] });

  return (
    <View>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={96}>
        <Defs>
          <LinearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={VIOLET} />
            <Stop offset="100%" stopColor={VIOLET} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <AnimatedPath d={area} fill="url(#ratingGradient)" opacity={areaOpacity} />
        <AnimatedPath d={path} fill="none" stroke={VIOLET} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[length, length]} strokeDashoffset={dashOffset} />
        <AnimatedCircle cx={last[0]} cy={last[1]} r={dotR} fill={VIOLET} stroke="white" strokeWidth={2} />
      </Svg>
      <View className="flex-row justify-between mt-1">
        <Text className="text-[11px] text-gray-400">{min.toFixed(2)}</Text>
        <Text className="text-[11px] font-semibold text-violet-600">{values[values.length - 1].toFixed(2)}</Text>
        <Text className="text-[11px] text-gray-400">{max.toFixed(2)}</Text>
      </View>
    </View>
  );
}

function EfficacyRing({ efficacy }: { efficacy: number }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: efficacy / 100, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [efficacy, progress]);
  const C = 97.4;
  const dash = progress.interpolate({ inputRange: [0, 1], outputRange: [C, 0] });
  return (
    <View className="w-14 h-14 items-center justify-center">
      <Svg viewBox="0 0 36 36" width={56} height={56} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx="18" cy="18" r="15.5" fill="none" stroke={palette.gray['200']} strokeWidth="3" />
        <AnimatedCircle cx="18" cy="18" r="15.5" fill="none" stroke={VIOLET} strokeWidth="3" strokeDasharray={[C, C]} strokeDashoffset={dash} strokeLinecap="round" />
      </Svg>
      <Text className="text-xs font-bold text-gray-900">{efficacy}%</Text>
    </View>
  );
}

export function PlayerStatsSection({ userId, version = 0 }: { userId: string; version?: number }) {
  const q = useQuery({ queryKey: ['playerStats', userId, version], queryFn: () => fetchPlayerStats(userId) });

  if (q.isPending) {
    return (
      <View className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5 items-center">
        <ActivityIndicator color={palette.gray['400']} />
      </View>
    );
  }
  if (q.isError) {
    return (
      <Pressable onPress={() => q.refetch()} className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5 items-center">
        <Text className="text-sm text-gray-500">Não foi possível carregar suas estatísticas. Toque para tentar de novo.</Text>
      </Pressable>
    );
  }

  const { rating, history, matches } = q.data;
  const confirmed = matches.filter(m => m.status === 'confirmed');
  const wins = confirmed.filter(m => m.won).length;
  const last10 = confirmed.slice(0, 10);
  const last10Wins = last10.filter(m => m.won).length;
  const efficacy = last10.length ? Math.round((last10Wins / last10.length) * 100) : 0;
  const partners = Object.values(
    confirmed.reduce<Record<string, { person: PersonRef; games: number; wins: number }>>((acc, m) => {
      if (!m.teammate) return acc;
      const e = acc[m.teammate.id] ?? { person: m.teammate, games: 0, wins: 0 };
      e.games++;
      if (m.won) e.wins++;
      acc[m.teammate.id] = e;
      return acc;
    }, {}),
  )
    .sort((a, b) => b.games - a.games)
    .slice(0, 5);
  const me: PersonRef = { id: userId, name: 'Você', avatarUrl: null, rating: rating?.rating ?? null };
  const fmt = (iso: string | null) => (iso ? `${wallDate(iso, { day: '2-digit', month: 'short' })} · ${wallTime(iso)}` : '');

  return (
    <View className="mx-5 mb-3 gap-3">
      <View className="bg-white rounded-2xl border border-gray-200 p-5">
        <Text className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Pontuação · Futevôlei</Text>
        {rating === null ? (
          <Text className="text-sm text-gray-500">Ainda sem partidas de futevôlei registradas.</Text>
        ) : (
          <>
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-3xl font-black text-gray-900">{rating.rating.toFixed(2)}</Text>
                {rating.matches_played < PROVISIONAL_MATCHES_THRESHOLD && (
                  <View className="bg-amber-100 px-1.5 py-0.5 rounded">
                    <Text className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Provisório</Text>
                  </View>
                )}
              </View>
              <Text className="text-xs text-gray-400">
                {rating.matches_played} {rating.matches_played === 1 ? 'partida' : 'partidas'}
              </Text>
            </View>
            <RatingChart points={history} />
          </>
        )}
      </View>

      {matches.length > 0 && (
        <View>
          <Text className="text-lg font-black text-gray-900 mb-3">Jogos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={292} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingTop: 6 }} style={{ marginHorizontal: -20 }}>
            {matches.slice(0, 10).map(m => (
              <Pressable
                key={m.gameId}
                onPress={() => router.push({ pathname: '/game/[id]', params: { id: m.gameId } })}
                className="w-[280px] rounded-2xl border border-gray-200 bg-white p-3 flex-row items-stretch gap-3"
              >
                {m.status === 'pending' && <View className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />}
                <View className="flex-row flex-wrap" style={{ width: 136, rowGap: 8, columnGap: 8 }}>
                  <PlayerCell person={me} />
                  <PlayerCell person={m.teammate} />
                  <PlayerCell person={m.opponents[0]} />
                  <PlayerCell person={m.opponents[1]} />
                </View>
                <View className="border-l border-gray-100 pl-3 flex-1 justify-center">
                  <Text className="text-xs text-gray-500">{fmt(m.date)}</Text>
                  <View className="my-1.5 flex-row">
                    {m.status === 'confirmed' ? (
                      <View className={`px-2 py-1 rounded-lg ${m.won ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <Text className={`text-xs font-bold ${m.won ? 'text-green-700' : 'text-gray-500'}`}>{m.won ? 'Vitória' : 'Derrota'}</Text>
                      </View>
                    ) : m.status === 'pending' ? (
                      <View className="flex-row items-center gap-1 px-2 py-1 rounded-lg bg-red-50">
                        <Coins size={14} color={palette.red['600']} />
                        <Text className="text-xs font-bold text-red-600">Pendente</Text>
                      </View>
                    ) : (
                      <View className={`px-2 py-1 rounded-lg ${STATUS_BADGE[m.status].bg}`}>
                        <Text className={`text-xs font-bold ${STATUS_BADGE[m.status].fg}`}>{STATUS_BADGE[m.status].label}</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-gray-500" numberOfLines={1}>
                    {m.venueName}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {confirmed.length > 0 && (
        <View className="bg-white rounded-2xl border border-gray-200 p-5">
          <Text className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-4">Estatísticas</Text>
          <View className="flex-row flex-wrap mb-4" style={{ rowGap: 16 }}>
            {[
              [confirmed.length, 'Totais', 'text-gray-900'],
              [wins, 'Vitórias', 'text-green-600'],
              [last10.length, 'Últimas 10', 'text-gray-900'],
              [last10Wins, 'Vencidas', 'text-green-600'],
            ].map(([n, label, cls]) => (
              <View key={label as string} style={{ width: '50%' }}>
                <Text className={`text-2xl font-black ${cls}`}>{n}</Text>
                <Text className="text-xs text-gray-400">{label}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row items-center gap-3 pt-3 border-t border-gray-100">
            <EfficacyRing efficacy={efficacy} />
            <Text className="text-xs text-gray-500">Eficácia nas últimas {last10.length} partidas</Text>
          </View>
        </View>
      )}

      {partners.length > 0 && (
        <View className="bg-white rounded-2xl border border-gray-200 p-5">
          <Text className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Combinações</Text>
          <View className="gap-2">
            {partners.map(p => (
              <View key={p.person.id} className="flex-row items-center gap-3">
                <InitialsCircle person={p.person} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
                    {p.person.name}
                  </Text>
                  <Text className="text-xs text-gray-400">
                    {p.games} {p.games === 1 ? 'jogo' : 'jogos'} · {p.wins} {p.wins === 1 ? 'vitória' : 'vitórias'}
                  </Text>
                </View>
                <Text className="text-sm font-bold text-violet-600">{Math.round((p.wins / p.games) * 100)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
