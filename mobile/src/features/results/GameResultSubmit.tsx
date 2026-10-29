// Port of src/app/components/GameResultSubmit.tsx (web): futevôlei score entry,
// confirm/dispute by the opposing team, and the confirmed result with rating deltas.
// Validation runs again server-side in submit-game-result.
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Trophy, XCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { deriveOutcome, isValidSetScore, setTarget, type SetScore } from '@/lib/shared';
import palette from '../../../tailwind.palette';

export interface RosterPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface GameResultRow {
  id: string;
  sets: SetScore[];
  winner_ids: string[] | null;
  submitted_by: string;
  status: 'pending' | 'confirmed' | 'disputed' | 'invalid' | 'draw';
}

type Delta = { playerId: string; before: number; after: number };

function Avatar({ person, size = 44, text = 'text-sm' }: { person: RosterPerson; size?: number; text?: string }) {
  const box = { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#ffffff' };
  return person.avatarUrl ? (
    <Image source={{ uri: person.avatarUrl }} style={box} contentFit="cover" />
  ) : (
    <View className="bg-violet-600 items-center justify-center" style={box}>
      <Text className={`text-white font-bold ${text}`}>{person.name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
const setsLabel = (sets: SetScore[]) => sets.map(s => `${s.a}-${s.b}`).join(', ');

async function fetchResultData(gameId: string, playerIds: string[]) {
  const [{ data: result }, { data: roster }] = await Promise.all([
    supabase.from('game_results').select('id, sets, winner_ids, submitted_by, status').eq('game_id', gameId).maybeSingle(),
    supabase.from('game_players').select('player_id, team').eq('game_id', gameId),
  ]);
  const a = (roster ?? []).filter(r => r.team === 'a').map(r => r.player_id);
  const b = (roster ?? []).filter(r => r.team === 'b').map(r => r.player_id);
  const teamIds = a.length === 2 && b.length === 2 ? { a, b } : null;

  // Rating before→after for this game, from each player's full history (works after reloads too).
  let deltas: Delta[] = [];
  if ((result as GameResultRow | null)?.status === 'confirmed' && playerIds.length) {
    const { data: hist } = await supabase
      .from('player_rating_history')
      .select('player_id, rating, game_id, created_at')
      .eq('sport_type', 'futevolei')
      .in('player_id', playerIds)
      .order('created_at', { ascending: true });
    const byPlayer: Record<string, { rating: number; game_id: string | null }[]> = {};
    for (const r of hist ?? []) (byPlayer[r.player_id] ??= []).push(r);
    deltas = playerIds.flatMap(id => {
      const rows = byPlayer[id] ?? [];
      const idx = rows.findIndex(r => r.game_id === gameId);
      if (idx === -1) return [];
      return [{ playerId: id, before: idx > 0 ? rows[idx - 1].rating : 1.5, after: rows[idx].rating }]; // 1.5 = RATING_DEFAULT
    });
  }
  return { result: (result as GameResultRow | null) ?? null, teamIds, deltas };
}

function ScoreBoard({ sets, teamIds, personFor, myId }: { sets: SetScore[]; teamIds: { a: string[]; b: string[] }; personFor: (id: string) => RosterPerson; myId: string | null }) {
  const outcome = deriveOutcome(sets);
  const winner = outcome.status === 'confirmed' ? outcome.winningTeam : null;
  const setsA = sets.filter(s => s.a > s.b).length;
  const setsB = sets.filter(s => s.b > s.a).length;
  const myTeam = myId ? (teamIds.a.includes(myId) ? 'a' : teamIds.b.includes(myId) ? 'b' : null) : null;
  const header = (team: 'a' | 'b') => (
    <View className={`flex-1 items-center gap-1.5 rounded-xl px-2 py-3 ${winner === team ? 'bg-amber-50' : ''}`}>
      <View className="flex-row">
        {teamIds[team].map((id, i) => (
          <View key={id} style={{ marginLeft: i ? -8 : 0 }}>
            <Avatar person={personFor(id)} size={40} text="text-xs" />
          </View>
        ))}
      </View>
      <Text className="text-xs font-semibold text-gray-800 text-center">{teamIds[team].map(id => personFor(id).name.split(' ')[0]).join(' & ')}</Text>
      <View className="items-center gap-0.5" style={{ minHeight: 30 }}>
        {winner === team && (
          <View className="flex-row items-center gap-0.5">
            <Trophy size={12} color={palette.amber['700']} />
            <Text className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Vencedor</Text>
          </View>
        )}
        {myTeam === team && <Text className="text-[10px] font-bold uppercase tracking-wide text-violet-600">Seu time</Text>}
      </View>
    </View>
  );
  const cell = (val: number, strong: boolean, extra = '') => (
    <Text className={`flex-1 text-center text-xl py-2 ${strong ? 'font-black text-gray-900' : 'font-medium text-gray-400'} ${extra}`}>{val}</Text>
  );
  return (
    <View className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <View className="flex-row items-center">
        <View style={{ width: 56 }} />
        {header('a')}
        {header('b')}
      </View>
      {sets.map((s, i) => (
        <View key={i} className="flex-row items-center border-t border-gray-100">
          <Text className="text-[11px] font-semibold text-gray-400 uppercase pl-3 py-2" style={{ width: 56 }}>
            Set {i + 1}
          </Text>
          {cell(s.a, s.a > s.b)}
          {cell(s.b, s.b > s.a)}
        </View>
      ))}
      <View className="flex-row items-center bg-gray-50 border-t border-gray-200">
        <Text className="text-[11px] font-bold text-gray-500 uppercase pl-3 py-2.5" style={{ width: 56 }}>
          Sets
        </Text>
        <Text className={`flex-1 text-center text-2xl font-black py-2.5 ${winner === 'a' ? 'text-amber-600' : 'text-gray-400'}`}>{setsA}</Text>
        <Text className={`flex-1 text-center text-2xl font-black py-2.5 ${winner === 'b' ? 'text-amber-600' : 'text-gray-400'}`}>{setsB}</Text>
      </View>
    </View>
  );
}

const emptySet = (): SetScore => ({ a: NaN, b: NaN });
const isEmptySet = (s: SetScore) => Number.isNaN(s.a) && Number.isNaN(s.b);

function SetScoreForm({ onSubmit, submitting, error }: { onSubmit: (sets: SetScore[]) => void; submitting: boolean; error: string }) {
  const [sets, setSets] = useState<SetScore[]>([emptySet(), emptySet(), emptySet()]);
  const update = (i: number, field: 'a' | 'b', value: string) => {
    const digits = value.replace(/\D/g, '');
    setSets(prev => prev.map((s, si) => (si === i ? { ...s, [field]: digits === '' ? NaN : Number(digits) } : s)));
  };
  const setErrors = sets.map((s, i) => {
    if (isEmptySet(s)) return null;
    if (Number.isNaN(s.a) || Number.isNaN(s.b)) return 'Preencha os dois placares do set';
    return isValidSetScore(s.a, s.b, setTarget(i)) ? null : `Placar impossível — set vai até ${setTarget(i)}, com vantagem mínima de 2`;
  });
  let filled = 0;
  while (filled < sets.length && !isEmptySet(sets[filled])) filled++;
  const hasGap = sets.slice(filled).some(s => !isEmptySet(s));
  const toSubmit = sets.slice(0, filled);
  const canSubmit = filled > 0 && !hasGap && !setErrors.some(Boolean);
  const outcome = canSubmit ? deriveOutcome(toSubmit) : null;
  const input = 'flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm text-center text-gray-900';

  return (
    <View className="gap-3">
      {sets.map((s, i) => (
        <View key={i} className="gap-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-semibold text-gray-500 w-14">Set {i + 1}</Text>
            <TextInput value={Number.isNaN(s.a) ? '' : String(s.a)} onChangeText={v => update(i, 'a', v)} placeholder="Time A" placeholderTextColor={palette.gray['400']} keyboardType="number-pad" maxLength={2} className={input} style={{ fontFamily: 'Inter_400Regular' }} accessibilityLabel={`Set ${i + 1}, time A`} />
            <Text className="text-gray-300">×</Text>
            <TextInput value={Number.isNaN(s.b) ? '' : String(s.b)} onChangeText={v => update(i, 'b', v)} placeholder="Time B" placeholderTextColor={palette.gray['400']} keyboardType="number-pad" maxLength={2} className={input} style={{ fontFamily: 'Inter_400Regular' }} accessibilityLabel={`Set ${i + 1}, time B`} />
          </View>
          {!!setErrors[i] && <Text className="text-[11px] text-red-600 pl-16">{setErrors[i]}</Text>}
        </View>
      ))}
      {hasGap && <Text className="text-xs text-red-600">Não pule um set — preencha em ordem (Set 1, depois Set 2, depois Set 3).</Text>}
      {outcome?.status === 'draw' && (
        <View className="bg-amber-50 rounded-lg px-3 py-2">
          <Text className="text-xs text-amber-600">1 set para cada lado — sem 3º set, vai ser registrado como empate (sem alterar rating).</Text>
        </View>
      )}
      {!!error && <Text className="text-xs text-red-600">{error}</Text>}
      <Pressable
        disabled={!canSubmit || submitting}
        onPress={() => onSubmit(toSubmit)}
        className={`w-full bg-gray-900 py-2.5 rounded-xl items-center justify-center ${!canSubmit || submitting ? 'opacity-40' : ''}`}
      >
        {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : <Text className="text-white font-semibold text-sm">Registrar resultado</Text>}
      </Pressable>
    </View>
  );
}

export function GameResultSubmit({ gameId, players, currentUserId }: { gameId: string; players: RosterPerson[]; currentUserId: string | null }) {
  const qc = useQueryClient();
  const playerIds = players.map(p => p.id);
  const key = ['gameResult', gameId, playerIds.join(',')];
  const q = useQuery({ queryKey: key, queryFn: () => fetchResultData(gameId, playerIds) });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [correcting, setCorrecting] = useState(false);

  const personFor = (id: string) => players.find(p => p.id === id) ?? { id, name: 'Jogador', avatarUrl: null };
  const nameFor = (id: string) => personFor(id).name;
  const teamLabel = (ids: string[]) => ids.map(nameFor).join(' e ');

  async function submit(sets: SetScore[]) {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { error: fnErr } = await supabase.functions.invoke('submit-game-result', { body: { gameId, sets } });
      if (fnErr) {
        const body = await (fnErr as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.().catch(() => null);
        throw new Error(body?.error ?? fnErr.message ?? 'Erro ao registrar resultado');
      }
      setCorrecting(false);
      // Authoritative state from the server (status, winners, rating history).
      await qc.invalidateQueries({ queryKey: ['gameResult', gameId] });
      qc.invalidateQueries({ queryKey: ['game', gameId] });
      qc.invalidateQueries({ queryKey: ['pendingResults'] });
    } catch (e) {
      setError((e as Error).message ?? 'Erro ao registrar resultado');
    } finally {
      setSubmitting(false);
    }
  }

  if (q.isPending) {
    return (
      <View className="mx-5 mt-4 bg-white border border-gray-200 rounded-2xl px-4 py-4 items-center">
        <ActivityIndicator color={palette.gray['400']} />
      </View>
    );
  }
  if (q.isError) return null;
  const { result, teamIds, deltas } = q.data;

  if (result?.status === 'confirmed') {
    const winnerIds = result.winner_ids ?? [];
    const winningTeam = teamIds ? (sameIds(winnerIds, teamIds.a) ? 'a' : sameIds(winnerIds, teamIds.b) ? 'b' : null) : null;
    const deltaFor = (id: string) => deltas.find(d => d.playerId === id) ?? null;
    const column = (ids: string[], isWinner: boolean) => (
      <View className={`flex-1 rounded-xl p-3 ${isWinner ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
        <View className="flex-row mb-2">
          {ids.map((id, i) => (
            <View key={id} style={{ marginLeft: i ? -8 : 0 }}>
              <Avatar person={personFor(id)} />
            </View>
          ))}
        </View>
        <View className="gap-1">
          {ids.map(id => {
            const d = deltaFor(id);
            return (
              <View key={id} className="flex-row items-center justify-between gap-2">
                <Text className="text-xs font-semibold text-gray-900 flex-1" numberOfLines={1}>
                  {nameFor(id)}
                </Text>
                {d && (
                  <Text className={`text-[10px] font-bold ${d.after >= d.before ? 'text-green-600' : 'text-red-500'}`}>
                    {d.after >= d.before ? '+' : ''}
                    {(d.after - d.before).toFixed(2)}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
        {isWinner && <Text className="text-[10px] font-bold text-green-600 mt-1.5 tracking-wide">VENCEDOR</Text>}
      </View>
    );
    return (
      <View className="mx-5 mt-4 bg-white border border-gray-200 rounded-2xl p-4">
        <View className="flex-row items-center gap-2 mb-3">
          <CheckCircle2 size={16} color={palette.green['600']} />
          <Text className="text-xs font-bold text-green-700 uppercase tracking-wide">Resultado confirmado</Text>
        </View>
        {teamIds ? (
          <View className="flex-row items-center gap-3">
            {column(teamIds.a, winningTeam === 'a')}
            <Text className="text-xs font-bold text-gray-400">vs</Text>
            {column(teamIds.b, winningTeam === 'b')}
          </View>
        ) : (
          <Text className="text-sm font-bold text-gray-900">{teamLabel(winnerIds)} venceu</Text>
        )}
        <Text className="text-base font-black text-gray-900 text-center mt-3 tracking-wide">{setsLabel(result.sets)}</Text>
      </View>
    );
  }

  if (result?.status === 'draw') {
    return (
      <View className="mx-5 mt-4 bg-gray-100 border border-gray-300 rounded-2xl px-4 py-3">
        <Text className="text-sm font-bold text-gray-800">Empate ({setsLabel(result.sets)})</Text>
        <Text className="text-xs text-gray-500 mt-0.5">1 set para cada time, sem decisão. Rating não foi alterado.</Text>
      </View>
    );
  }

  if (result?.status === 'invalid') {
    return (
      <View className="mx-5 mt-4 bg-gray-100 border border-gray-300 rounded-2xl px-4 py-3">
        <Text className="text-sm font-bold text-gray-800">Resultado inválido</Text>
        <Text className="text-xs text-gray-500 mt-0.5">O placar registrado ({setsLabel(result.sets)}) não é possível numa partida de futevôlei. Rating não foi alterado.</Text>
      </View>
    );
  }

  if (result?.status === 'disputed') {
    return (
      <View className="mx-5 mt-4 bg-red-50 border border-red-300 rounded-2xl px-4 py-3 flex-row items-center gap-3">
        <XCircle size={20} color={palette.red['500']} />
        <View className="flex-1">
          <Text className="text-sm font-bold text-red-800">Placares não batem</Text>
          <Text className="text-xs text-red-600 mt-0.5">Os times relataram resultados diferentes. Fale com o suporte pra resolver.</Text>
        </View>
      </View>
    );
  }

  if (result?.status === 'pending') {
    const submitterTeam = teamIds && teamIds.b.includes(result.submitted_by) ? 'b' : 'a';
    const sameSide = !!teamIds && (submitterTeam === 'a' ? teamIds.a : teamIds.b).includes(currentUserId ?? '');
    if (result.submitted_by === currentUserId || sameSide) {
      return (
        <View className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-4 gap-3">
          <View>
            <Text className="text-sm font-bold text-blue-800">Resultado registrado</Text>
            <Text className="text-xs text-blue-600 mt-0.5">Aguardando confirmação do time adversário.</Text>
          </View>
          {teamIds ? <ScoreBoard sets={result.sets} teamIds={teamIds} personFor={personFor} myId={currentUserId} /> : <Text className="text-sm font-semibold text-blue-800">{setsLabel(result.sets)}</Text>}
        </View>
      );
    }
    if (correcting) {
      return (
        <View className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-4 gap-3">
          <Text className="text-sm font-bold text-blue-800">Qual foi o placar de verdade?</Text>
          <SetScoreForm onSubmit={submit} submitting={submitting} error={error} />
          <Pressable onPress={() => setCorrecting(false)} className="items-center py-1">
            <Text className="text-xs text-gray-500 font-semibold">Cancelar</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-4 gap-3">
        <View>
          <Text className="text-sm font-bold text-blue-800">Confirme o resultado</Text>
          <Text className="text-xs text-blue-600 mt-0.5">
            {nameFor(result.submitted_by)} registrou {teamIds ? 'este placar' : <Text className="text-xs font-bold text-blue-600">o placar {setsLabel(result.sets)}</Text>}. Está certo?
          </Text>
        </View>
        {teamIds && <ScoreBoard sets={result.sets} teamIds={teamIds} personFor={personFor} myId={currentUserId} />}
        {!!error && <Text className="text-xs text-red-600">{error}</Text>}
        <View className="flex-row gap-2">
          <Pressable disabled={submitting} onPress={() => setCorrecting(true)} className={`flex-1 bg-white border-2 border-gray-200 py-2.5 rounded-xl items-center ${submitting ? 'opacity-60' : ''}`}>
            <Text className="text-gray-700 font-semibold text-sm">Discordo</Text>
          </Pressable>
          <Pressable disabled={submitting} onPress={() => submit(result.sets)} className={`flex-1 bg-blue-600 py-2.5 rounded-xl items-center justify-center ${submitting ? 'opacity-60' : ''}`}>
            {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : <Text className="text-white font-semibold text-sm">Confirmar</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  if (players.length !== 4) return null;
  return (
    <View className="mx-5 mt-4 bg-white border-2 border-gray-900 rounded-2xl px-4 py-4 gap-3">
      <View className="flex-row items-center gap-2">
        <Trophy size={16} color={palette.gray['900']} />
        <Text className="text-sm font-bold text-gray-900">Registrar placar</Text>
      </View>
      <Text className="text-xs text-gray-500">
        {teamIds ? `Time A (${teamLabel(teamIds.a)}) × Time B (${teamLabel(teamIds.b)})` : 'Melhor de 3 sets — 18 pontos (15 no 3º), vantagem mínima de 2.'}
      </Text>
      <SetScoreForm onSubmit={submit} submitting={submitting} error={error} />
    </View>
  );
}
