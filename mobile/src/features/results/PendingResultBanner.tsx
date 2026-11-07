// Port of src/app/components/PendingResultBanner.tsx (web): Home banner for a
// result registered by the OTHER team that is waiting for this player.
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Trophy } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { wallDate, wallTime } from '@/lib/shared';
import palette from '../../../tailwind.palette';

// Mirrors RESULT_CONFIRM_TIMEOUT_HOURS in process-game-transitions.
const AUTO_CONFIRM_HOURS = 6;

interface Pending {
  gameId: string;
  sets: { a: number; b: number }[];
  submitterName: string;
  myTeam: 'a' | 'b';
  createdAt: string;
  scheduledAt: string | null;
  venueName: string;
}

async function fetchPending(userId: string): Promise<{ list: Pending[]; checkedAt: number }> {
  const checkedAt = Date.now();
  const { data: mine } = await supabase.from('game_players').select('game_id, team').eq('player_id', userId);
  const myTeam = Object.fromEntries((mine ?? []).filter(m => m.team).map(m => [m.game_id, m.team as 'a' | 'b']));
  const ids = Object.keys(myTeam);
  if (!ids.length) return { list: [], checkedAt };
  const { data: results } = await supabase.from('game_results').select('game_id, sets, submitted_by, created_at').in('game_id', ids).eq('status', 'pending').neq('submitted_by', userId);
  if (!results?.length) return { list: [], checkedAt };
  const pendingIds = results.map(r => r.game_id);
  const [{ data: roster }, { data: games }] = await Promise.all([
    supabase.from('game_players').select('game_id, player_id, player_name, team').in('game_id', pendingIds),
    supabase.from('games').select('id, scheduled_at, courts(name, venues(name))').in('id', pendingIds),
  ]);
  const list = results
    .flatMap(r => {
      const submitter = (roster ?? []).find(p => p.game_id === r.game_id && p.player_id === r.submitted_by);
      // Only the opposing team can confirm — a teammate's submission isn't ours to confirm.
      if (!submitter?.team || submitter.team === myTeam[r.game_id]) return [];
      const game: any = (games ?? []).find(g => g.id === r.game_id);
      return [
        {
          gameId: r.game_id,
          sets: r.sets ?? [],
          submitterName: (submitter.player_name ?? 'Um jogador').split(' ')[0],
          myTeam: myTeam[r.game_id],
          createdAt: r.created_at,
          scheduledAt: game?.scheduled_at ?? null,
          venueName: game?.courts?.venues?.name ?? game?.courts?.name ?? '',
        },
      ];
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { list, checkedAt };
}

export function PendingResultBanner({ userId }: { userId: string }) {
  const q = useQuery({ queryKey: ['pendingResults', userId], queryFn: () => fetchPending(userId) });
  // Re-check whenever Home regains focus (e.g. after confirming), like the web's window focus listener.
  useFocusEffect(
    useCallback(() => {
      q.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch identity is stable enough; run on focus only
    }, []),
  );

  const list = q.data?.list ?? [];
  if (!list.length) return null;
  const first = list[0];
  const score = first.sets.map(s => (first.myTeam === 'a' ? `${s.a}–${s.b}` : `${s.b}–${s.a}`)).join(', ');
  const setsWon = first.sets.filter(s => (first.myTeam === 'a' ? s.a > s.b : s.b > s.a)).length;
  const won = setsWon > first.sets.length - setsWon;
  const hoursLeft = Math.max(0, AUTO_CONFIRM_HOURS - (q.data!.checkedAt - new Date(first.createdAt).getTime()) / 3_600_000);
  const timeLeft = hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h` : `${Math.max(1, Math.round(hoursLeft * 60))} min`;
  const when = first.scheduledAt ? `${wallDate(first.scheduledAt)} · ${wallTime(first.scheduledAt)}` : '';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/game/[id]', params: { id: first.gameId } })}
      className="mx-6 mt-5 bg-white border-2 border-amber-300 rounded-2xl p-4 flex-row items-center gap-3 shadow-sm"
    >
      <View className="w-11 h-11 rounded-full bg-amber-100 items-center justify-center">
        <Trophy size={20} color={palette.amber['600']} />
        <View className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
      </View>
      <View className="flex-1">
        <Text className="font-bold text-gray-900 text-sm">
          Confirme o resultado{list.length > 1 ? ` (${list.length})` : ''}
        </Text>
        <Text className="text-xs text-gray-600" numberOfLines={1}>
          {first.submitterName} registrou {won ? 'sua vitória' : 'sua derrota'} · {score}
        </Text>
        <Text className="text-[12px] text-gray-400" numberOfLines={1}>
          {[first.venueName, when].filter(Boolean).join(' · ')} · confirma sozinho em {timeLeft}
        </Text>
      </View>
      <View className="flex-row items-center gap-0.5">
        <Text className="text-sm font-bold text-violet-600">Ver</Text>
        <ChevronRight size={16} color={palette.violet['600']} />
      </View>
    </Pressable>
  );
}
