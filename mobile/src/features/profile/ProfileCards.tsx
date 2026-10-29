// Ports of ProfileCompletenessCard.tsx and AdjustLevelCard.tsx (web).
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { BadgeCheck, ChevronDown, ChevronRight, TrendingDown } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { FUTEVOLEI_LEVELS, type profileCompleteness, type ProfileSection } from '@/lib/shared';
import { lowerMyRating } from './api';
import palette from '../../../tailwind.palette';

export function ProfileCompletenessCard({
  completeness: c,
  onPick,
}: {
  completeness: ReturnType<typeof profileCompleteness>;
  onPick: (section: ProfileSection) => void;
}) {
  if (c.complete) {
    return (
      <View className="flex-row items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
        <BadgeCheck size={24} color={palette.green['600']} />
        <View className="flex-1">
          <Text className="font-bold text-green-800 text-sm">Perfil completo</Text>
          <Text className="text-xs text-green-700">Outros jogadores veem todas as suas informações.</Text>
        </View>
      </View>
    );
  }
  const sections = [...new Map(c.missing.map(m => [m.section, m])).values()];
  return (
    <View className="bg-white border border-violet-200 rounded-2xl p-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-bold text-gray-900 text-sm">Perfil {c.pct}% completo</Text>
        <Text className="text-xs text-gray-400">
          {c.done}/{c.total}
        </Text>
      </View>
      <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <View className="h-full bg-violet-600 rounded-full" style={{ width: `${c.pct}%` }} />
      </View>
      <Text className="text-xs text-gray-500 mt-3 mb-2">Falta:</Text>
      <View className="flex-row flex-wrap gap-2">
        {sections.map(m => (
          <Pressable
            key={m.section}
            onPress={() => onPick(m.section)}
            className="flex-row items-center gap-1 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-100 active:bg-violet-100"
          >
            <Text className="text-violet-700 text-xs font-semibold">
              {c.missing
                .filter(x => x.section === m.section)
                .map(x => x.label)
                .join(' e ')}
            </Text>
            <ChevronRight size={12} color={palette.violet['700']} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const MIN_RATING = 0.5;

export function AdjustLevelCard({ currentRating, onLowered }: { currentRating: number; onLowered: (rating: number) => void }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = FUTEVOLEI_LEVELS.filter(l => l.rating < currentRating).map(l => ({ key: l.key, label: l.label, description: l.description, rating: l.rating }));
  if (currentRating > MIN_RATING && !options.some(o => o.rating === MIN_RATING)) {
    options.unshift({ key: 'minimo', label: 'Mínimo', description: 'Começar do zero', rating: MIN_RATING });
  }
  if (!options.length) return null;

  async function confirm() {
    if (choice == null || busy) return;
    setBusy(true);
    setError('');
    try {
      await lowerMyRating(choice);
      setOpen(false);
      setChoice(null);
      onLowered(choice);
    } catch (e) {
      setError((e as Error).message || 'Não foi possível ajustar seu nível.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200">
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="w-full flex-row items-center justify-between px-5 py-3.5">
        <View className="flex-row items-center gap-2 flex-1">
          <TrendingDown size={16} color={palette.gray['400']} />
          <Text className="text-sm text-gray-600 flex-1">
            Seu nível está acima do que você joga? <Text className="text-sm font-semibold text-violet-600">Ajustar</Text>
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={16} color={palette.gray['400']} />
        </View>
      </Pressable>
      {open && (
        <View className="px-5 pb-5 gap-2">
          <Text className="text-xs text-gray-500 mb-1">
            Atual: <Text className="text-xs font-bold text-gray-900">{currentRating.toFixed(2)}</Text>. Você pode reduzir seu nível a qualquer momento, mas{' '}
            <Text className="text-xs font-bold text-gray-500">não pode aumentar manualmente</Text> — ele só sobe vencendo partidas.
          </Text>
          {options.map(o => (
            <Pressable
              key={o.key}
              onPress={() => setChoice(o.rating)}
              disabled={busy}
              className={`w-full flex-row items-center justify-between px-3 py-2.5 rounded-xl border-2 ${choice === o.rating ? 'border-violet-600 bg-violet-50' : 'border-gray-200'}`}
            >
              <View>
                <Text className="font-semibold text-sm text-gray-900">{o.label}</Text>
                <Text className="text-xs text-gray-400">{o.description}</Text>
              </View>
              <Text className="text-sm font-bold text-gray-700">{o.rating.toFixed(1)}</Text>
            </Pressable>
          ))}
          {!!error && <Text className="text-sm text-red-600">{error}</Text>}
          <Pressable
            onPress={confirm}
            disabled={busy || choice == null}
            className={`w-full mt-1 py-2.5 rounded-xl flex-row items-center justify-center gap-2 ${busy || choice == null ? 'bg-gray-100' : 'bg-violet-600'}`}
          >
            {busy && <ActivityIndicator size="small" color="#ffffff" />}
            <Text className={`text-sm font-semibold ${busy || choice == null ? 'text-gray-400' : 'text-white'}`}>
              {choice == null ? 'Escolha um nível' : `Reduzir para ${choice.toFixed(1)}`}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
