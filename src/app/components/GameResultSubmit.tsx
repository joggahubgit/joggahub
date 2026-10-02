import { useState, useEffect } from 'react';
import { Trophy, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isValidSetScore, setTarget, deriveOutcome, type SetScore } from '@/app/lib/futevoleiSetRules';

interface Props {
  gameId: string;
  players: { id: string; name: string }[];
  currentUserId: string | null;
}

interface GameResultRow {
  id: string;
  sets: SetScore[];
  winner_ids: string[] | null;
  loser_ids: string[] | null;
  submitted_by: string;
  status: 'pending' | 'confirmed' | 'disputed' | 'invalid' | 'draw';
}

function emptySet(): SetScore {
  return { a: NaN, b: NaN };
}

function isEmptySet(s: SetScore) {
  return Number.isNaN(s.a) && Number.isNaN(s.b);
}

/**
 * Score-entry form — used both for the initial proposal and for a "discordo,
 * o placar foi outro" correction. All 3 sets are shown upfront (no "add set"
 * click needed) since most matches only need 1 or 2 — trailing rows just
 * stay empty and aren't submitted. Filled sets must be contiguous from Set 1
 * (no skipping a set in the middle).
 */
function SetScoreForm({ onSubmit, submitting, error }: { onSubmit: (sets: SetScore[]) => void; submitting: boolean; error: string }) {
  const [sets, setSets] = useState<SetScore[]>([emptySet(), emptySet(), emptySet()]);

  function updateSet(i: number, field: 'a' | 'b', value: string) {
    const n = value === '' ? NaN : Number(value);
    setSets(prev => prev.map((s, si) => si === i ? { ...s, [field]: n } : s));
  }

  const setErrors = sets.map((s, i) => {
    if (isEmptySet(s)) return null;
    if (Number.isNaN(s.a) || Number.isNaN(s.b)) return 'Preencha os dois placares do set';
    return isValidSetScore(s.a, s.b, setTarget(i)) ? null : `Placar impossível — set vai até ${setTarget(i)}, com vantagem mínima de 2`;
  });
  const hasSetError = setErrors.some(Boolean);

  // Leading contiguous filled sets are what actually gets submitted.
  let filledCount = 0;
  while (filledCount < sets.length && !isEmptySet(sets[filledCount])) filledCount++;
  const hasGap = sets.slice(filledCount).some(s => !isEmptySet(s));
  const setsToSubmit = sets.slice(0, filledCount);
  const canSubmit = filledCount > 0 && !hasGap && !hasSetError;
  const outcome = canSubmit ? deriveOutcome(setsToSubmit) : null;

  return (
    <div className="space-y-3">
      {sets.map((s, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 w-14 flex-shrink-0">Set {i + 1}</span>
            <input
              type="number" min={0} inputMode="numeric"
              value={Number.isNaN(s.a) ? '' : s.a}
              onChange={e => updateSet(i, 'a', e.target.value)}
              placeholder="Time A"
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm text-center focus:border-violet-500 focus:outline-none"
            />
            <span className="text-gray-300">×</span>
            <input
              type="number" min={0} inputMode="numeric"
              value={Number.isNaN(s.b) ? '' : s.b}
              onChange={e => updateSet(i, 'b', e.target.value)}
              placeholder="Time B"
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm text-center focus:border-violet-500 focus:outline-none"
            />
          </div>
          {setErrors[i] && <p className="text-[11px] text-red-600 pl-16">{setErrors[i]}</p>}
        </div>
      ))}

      {hasGap && (
        <p className="text-xs text-red-600">Não pule um set — preencha em ordem (Set 1, depois Set 2, depois Set 3).</p>
      )}

      {outcome?.status === 'draw' && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">1 set para cada lado — sem 3º set, vai ser registrado como empate (sem alterar rating).</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        disabled={!canSubmit || submitting}
        onClick={() => onSubmit(setsToSubmit)}
        className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar resultado'}
      </button>
    </div>
  );
}

export default function GameResultSubmit({ gameId, players, currentUserId }: Props) {
  const [result, setResult] = useState<GameResultRow | null | undefined>(undefined); // undefined = loading
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ratingDeltas, setRatingDeltas] = useState<{ playerId: string; before: number; after: number }[] | null>(null);
  const [correcting, setCorrecting] = useState(false);
  // Team A/B ids, only set once all 4 players picked a team when joining
  const [teamIds, setTeamIds] = useState<{ a: string[]; b: string[] } | null>(null);

  useEffect(() => {
    supabase.from('game_results').select('*').eq('game_id', gameId).maybeSingle()
      .then(({ data }) => setResult(data as GameResultRow | null));
    supabase.from('game_players').select('player_id, team').eq('game_id', gameId)
      .then(({ data }) => {
        const a = (data ?? []).filter(r => r.team === 'a').map(r => r.player_id);
        const b = (data ?? []).filter(r => r.team === 'b').map(r => r.player_id);
        setTeamIds(a.length === 2 && b.length === 2 ? { a, b } : null);
      });
  }, [gameId]);

  function nameFor(id: string) {
    return players.find(p => p.id === id)?.name ?? 'Jogador';
  }

  function teamLabel(ids: string[]) {
    return ids.map(nameFor).join(' e ');
  }

  function setsLabel(sets: SetScore[]) {
    return sets.map(s => `${s.a}-${s.b}`).join(', ');
  }

  async function submit(sets: SetScore[]) {
    setSubmitting(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');

      const { data, error: fnErr } = await supabase.functions.invoke('submit-game-result', {
        body: { gameId, sets },
      });
      if (fnErr) {
        const body = await (fnErr as any).context?.json?.().catch(() => null);
        throw new Error(body?.error ?? fnErr.message ?? 'Erro ao registrar resultado');
      }
      if (data?.status === 'confirmed') {
        setRatingDeltas(data.ratings ?? null);
        setResult(prev => prev ? { ...prev, status: 'confirmed' } : prev);
      } else if (data?.status === 'disputed' || data?.status === 'draw' || data?.status === 'invalid') {
        setResult(prev => prev ? { ...prev, status: data.status } : prev);
      } else {
        // Re-fetch to pick up the pending row we (or the other side) just created.
        const { data: fresh } = await supabase.from('game_results').select('*').eq('game_id', gameId).maybeSingle();
        setResult(fresh as GameResultRow | null);
      }
    } catch (e: any) {
      setError(e.message ?? 'Erro ao registrar resultado');
    } finally {
      setSubmitting(false);
    }
  }

  if (result === undefined) {
    return (
      <div className="mx-5 mt-4 bg-white border border-gray-200 rounded-2xl px-4 py-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // ── Confirmed ──
  if (result?.status === 'confirmed') {
    const mine = ratingDeltas?.find(r => r.playerId === currentUserId);
    const winnerLabel = result.winner_ids
      ? (teamIds && sameIds(result.winner_ids, teamIds.a) ? `Time A (${teamLabel(teamIds.a)})`
        : teamIds && sameIds(result.winner_ids, teamIds.b) ? `Time B (${teamLabel(teamIds.b)})`
        : teamLabel(result.winner_ids))
      : '';
    return (
      <div className="mx-5 mt-4 bg-green-50 border border-green-300 rounded-2xl px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-green-800">Resultado confirmado: {winnerLabel} venceu ({setsLabel(result.sets)})</p>
          {mine && (
            <p className="text-xs text-green-700 mt-0.5">
              Seu rating de futevôlei: {mine.before.toFixed(2)} → {mine.after.toFixed(2)}
              {mine.after >= mine.before ? ' ↑' : ' ↓'}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Draw ──
  if (result?.status === 'draw') {
    return (
      <div className="mx-5 mt-4 bg-gray-100 border border-gray-300 rounded-2xl px-4 py-3">
        <p className="text-sm font-bold text-gray-800">Empate ({setsLabel(result.sets)})</p>
        <p className="text-xs text-gray-500 mt-0.5">1 set para cada time, sem decisão. Rating não foi alterado.</p>
      </div>
    );
  }

  // ── Invalid ──
  if (result?.status === 'invalid') {
    return (
      <div className="mx-5 mt-4 bg-gray-100 border border-gray-300 rounded-2xl px-4 py-3">
        <p className="text-sm font-bold text-gray-800">Resultado inválido</p>
        <p className="text-xs text-gray-500 mt-0.5">O placar registrado ({setsLabel(result.sets)}) não é possível numa partida de futevôlei. Rating não foi alterado.</p>
      </div>
    );
  }

  // ── Disputed ──
  if (result?.status === 'disputed') {
    return (
      <div className="mx-5 mt-4 bg-red-50 border border-red-300 rounded-2xl px-4 py-3 flex items-center gap-3">
        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-800">Placares não batem</p>
          <p className="text-xs text-red-600 mt-0.5">Os times relataram resultados diferentes. Fale com o suporte pra resolver.</p>
        </div>
      </div>
    );
  }

  // ── Pending: someone already proposed a result ──
  if (result?.status === 'pending') {
    const submitterTeam = teamIds && teamIds.b.includes(result.submitted_by) ? 'b' : 'a';
    const isSameSide = teamIds && (submitterTeam === 'a' ? teamIds.a : teamIds.b).includes(currentUserId ?? '');
    const isSubmitter = result.submitted_by === currentUserId;

    if (isSubmitter || isSameSide) {
      return (
        <div className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
          <p className="text-sm font-bold text-blue-800">Resultado registrado: {setsLabel(result.sets)}</p>
          <p className="text-xs text-blue-600 mt-0.5">Aguardando confirmação do time adversário.</p>
        </div>
      );
    }

    // Caller is on the opposite team — can confirm or correct.
    if (correcting) {
      return (
        <div className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-4 space-y-3">
          <p className="text-sm font-bold text-blue-800">Qual foi o placar de verdade?</p>
          <SetScoreForm onSubmit={submit} submitting={submitting} error={error} />
          <button onClick={() => setCorrecting(false)} className="w-full text-xs text-gray-500 font-semibold">Cancelar</button>
        </div>
      );
    }

    return (
      <div className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-blue-800">Confirme o resultado</p>
          <p className="text-xs text-blue-600 mt-0.5">
            {nameFor(result.submitted_by)} registrou o placar <strong>{setsLabel(result.sets)}</strong>. Está certo?
          </p>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            disabled={submitting}
            onClick={() => setCorrecting(true)}
            className="flex-1 bg-white border-2 border-gray-200 text-gray-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Discordo
          </button>
          <button
            disabled={submitting}
            onClick={() => submit(result.sets)}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
          </button>
        </div>
      </div>
    );
  }

  // ── No result yet: let anyone propose one ──
  if (players.length !== 4) return null;

  return (
    <div className="mx-5 mt-4 bg-white border-2 border-gray-900 rounded-2xl px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-gray-900" />
        <p className="text-sm font-bold text-gray-900">Registrar placar</p>
      </div>
      {teamIds ? (
        <p className="text-xs text-gray-500">
          Time A ({teamLabel(teamIds.a)}) × Time B ({teamLabel(teamIds.b)})
        </p>
      ) : (
        <p className="text-xs text-gray-500">Melhor de 3 sets — 18 pontos (15 no 3º), vantagem mínima de 2.</p>
      )}
      <SetScoreForm onSubmit={submit} submitting={submitting} error={error} />
    </div>
  );
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
}
