// "Meu Jogo" / "Jogo" rows shared by Profile and PublicProfile (same markup on the web).
import { View } from 'react-native';
import { Calendar, Clock, Target } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { DAY_LABELS, PERIOD_LABELS } from '@/lib/shared';
import palette from '../../../tailwind.palette';

const Dash = () => <Text className="text-sm text-gray-300">—</Text>;

export function GameInfoRows({
  position,
  foot,
  availability,
}: {
  position: string | null;
  foot: string | null;
  availability: { days?: string[]; periods?: string[] } | null | undefined;
}) {
  const days = availability?.days ?? [];
  const periods = availability?.periods ?? [];
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Target size={16} color={palette.gray['500']} />
          <Text className="text-sm text-gray-500">Posição preferida</Text>
        </View>
        {position ? <Text className="text-sm font-semibold text-gray-900">{position}</Text> : <Dash />}
      </View>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-base">🦶</Text>
          <Text className="text-sm text-gray-500">Pé dominante</Text>
        </View>
        {foot ? <Text className="text-sm font-semibold text-gray-900">{foot}</Text> : <Dash />}
      </View>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-row items-center gap-2 pt-0.5">
          <Calendar size={16} color={palette.gray['500']} />
          <Text className="text-sm text-gray-500">Dias</Text>
        </View>
        {days.length ? (
          <View className="flex-row flex-wrap gap-1.5 justify-end flex-1">
            {days.map(d => (
              <View key={d} className="px-2.5 py-1 bg-violet-50 rounded-full border border-violet-100">
                <Text className="text-violet-700 text-xs font-semibold">{DAY_LABELS[d] ?? d}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Dash />
        )}
      </View>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Clock size={16} color={palette.gray['500']} />
          <Text className="text-sm text-gray-500">Horário</Text>
        </View>
        {periods.length ? (
          <View className="flex-row gap-2">
            {periods.map(p => (
              <View key={p} className="bg-gray-100 px-2.5 py-1 rounded-full">
                <Text className="text-xs font-semibold text-gray-700">{PERIOD_LABELS[p] ?? p}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Dash />
        )}
      </View>
    </View>
  );
}

/** "Estatísticas" 3-up grid (Partidas / Organizadas / Como jogador). */
export function GameCountsGrid({ asOrganizer, asPlayer }: { asOrganizer: number; asPlayer: number }) {
  return (
    <View className="mx-5 mb-3">
      <Text className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Estatísticas</Text>
      <View className="flex-row gap-2">
        {(
          [
            [asOrganizer + asPlayer, 'Partidas', 'text-violet-600'],
            [asOrganizer, 'Organizadas', 'text-orange-500'],
            [asPlayer, 'Como jogador', 'text-blue-500'],
          ] as const
        ).map(([n, label, cls]) => (
          <View key={label} className="flex-1 bg-white rounded-xl p-4 border border-gray-200 items-center">
            <Text className={`text-2xl font-bold mb-0.5 ${cls}`}>{n}</Text>
            <Text className="text-xs text-gray-500">{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
