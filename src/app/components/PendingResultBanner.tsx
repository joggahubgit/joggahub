import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { wallDate, wallTime } from '@/app/lib/wallClock';

// Mirrors RESULT_CONFIRM_TIMEOUT_HOURS in process-game-transitions
const AUTO_CONFIRM_HOURS = 6;

interface PendingResult {
  gameId: string;
  sets: { a: number; b: number }[];
  submitterName: string;
  myTeam: 'a' | 'b';
  createdAt: string;
  scheduledAt: string | null;
  venueName: string;
}

/**
 * Home banner: a match result registered by the OTHER team is waiting for the
 * player's confirmation (only the opposing side can confirm — same rule as
 * submit-game-result). Tapping it opens the game, where GameResultSubmit shows
 * the confirm / dispute buttons.
 */
export function PendingResultBanner({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingResult[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: mine } = await supabase
        .from('game_players').select('game_id, team').eq('player_id', userId);
      const myTeamByGame = Object.fromEntries((mine ?? []).filter(m => m.team).map(m => [m.game_id, m.team as 'a' | 'b']));
      const gameIds = Object.keys(myTeamByGame);
      if (!gameIds.length) { if (!cancelled) setPending([]); return; }

      const { data: results } = await supabase
        .from('game_results')
        .select('game_id, sets, submitted_by, created_at')
        .in('game_id', gameIds)
        .eq('status', 'pending')
        .neq('submitted_by', userId);
      if (!results?.length) { if (!cancelled) setPending([]); return; }

      const pendingIds = results.map(r => r.game_id);
      const [{ data: roster }, { data: games }] = await Promise.all([
        supabase.from('game_players').select('game_id, player_id, player_name, team').in('game_id', pendingIds),
        supabase.from('games').select('id, scheduled_at, courts(name, venues(name))').in('id', pendingIds),
      ]);

      const list: PendingResult[] = results.flatMap(r => {
        const submitter = (roster ?? []).find(p => p.game_id === r.game_id && p.player_id === r.submitted_by);
        const myTeam = myTeamByGame[r.game_id];
        // Only the opposing team can confirm — a teammate's submission isn't ours to confirm
        if (!submitter?.team || submitter.team === myTeam) return [];
        const game: any = (games ?? []).find(g => g.id === r.game_id);
        return [{
          gameId: r.game_id,
          sets: r.sets ?? [],
          submitterName: (submitter.player_name ?? 'Um jogador').split(' ')[0],
          myTeam,
          createdAt: r.created_at,
          scheduledAt: game?.scheduled_at ?? null,
          venueName: game?.courts?.venues?.name ?? game?.courts?.name ?? '',
        }];
      }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      if (!cancelled) setPending(list);
    }

    load();
    // Re-check when the player comes back to the tab (e.g. after confirming)
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, [userId]);

  if (pending.length === 0) return null;

  const first = pending[0];
  // Score from the player's own side: "18–14" means my team scored 18
  const score = first.sets.map(s => (first.myTeam === 'a' ? `${s.a}–${s.b}` : `${s.b}–${s.a}`)).join(', ');
  const setsWon = first.sets.filter(s => (first.myTeam === 'a' ? s.a > s.b : s.b > s.a)).length;
  const won = setsWon > first.sets.length - setsWon;
  const hoursLeft = Math.max(0, AUTO_CONFIRM_HOURS - (Date.now() - new Date(first.createdAt).getTime()) / 3_600_000);
  const timeLeft = hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h` : `${Math.max(1, Math.round(hoursLeft * 60))} min`;
  const when = first.scheduledAt ? `${wallDate(first.scheduledAt)} · ${wallTime(first.scheduledAt)}` : '';

  return (
    <button
      onClick={() => navigate(`/open-game/${first.gameId}`)}
      className="mx-6 mt-5 w-[calc(100%-3rem)] text-left bg-white border-2 border-amber-300 rounded-2xl p-4 flex items-center gap-3 shadow-sm active:scale-[0.99] transition-transform"
    >
      <div className="relative w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Trophy className="w-5 h-5 text-amber-600" />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-sm">
          Confirme o resultado{pending.length > 1 ? ` (${pending.length})` : ''}
        </p>
        <p className="text-xs text-gray-600 truncate">
          {first.submitterName} registrou {won ? 'sua vitória' : 'sua derrota'} · {score}
        </p>
        <p className="text-[11px] text-gray-400 truncate">
          {[first.venueName, when].filter(Boolean).join(' · ')} · confirma sozinho em {timeLeft}
        </p>
      </div>
      <span className="flex items-center gap-0.5 text-sm font-bold text-violet-600 flex-shrink-0">
        Ver <ChevronRight className="w-4 h-4" />
      </span>
    </button>
  );
}
