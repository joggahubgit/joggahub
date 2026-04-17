/**
 * process-game-transitions
 *
 * Cron-triggered Edge Function that handles automatic game status transitions:
 *
 * -1. scheduled → expired (auto-cancel — insufficient players before start)
 *    Rules based on fill_rate = current_players / min_players:
 *      fill_rate ≤ 20%  → cancel 6h before start
 *      fill_rate ≤ 40%  → cancel 4h before start
 *      fill_rate > 50% but < 100% → cancel 2h before start
 *    Effect: status = 'expired', is_open = false, slot freed, players notified
 *
 * 0. scheduled → confirmed_booking OR expired (retroactive, after slot ends)
 *
 * 1. confirmed_booking → pending_results
 *    When: slot.end_time + 5 minutes <= now()
 *    Effect: status update + notify all players
 *
 * 2. pending_results → completed (without XP)
 *    When: slot.end_time + 12 hours <= now() AND xp_distributed = false
 *    Effect: status = 'completed', xp_distributed remains false
 *
 * Idempotence: All queries use the current status as a filter guard,
 * so re-running the job never double-processes the same game.
 *
 * Setup (Supabase pg_cron — requires Supabase Pro or manual scheduling):
 *   SELECT cron.schedule(
 *     'process-game-transitions',
 *     '* * * * *',  -- every minute
 *     $$SELECT net.http_post(
 *       url := '<YOUR_SUPABASE_URL>/functions/v1/process-game-transitions',
 *       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
 *     )$$
 *   );
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PENDING_RESULTS_DELAY_MINUTES = 5;
const RESULT_WINDOW_HOURS = 12;
const XP_PARTICIPATION = 15;
const XP_MVP_BONUS = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const results = {
    autoCancelled: [] as string[],
    retroactivelyConfirmed: [] as string[],
    retroactivelyExpired: [] as string[],
    transitionedToPendingResults: [] as string[],
    transitionedToCompleted: [] as string[],
    errors: [] as string[],
  };

  // Helper: resolve min players for a sport type
  function resolveMinPlayers(sportType: string | null): number {
    if (sportType === 'futsal') return 2; // FUTSAL_TEMP_MIN_PLAYERS
    return 8; // DEFAULT_MIN_PLAYERS
  }

  // Helper: format fill rate as readable percentage
  function fillLabel(current: number, min: number): string {
    return `${Math.round((current / min) * 100)}%`;
  }

  // ─────────────────────────────────────────────────────────────────────
  // -1. AUTO-CANCEL: scheduled open games with insufficient players
  //
  //   fill_rate = current_players / min_players_for_sport
  //
  //   fill_rate ≤ 20%          → cancel when ≤ 6h before start
  //   fill_rate ≤ 40%          → cancel when ≤ 4h before start
  //   fill_rate > 40% but < 1  → cancel when ≤ 2h before start
  //   fill_rate ≥ 1            → already confirmed_booking, skip
  // ─────────────────────────────────────────────────────────────────────
  {
    const { data: openScheduled, error: openErr } = await supabase
      .from('games')
      .select('id, slot_id, court_id, current_players, organizer_id')
      .eq('status', 'scheduled')
      .eq('is_open', true)
      .not('slot_id', 'is', null);

    if (openErr) {
      results.errors.push(`auto-cancel fetch: ${openErr.message}`);
    } else {
      for (const game of openScheduled ?? []) {
        // Fetch slot start time
        const { data: slot } = await supabase
          .from('slots')
          .select('start_time')
          .eq('id', game.slot_id)
          .single();

        if (!slot?.start_time) continue;

        const now = Date.now();
        const startMs = new Date(slot.start_time).getTime();
        const hoursUntilStart = (startMs - now) / (1000 * 60 * 60);

        // Skip games that haven't reached a cancel window yet or already started
        if (hoursUntilStart > 6 || hoursUntilStart < 0) continue;

        // Resolve min players using court sport_type
        let sportType: string | null = null;
        if (game.court_id) {
          const { data: court } = await supabase
            .from('courts')
            .select('sport_type')
            .eq('id', game.court_id)
            .single();
          sportType = court?.sport_type ?? null;
        }
        const minPlayers = resolveMinPlayers(sportType);
        const currentPlayers = game.current_players ?? 0;
        const fillRate = currentPlayers / minPlayers;

        // Already has minimum players — skip (should have been confirmed_booking already)
        if (fillRate >= 1.0) continue;

        // Determine whether this game should be cancelled now
        const shouldCancel =
          (fillRate <= 0.20 && hoursUntilStart <= 6) ||
          (fillRate <= 0.40 && hoursUntilStart <= 4) ||
          (fillRate > 0.40 && fillRate < 1.0 && hoursUntilStart <= 2);

        if (!shouldCancel) continue;

        // Build cancellation reason for notifications
        const pct = fillLabel(currentPlayers, minPlayers);
        let reason: string;
        if (fillRate <= 0.20) {
          reason = `A partida foi cancelada automaticamente: apenas ${pct} das vagas mínimas foram preenchidas (${currentPlayers}/${minPlayers} jogadores) e faltam menos de 6h para o início.`;
        } else if (fillRate <= 0.40) {
          reason = `A partida foi cancelada automaticamente: apenas ${pct} das vagas mínimas foram preenchidas (${currentPlayers}/${minPlayers} jogadores) e faltam menos de 4h para o início.`;
        } else {
          reason = `A partida foi cancelada automaticamente: ${pct} das vagas mínimas foram preenchidas (${currentPlayers}/${minPlayers} jogadores) e faltam menos de 2h para o início.`;
        }

        // Mark game as expired + close it
        const { error: cancelErr } = await supabase
          .from('games')
          .update({ status: 'expired', is_open: false })
          .eq('id', game.id)
          .eq('status', 'scheduled'); // idempotent guard

        if (cancelErr) {
          results.errors.push(`auto-cancel update game ${game.id}: ${cancelErr.message}`);
          continue;
        }

        // Free up the slot so others can book it
        await supabase
          .from('slots')
          .update({ is_available: true })
          .eq('id', game.slot_id);

        // Notify all enrolled players
        const { data: gamePlayers } = await supabase
          .from('game_players')
          .select('player_id')
          .eq('game_id', game.id);

        const playerIds = (gamePlayers ?? []).map(p => p.player_id);

        if (playerIds.length > 0) {
          await supabase.from('notifications').insert(
            playerIds.map(playerId => ({
              user_id: playerId,
              type: 'game_cancelled',
              title: 'Partida cancelada',
              message: reason,
              game_id: game.id,
            })),
          );
        }

        // Also notify the organizer separately with a more specific message
        if (game.organizer_id && !playerIds.includes(game.organizer_id)) {
          await supabase.from('notifications').insert({
            user_id: game.organizer_id,
            type: 'game_cancelled',
            title: 'Sua partida foi cancelada',
            message: reason,
            game_id: game.id,
          });
        }

        results.autoCancelled.push(game.id);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 0. scheduled → confirmed_booking OR expired
  //    Handles games the client never retroactively confirmed:
  //    any `scheduled` game whose slot has already ended.
  // ─────────────────────────────────────────────────────────────────────
  const { data: scheduledGames, error: scheduledErr } = await supabase
    .from('games')
    .select('id, slot_id, court_id, current_players')
    .eq('status', 'scheduled')
    .not('slot_id', 'is', null);

  if (scheduledErr) {
    results.errors.push(`fetch scheduled games: ${scheduledErr.message}`);
  } else {
    for (const game of scheduledGames ?? []) {
      const { data: slot } = await supabase
        .from('slots')
        .select('end_time')
        .eq('id', game.slot_id)
        .single();

      if (!slot?.end_time) continue;
      if (new Date() < new Date(slot.end_time)) continue; // slot hasn't ended yet

      // Determine minimum players using court.sport_type (authoritative)
      let minPlayers = 8; // DEFAULT_MIN_PLAYERS
      if (game.court_id) {
        const { data: court } = await supabase
          .from('courts')
          .select('sport_type')
          .eq('id', game.court_id)
          .single();
        if (court?.sport_type === 'futsal') minPlayers = 2; // FUTSAL_TEMP_MIN_PLAYERS
      }

      const hasEnoughPlayers = (game.current_players ?? 0) >= minPlayers;
      const newStatus = hasEnoughPlayers ? 'confirmed_booking' : 'expired';

      const { error: upErr } = await supabase
        .from('games')
        .update({ status: newStatus })
        .eq('id', game.id)
        .eq('status', 'scheduled'); // idempotent guard

      if (upErr) {
        results.errors.push(`retroactive ${newStatus} for game ${game.id}: ${upErr.message}`);
      } else if (newStatus === 'confirmed_booking') {
        results.retroactivelyConfirmed.push(game.id);
      } else {
        // Free the slot so it can be re-booked
        await supabase.from('slots').update({ is_available: true }).eq('id', game.slot_id);
        results.retroactivelyExpired.push(game.id);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 1. confirmed_booking → pending_results
  //    Condition: slot.end_time + N minutes <= now()
  // ─────────────────────────────────────────────────────────────────────
  const { data: pendingGames, error: pendingErr } = await supabase
    .from('games')
    .select('id, slot_id, sport_type')
    .eq('status', 'confirmed_booking')
    .not('slot_id', 'is', null);

  if (pendingErr) {
    results.errors.push(`fetch confirmed_booking games: ${pendingErr.message}`);
  } else {
    for (const game of pendingGames ?? []) {
      const { data: slot, error: slotErr } = await supabase
        .from('slots')
        .select('end_time')
        .eq('id', game.slot_id)
        .single();

      if (slotErr || !slot?.end_time) {
        results.errors.push(`fetch slot for game ${game.id}: ${slotErr?.message ?? 'no end_time'}`);
        continue;
      }

      const endTime = new Date(slot.end_time);
      const threshold = new Date(endTime.getTime() + PENDING_RESULTS_DELAY_MINUTES * 60 * 1000);

      if (new Date() < threshold) continue; // not yet

      // Transition status
      const { error: updateErr } = await supabase
        .from('games')
        .update({ status: 'pending_results' })
        .eq('id', game.id)
        .eq('status', 'confirmed_booking'); // guard against race condition

      if (updateErr) {
        results.errors.push(`update to pending_results game ${game.id}: ${updateErr.message}`);
        continue;
      }

      // Notify all players (idempotent via game status guard above)
      const { data: players } = await supabase
        .from('game_players')
        .select('player_id')
        .eq('game_id', game.id);

      if (players?.length) {
        await supabase.from('notifications').insert(
          players.map(p => ({
            user_id: p.player_id,
            type: 'pending_results',
            title: 'Partida encerrada — vote no MVP!',
            message: 'Sua partida acabou. Vote no melhor jogador e registre os dados. Você tem 12h.',
            game_id: game.id,
          })),
        );
      }

      results.transitionedToPendingResults.push(game.id);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. pending_results → completed (without XP — result window expired)
  //    Condition: slot.end_time + 12h <= now() AND xp_distributed = false
  // ─────────────────────────────────────────────────────────────────────
  const { data: expiredGames, error: expiredErr } = await supabase
    .from('games')
    .select('id, slot_id')
    .eq('status', 'pending_results')
    .eq('xp_distributed', false)
    .not('slot_id', 'is', null);

  if (expiredErr) {
    results.errors.push(`fetch pending_results games: ${expiredErr.message}`);
  } else {
    for (const game of expiredGames ?? []) {
      const { data: slot, error: slotErr } = await supabase
        .from('slots')
        .select('end_time')
        .eq('id', game.slot_id)
        .single();

      if (slotErr || !slot?.end_time) {
        results.errors.push(`fetch slot for game ${game.id}: ${slotErr?.message ?? 'no end_time'}`);
        continue;
      }

      const endTime = new Date(slot.end_time);
      const windowExpiry = new Date(endTime.getTime() + RESULT_WINDOW_HOURS * 60 * 60 * 1000);

      if (new Date() < windowExpiry) continue; // window still open

      const { error: updateErr } = await supabase
        .from('games')
        .update({ status: 'completed', xp_distributed: false })
        .eq('id', game.id)
        .eq('status', 'pending_results') // guard against race condition
        .eq('xp_distributed', false);

      if (updateErr) {
        results.errors.push(`update to completed (no xp) game ${game.id}: ${updateErr.message}`);
        continue;
      }

      results.transitionedToCompleted.push(game.id);
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

/**
 * distribute-game-xp (helper — called from MVP submission UI, not cron)
 *
 * This is not a separate endpoint but documents the expected XP logic
 * for when the organizer submits the MVP result:
 *
 *   1. Update game: status = 'completed', xp_distributed = true
 *   2. For each game_player: supabase.rpc('increment_xp', { user_id, amount: XP_PARTICIPATION })
 *   3. For MVP:              supabase.rpc('increment_xp', { user_id: mvpId, amount: XP_MVP_BONUS })
 *   4. Increment games_played on all profiles
 *
 * XP_PARTICIPATION = 15, XP_MVP_BONUS = 30
 */
