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
const PLATFORM_FEE_PERCENT = 0.08;
const PLATFORM_FEE_FIXED = 2.50;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const results = {
    expiredPendingPayments: [] as string[],
    autoCancelled: [] as string[],
    openGameCaptured: [] as string[],
    retroactivelyConfirmed: [] as string[],
    retroactivelyExpired: [] as string[],
    transitionedToPendingResults: [] as string[],
    transitionedToCompleted: [] as string[],
    errors: [] as string[],
  };

  // Helper: resolve min players for a sport type
  function resolveMinPlayers(_sportType: string | null): number {
    return 10;
  }

  // Helper: format fill rate as readable percentage
  function fillLabel(current: number, min: number): string {
    return `${Math.round((current / min) * 100)}%`;
  }

  // ─────────────────────────────────────────────────────────────────────
  // -2. PENDING PAYMENT EXPIRY: gestor-created private bookings unpaid > 2h
  //     Cancels the game + booking and frees the slot.
  // ─────────────────────────────────────────────────────────────────────
  {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Private games linked to a booking, still active, created > 2h ago
    const { data: unpaidGames, error: unpaidErr } = await supabase
      .from('games')
      .select('id, slot_id, booking_id, organizer_id')
      .eq('is_open', false)
      .in('status', ['confirmed_booking', 'scheduled'])
      .not('booking_id', 'is', null)
      .lt('created_at', twoHoursAgo);

    if (unpaidErr) {
      results.errors.push(`pending-payment fetch: ${unpaidErr.message}`);
    } else {
      for (const game of unpaidGames ?? []) {
        // Skip if organizer already paid
        const { data: orgEntry } = await supabase
          .from('game_players')
          .select('paid')
          .eq('game_id', game.id)
          .eq('player_id', game.organizer_id)
          .maybeSingle();

        if (orgEntry?.paid === true) continue;

        // Cancel game
        const { error: gameErr } = await supabase
          .from('games')
          .update({ status: 'cancelled' })
          .eq('id', game.id)
          .in('status', ['confirmed_booking', 'scheduled']); // idempotent guard

        if (gameErr) {
          results.errors.push(`expire-payment cancel game ${game.id}: ${gameErr.message}`);
          continue;
        }

        // Cancel booking
        if (game.booking_id) {
          await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', game.booking_id);
        }

        // Free slot
        if (game.slot_id) {
          await supabase.from('slots').update({ is_available: true }).eq('id', game.slot_id);
        }

        // Notify player
        if (game.organizer_id) {
          await supabase.from('notifications').insert({
            user_id: game.organizer_id,
            type: 'game_cancelled',
            title: 'Reserva expirada',
            message: 'Sua reserva foi cancelada pois o pagamento não foi realizado dentro de 2 horas. Entre em contato com o clube para reagendar.',
            game_id: game.id,
          });
        }

        results.expiredPendingPayments.push(game.id);
      }
    }
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
      .select('id, slot_id, court_id, current_players, organizer_id, stripe_session_id')
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

        // Release Stripe holds for all players who authorized one
        const stripeKeyCancelAuto = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
        const { data: gamePlayers } = await supabase
          .from('game_players')
          .select('player_id, stripe_payment_intent_id')
          .eq('game_id', game.id);

        for (const gp of gamePlayers ?? []) {
          if (gp.stripe_payment_intent_id) {
            await fetch(`https://api.stripe.com/v1/payment_intents/${gp.stripe_payment_intent_id}/cancel`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${stripeKeyCancelAuto}` },
            });
          }
        }

        // Cancel organizer's hold via session (gameId was '' at checkout time)
        if (game.stripe_session_id) {
          const orgSessRes = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${game.stripe_session_id}`,
            { headers: { Authorization: `Bearer ${stripeKeyCancelAuto}` } },
          );
          const orgSessData = await orgSessRes.json();
          const orgPI = orgSessData?.payment_intent;
          if (orgPI) {
            await fetch(`https://api.stripe.com/v1/payment_intents/${orgPI}/cancel`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${stripeKeyCancelAuto}` },
            });
          }
        }

        const playerIds = (gamePlayers ?? []).map((p: { player_id: string }) => p.player_id);

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
  // O. OPEN GAME CAPTURE: 2h before game start
  //
  //    For confirmed open games (is_open=true, stripe_split_captured=false):
  //    - Hold per player was court_price / 10 * 1.15
  //    - Capture court_price / N * 1.15 from each player's PI (less if N > 10)
  //    Games with N < 10 were already auto-cancelled by block -1.
  // ─────────────────────────────────────────────────────────────────────
  {
    const stripeKeyOpen = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

    const { data: openConfirmed, error: openConfirmedErr } = await supabase
      .from('games')
      .select('id, current_players, court_price, price_per_player, slot_id, stripe_session_id, organizer_id')
      .eq('is_open', true)
      .eq('status', 'confirmed_booking')
      .eq('stripe_split_captured', false)
      .not('slot_id', 'is', null);

    if (openConfirmedErr) {
      results.errors.push(`open-capture fetch: ${openConfirmedErr.message}`);
    } else {
      for (const game of openConfirmed ?? []) {
        const { data: slot } = await supabase
          .from('slots')
          .select('start_time')
          .eq('id', game.slot_id)
          .single();

        if (!slot?.start_time) continue;

        // Trigger at 2h before start
        const cutoffMs = new Date(slot.start_time).getTime() - 2 * 60 * 60 * 1000;
        if (Date.now() < cutoffMs) continue;

        const N = game.current_players ?? 1;
        const courtPriceOpen: number = game.court_price ?? (game.price_per_player ?? 0) * 18;
        if (courtPriceOpen <= 0) {
          await supabase.from('games').update({ stripe_split_captured: true }).eq('id', game.id);
          continue;
        }

        const capturePerPlayer = (courtPriceOpen / N) * (1 + PLATFORM_FEE_PERCENT) + PLATFORM_FEE_FIXED;

        const { data: players } = await supabase
          .from('game_players')
          .select('player_id, stripe_payment_intent_id')
          .eq('game_id', game.id)
          .not('stripe_payment_intent_id', 'is', null);

        let captureErrors = 0;

        // Capture each joiner's hold (organizer excluded — they have no PI in game_players)
        for (const p of players ?? []) {
          const res = await fetch(
            `https://api.stripe.com/v1/payment_intents/${p.stripe_payment_intent_id}/capture`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${stripeKeyOpen}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: `amount_to_capture=${Math.round(capturePerPlayer * 100)}`,
            },
          );
          const data = await res.json();
          if (data.error) {
            results.errors.push(`open-capture player ${p.player_id} game ${game.id}: ${data.error.message}`);
            captureErrors++;
          }
        }

        // Capture organizer's hold via their checkout session
        if (game.stripe_session_id && game.organizer_id) {
          const orgSessRes = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${game.stripe_session_id}`,
            { headers: { Authorization: `Bearer ${stripeKeyOpen}` } },
          );
          const orgSessData = await orgSessRes.json();
          const orgPI = orgSessData?.payment_intent;

          if (orgPI) {
            const orgCaptureRes = await fetch(
              `https://api.stripe.com/v1/payment_intents/${orgPI}/capture`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${stripeKeyOpen}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `amount_to_capture=${Math.round(capturePerPlayer * 100)}`,
              },
            );
            const orgCaptureData = await orgCaptureRes.json();
            if (orgCaptureData.error) {
              results.errors.push(`open-capture organizer game ${game.id}: ${orgCaptureData.error.message}`);
              captureErrors++;
            }
          }
        }

        if (captureErrors === 0) {
          await supabase.from('games').update({ stripe_split_captured: true }).eq('id', game.id);
          results.openGameCaptured.push(game.id);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // S. SPLIT PAYMENT CAPTURE: 12h before game start (cancel cutoff)
  //
  //    For each split private game where cutoff has been reached:
  //    - Each joiner: capture court_price / max(N,10) * 1.15
  //    - Organizer:   capture the remainder so total = court_price * 1.15
  //      → if N >= 10: court_price / N * 1.15
  //      → if N <  10: court_price * 1.15 * (11 - N) / 10  (covers shortfall)
  //
  //    Joiner PIs stored in game_players.stripe_payment_intent_id.
  //    Organizer PI resolved from games.stripe_session_id via Stripe API.
  // ─────────────────────────────────────────────────────────────────────
  {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

    const { data: splitGames, error: splitErr } = await supabase
      .from('games')
      .select('id, max_players, current_players, court_price, price_per_player, stripe_session_id, slot_id, organizer_id')
      .eq('is_open', false)
      .eq('pay_mode', 'split')
      .eq('stripe_split_captured', false)
      .not('stripe_session_id', 'is', null)
      .in('status', ['confirmed_booking', 'scheduled']);

    if (splitErr) {
      results.errors.push(`split-capture fetch: ${splitErr.message}`);
    } else {
      for (const game of splitGames ?? []) {
        if (!game.slot_id) continue;

        const { data: slot } = await supabase
          .from('slots')
          .select('start_time')
          .eq('id', game.slot_id)
          .single();

        if (!slot?.start_time) continue;

        // Trigger at 12h before start (cancel cutoff)
        const cutoffMs = new Date(slot.start_time).getTime() - 12 * 60 * 60 * 1000;
        if (Date.now() < cutoffMs) continue;

        // court_price: authoritative column, fallback to price_per_player * 10
        const courtPriceVal: number = game.court_price ?? (game.price_per_player ?? 0) * 10;
        if (courtPriceVal <= 0) {
          await supabase.from('games').update({ stripe_split_captured: true }).eq('id', game.id);
          continue;
        }

        const N = game.current_players ?? 1; // total players incl. organizer

        // Per-joiner capture (capped at hold: courtPrice/10 * 1.08 + 2.50)
        const joinerShare = (courtPriceVal / Math.max(N, 10)) * (1 + PLATFORM_FEE_PERCENT) + PLATFORM_FEE_FIXED;

        // Organizer capture = their court share + platform fee
        const joinersCount = N - 1;
        let organizerCapture: number;
        if (N >= 10) {
          organizerCapture = (courtPriceVal / N) * (1 + PLATFORM_FEE_PERCENT) + PLATFORM_FEE_FIXED;
        } else {
          organizerCapture = (courtPriceVal * (11 - N) / 10) * (1 + PLATFORM_FEE_PERCENT) + PLATFORM_FEE_FIXED;
        }

        try {
          // 1. Capture each joiner's hold
          const { data: joiners } = await supabase
            .from('game_players')
            .select('player_id, stripe_payment_intent_id')
            .eq('game_id', game.id)
            .neq('player_id', game.organizer_id)
            .not('stripe_payment_intent_id', 'is', null);

          for (const joiner of joiners ?? []) {
            const captureRes = await fetch(
              `https://api.stripe.com/v1/payment_intents/${joiner.stripe_payment_intent_id}/capture`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${stripeKey}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `amount_to_capture=${Math.round(joinerShare * 100)}`,
              },
            );
            const captureData = await captureRes.json();
            if (captureData.error) {
              results.errors.push(`split-capture joiner ${joiner.player_id} game ${game.id}: ${captureData.error.message}`);
            }
          }

          // 2. Capture organizer's share from their session hold
          if (organizerCapture > 0) {
            const sessionRes = await fetch(
              `https://api.stripe.com/v1/checkout/sessions/${game.stripe_session_id}`,
              { headers: { Authorization: `Bearer ${stripeKey}` } },
            );
            const sessionData = await sessionRes.json();
            const orgPaymentIntentId = sessionData?.payment_intent;

            if (!orgPaymentIntentId) {
              results.errors.push(`split-capture game ${game.id}: no payment_intent on session`);
              continue;
            }

            const orgCaptureRes = await fetch(
              `https://api.stripe.com/v1/payment_intents/${orgPaymentIntentId}/capture`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${stripeKey}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `amount_to_capture=${Math.round(organizerCapture * 100)}`,
              },
            );
            const orgCaptureData = await orgCaptureRes.json();
            if (orgCaptureData.error) {
              results.errors.push(`split-capture organizer game ${game.id}: ${orgCaptureData.error.message}`);
              continue;
            }
          }

          await supabase.from('games').update({ stripe_split_captured: true }).eq('id', game.id);
        } catch (e: any) {
          results.errors.push(`split-capture game ${game.id}: ${e.message}`);
        }
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

      const minPlayers = 10;

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
