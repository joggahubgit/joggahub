/**
 * submit-game-result
 *
 * Dupla-a-dupla result confirmation + ELO-style rating update for futevôlei
 * (2v2 closed games — exactly 4 players per game, pre-assigned to Time A /
 * Time B at join time via game_players.team).
 *
 * Players submit actual SET SCORES (best of 3, sets 1–2 to 18, set 3 to 15,
 * win by 2 — see src/app/lib/futevoleiSetRules.ts, mirrored below since
 * Deno can't import the Vite-aliased frontend module). The outcome
 * (confirmed winner / draw / invalid) is always derived server-side from
 * the scores — the client never says who won directly.
 *
 * Flow:
 *   1. First call for a gameId: proposer submits sets → row created,
 *      status 'pending', outcome computed but not yet applied.
 *   2. Second call: only counts as a real confirmation if the caller is on
 *      the opposite team from the original submitter, AND submits the
 *      exact same set scores.
 *      - Matches, outcome = confirmed → ratings updated for all 4 players.
 *      - Matches, outcome = draw/invalid → status set accordingly, no
 *        rating change, no matches_played increment.
 *      - Scores don't match → status 'disputed', left for manual resolution.
 *
 * Body: { gameId, sets: [{ a, b }, ...] }  (1–3 sets, a = Time A's score, b = Time B's)
 * playerId (the caller) always comes from the verified JWT, never the body.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATING_SCALE = 1.2; // divisor — a 1.2-point gap ≈ 91% expected win chance for the favorite
const RATING_MIN = 1.0;
const RATING_MAX = 7.0;
const RATING_DEFAULT = 3.0;
const SPORT = 'futevolei';

// ── Set-score validation (mirrors src/app/lib/futevoleiSetRules.ts) ──
interface SetScore { a: number; b: number }

function setTarget(setIndex: number): number {
  return setIndex < 2 ? 18 : 15;
}

function isValidSetScore(a: number, b: number, target: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
  const winner = Math.max(a, b);
  const diff = Math.abs(a - b);
  if (diff < 2) return false;
  if (winner === target) return true;
  if (winner > target) return diff === 2;
  return false;
}

type MatchOutcome =
  | { status: 'invalid' }
  | { status: 'draw' }
  | { status: 'confirmed'; winningTeam: 'a' | 'b' };

function deriveOutcome(sets: SetScore[]): MatchOutcome {
  if (!Array.isArray(sets) || sets.length < 1 || sets.length > 3) return { status: 'invalid' };

  let setsA = 0;
  let setsB = 0;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    if (!s || typeof s.a !== 'number' || typeof s.b !== 'number') return { status: 'invalid' };
    if (!isValidSetScore(s.a, s.b, setTarget(i))) return { status: 'invalid' };
    if (s.a > s.b) setsA++; else setsB++;
  }

  if (sets.length === 1) {
    return { status: 'confirmed', winningTeam: setsA > setsB ? 'a' : 'b' };
  }
  if (setsA >= 2) return { status: 'confirmed', winningTeam: 'a' };
  if (setsB >= 2) return { status: 'confirmed', winningTeam: 'b' };
  return { status: 'draw' };
}

function sameSets(a: SetScore[], b: SetScore[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.a === b[i].a && s.b === b[i].b);
}

function clampRating(r: number): number {
  return Math.min(RATING_MAX, Math.max(RATING_MIN, r));
}

function kFactorFor(matchesPlayed: number): number {
  if (matchesPlayed < 5) return 0.8;
  if (matchesPlayed < 15) return 0.5;
  return 0.25;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── JWT verification ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const callerId = user.id;

    const { gameId, sets } = await req.json();
    if (!gameId || !Array.isArray(sets)) {
      throw new Error('gameId e sets são obrigatórios');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Validate game + caller + team assignments ──
    const { data: game } = await supabase
      .from('games').select('id, sport_type').eq('id', gameId).single();
    if (!game) throw new Error('Partida não encontrada');
    if (game.sport_type !== SPORT) {
      throw new Error('Registro de resultado disponível apenas para futevôlei por enquanto');
    }

    const { data: players } = await supabase
      .from('game_players').select('player_id, team').eq('game_id', gameId);
    const playerIds = (players ?? []).map(p => p.player_id);
    if (playerIds.length !== 4) {
      throw new Error('Essa partida não tem exatamente 4 jogadores');
    }
    if (!playerIds.includes(callerId)) {
      throw new Error('Você não participa dessa partida');
    }

    const teamIds: { a: string[]; b: string[] } = { a: [], b: [] };
    for (const p of players ?? []) {
      if (p.team === 'a') teamIds.a.push(p.player_id);
      if (p.team === 'b') teamIds.b.push(p.player_id);
    }
    if (teamIds.a.length !== 2 || teamIds.b.length !== 2) {
      throw new Error('Os times dessa partida ainda não foram definidos');
    }
    const callerTeam: 'a' | 'b' = teamIds.a.includes(callerId) ? 'a' : 'b';

    // ── Existing result row? ──
    const { data: existing } = await supabase
      .from('game_results').select('*').eq('game_id', gameId).maybeSingle();

    if (!existing) {
      // First submission — just propose, wait for the other side.
      const { error: insertErr } = await supabase.from('game_results').insert({
        game_id: gameId,
        sets,
        submitted_by: callerId,
        status: 'pending',
      });
      if (insertErr) throw new Error(insertErr.message);

      const others = playerIds.filter(id => id !== callerId);
      await supabase.from('notifications').insert(
        others.map(id => ({
          user_id: id,
          type: 'result_pending_confirmation',
          title: 'Confirme o resultado da partida',
          message: 'Um jogador registrou o placar da sua partida de futevôlei. Confirme se está certo.',
          game_id: gameId,
        })),
      );

      const outcome = deriveOutcome(sets);
      return new Response(JSON.stringify({ status: 'pending', outcome, message: 'Resultado registrado. Aguardando confirmação do time adversário.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (existing.status !== 'pending') {
      throw new Error('O resultado dessa partida já foi processado.');
    }
    if (existing.submitted_by === callerId) {
      throw new Error('Você já registrou esse resultado. Aguarde a confirmação do time adversário.');
    }
    const submitterTeam: 'a' | 'b' = teamIds.a.includes(existing.submitted_by) ? 'a' : 'b';
    if (callerTeam === submitterTeam) {
      // Same side as the original proposer — not valid adversarial confirmation.
      return new Response(JSON.stringify({ status: 'pending', message: 'Aguardando confirmação de alguém do time adversário.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Caller is on the opposite team — real confirmation attempt.
    if (!sameSets(sets, existing.sets)) {
      await supabase.from('game_results').update({ status: 'disputed' }).eq('id', existing.id);
      return new Response(JSON.stringify({ status: 'disputed', message: 'Os placares relatados não batem. Entre em contato com o suporte.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const outcome = deriveOutcome(existing.sets);

    if (outcome.status !== 'confirmed') {
      // draw or invalid — no rating change
      await supabase.from('game_results').update({
        status: outcome.status,
        confirmed_by: callerId,
        confirmed_at: new Date().toISOString(),
      }).eq('id', existing.id).eq('status', 'pending');

      return new Response(JSON.stringify({ status: outcome.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Confirmed with a real winner — compute ELO and update ratings ──
    const winnerIds = teamIds[outcome.winningTeam];
    const loserIds = teamIds[outcome.winningTeam === 'a' ? 'b' : 'a'];

    const { data: ratingRows } = await supabase
      .from('player_ratings').select('player_id, rating, matches_played')
      .eq('sport_type', SPORT).in('player_id', playerIds);

    const ratingMap: Record<string, { rating: number; matches_played: number }> = {};
    for (const id of playerIds) ratingMap[id] = { rating: RATING_DEFAULT, matches_played: 0 };
    for (const r of ratingRows ?? []) ratingMap[r.player_id] = { rating: r.rating, matches_played: r.matches_played };

    const winnerAvg = (ratingMap[winnerIds[0]].rating + ratingMap[winnerIds[1]].rating) / 2;
    const loserAvg = (ratingMap[loserIds[0]].rating + ratingMap[loserIds[1]].rating) / 2;
    const expectedWinnerWin = 1 / (1 + 10 ** (-(winnerAvg - loserAvg) / RATING_SCALE));
    const movement = 1 - expectedWinnerWin;

    const newRatings: Record<string, number> = {};
    for (const id of winnerIds) newRatings[id] = clampRating(ratingMap[id].rating + kFactorFor(ratingMap[id].matches_played) * movement);
    for (const id of loserIds) newRatings[id] = clampRating(ratingMap[id].rating - kFactorFor(ratingMap[id].matches_played) * movement);

    for (const id of playerIds) {
      await supabase.from('player_ratings').upsert({
        player_id: id,
        sport_type: SPORT,
        rating: newRatings[id],
        matches_played: ratingMap[id].matches_played + 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'player_id,sport_type' });

      await supabase.from('player_rating_history').insert({
        player_id: id,
        sport_type: SPORT,
        game_id: gameId,
        rating: newRatings[id],
        matches_played: ratingMap[id].matches_played + 1,
      });
    }

    await supabase.from('game_results').update({
      status: 'confirmed',
      winner_ids: winnerIds,
      loser_ids: loserIds,
      confirmed_by: callerId,
      confirmed_at: new Date().toISOString(),
    }).eq('id', existing.id).eq('status', 'pending');

    await supabase.from('notifications').insert(
      playerIds.map(id => ({
        user_id: id,
        type: 'rating_updated',
        title: winnerIds.includes(id) ? 'Vitória confirmada!' : 'Resultado confirmado',
        message: `Seu rating de futevôlei mudou de ${ratingMap[id].rating.toFixed(2)} para ${newRatings[id].toFixed(2)}.`,
        game_id: gameId,
      })),
    );

    return new Response(JSON.stringify({
      status: 'confirmed',
      ratings: playerIds.map(id => ({ playerId: id, before: ratingMap[id].rating, after: newRatings[id] })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
