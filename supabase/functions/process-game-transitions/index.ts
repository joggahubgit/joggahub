/**
 * process-game-transitions
 *
 * Cron-triggered Edge Function that handles automatic game status transitions:
 *
 * -1. scheduled → expired (auto-cancel — insufficient players before start)
 *    When: hoursUntilStart <= 2 AND current_players < min_players (per sport, see SPORT_MIN_PLAYERS)
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
 * 3. game_results pending → confirmed (auto-confirm, futevôlei only)
 *    When: created_at + 6 hours <= now() AND status = 'pending'
 *    Effect: status = 'confirmed', ELO rating applied as if the losing
 *            side had confirmed (same math as submit-game-result)
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

// Mirrors SPORT_PLAYER_RULES in src/app/lib/gameConfig.ts — keep both in sync.
const SPORT_MIN_PLAYERS: Record<string, number> = {
  football: 10, society: 10, futsal: 10, futevolei: 4,
};

// Mirrors the ELO constants in submit-game-result/index.ts — keep both in sync.
const RESULT_CONFIRM_TIMEOUT_HOURS = 6;
const RATING_SCALE = 1.2;
const RATING_MIN = 1.0;
const RATING_MAX = 7.0;
const RATING_DEFAULT = 3.0;
function kFactorFor(matchesPlayed: number): number {
  if (matchesPlayed < 5) return 0.8;
  if (matchesPlayed < 15) return 0.5;
  return 0.25;
}
function clampRating(r: number): number {
  return Math.min(RATING_MAX, Math.max(RATING_MIN, r));
}

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
  if (sets.length === 1) return { status: 'confirmed', winningTeam: setsA > setsB ? 'a' : 'b' };
  if (setsA >= 2) return { status: 'confirmed', winningTeam: 'a' };
  if (setsB >= 2) return { status: 'confirmed', winningTeam: 'b' };
  return { status: 'draw' };
}

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
    autoConfirmedResults: [] as string[],
    errors: [] as string[],
  };

  // Helper: resolve min players for a sport type
  function resolveMinPlayers(sportType: string | null): number {
    return SPORT_MIN_PLAYERS[sportType ?? ''] ?? 4;
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
  // -1. AUTO-CANCEL: scheduled open games with insufficient players at 2h before start
  //
  //   Only fires when hoursUntilStart ≤ 2 AND current_players < min_players.
  //   Games that previously reached confirmed_booking reverted to scheduled via
  //   leave-game when players dropped below min — they are eligible here too.
  // ─────────────────────────────────────────────────────────────────────
  {
    const { data: openScheduled, error: openErr } = await supabase
      .from('games')
      .select('id, slot_id, court_id, current_players, organizer_id, stripe_session_id, sport_type')
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

        // Only act in the 2h window before start
        if (hoursUntilStart > 2 || hoursUntilStart < 0) continue;

        const minPlayers = resolveMinPlayers(game.sport_type ?? null);
        const currentPlayers = game.current_players ?? 0;

        // Has minimum players — should have been confirmed already, skip
        if (currentPlayers >= minPlayers) continue;

        const reason = `A partida foi cancelada automaticamente: apenas ${currentPlayers}/${minPlayers} jogadores confirmados faltando menos de 2h para o início.`;

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
  //    - Hold per player was court_price / sport's min_players * 1.15
  //    - Capture court_price / N * 1.15 from each player's PI (less if N > min_players)
  //    Games with N < min_players were already auto-cancelled by block -1.
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
  // F. FULL PRIVATE CAPTURE: 24h before game start
  //
  //    For confirmed private full games (is_open=false, pay_mode='full'):
  //    - Retrieve organizer's PI from games.stripe_session_id
  //    - Capture full amount (court_price + service fee already included in hold)
  //    - Mark stripe_split_captured = true to prevent double-capture
  // ─────────────────────────────────────────────────────────────────────
  {
    const stripeKeyFull = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

    const { data: fullGames, error: fullErr } = await supabase
      .from('games')
      .select('id, slot_id, stripe_session_id')
      .eq('is_open', false)
      .eq('pay_mode', 'full')
      .eq('stripe_split_captured', false)
      .eq('status', 'confirmed_booking')
      .not('stripe_session_id', 'is', null);

    if (fullErr) {
      results.errors.push(`full-capture fetch: ${fullErr.message}`);
    } else {
      for (const game of fullGames ?? []) {
        if (!game.slot_id) continue;

        const { data: slot } = await supabase
          .from('slots')
          .select('start_time')
          .eq('id', game.slot_id)
          .single();

        if (!slot?.start_time) continue;

        // Trigger at 24h before start
        const cutoffMs = new Date(slot.start_time).getTime() - 24 * 60 * 60 * 1000;
        if (Date.now() < cutoffMs) continue;

        try {
          const sessRes = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${game.stripe_session_id}`,
            { headers: { Authorization: `Bearer ${stripeKeyFull}` } },
          );
          const sessData = await sessRes.json();
          const piId = sessData?.payment_intent;

          if (!piId) {
            results.errors.push(`full-capture game ${game.id}: no payment_intent on session`);
            continue;
          }

          const captureRes = await fetch(
            `https://api.stripe.com/v1/payment_intents/${piId}/capture`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${stripeKeyFull}` },
            },
          );
          const captureData = await captureRes.json();

          if (captureData.error) {
            results.errors.push(`full-capture game ${game.id}: ${captureData.error.message}`);
            continue;
          }

          await supabase.from('games').update({ stripe_split_captured: true }).eq('id', game.id);
        } catch (e: any) {
          results.errors.push(`full-capture game ${game.id}: ${e.message}`);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // S. SPLIT PAYMENT CAPTURE: 2h before game start (player entry closes)
  //
  //    For each split private game where 2h cutoff has been reached:
  //    baseline = sport's min players (10 for football, 4 for futevôlei, etc.)
  //    - Each joiner: capture court_price / max(N,baseline) * 1.08 + 2.50
  //    - Organizer:   capture the remainder so total = court_price * 1.08 + 2.50
  //      → if N >= baseline: court_price / N * 1.08 + 2.50
  //      → if N <  baseline: organizer covers shortfall
  //
  //    Joiner PIs stored in game_players.stripe_payment_intent_id.
  //    Organizer PI resolved from games.stripe_session_id via Stripe API.
  // ─────────────────────────────────────────────────────────────────────
  {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

    const { data: splitGames, error: splitErr } = await supabase
      .from('games')
      .select('id, max_players, current_players, court_price, price_per_player, stripe_session_id, slot_id, organizer_id, sport_type')
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

        // Trigger at 2h before start (player entry closes + capture)
        const cutoffMs = new Date(slot.start_time).getTime() - 2 * 60 * 60 * 1000;
        if (Date.now() < cutoffMs) continue;

        const baseline = resolveMinPlayers(game.sport_type ?? null);

        // court_price: authoritative column, fallback to price_per_player * baseline
        const courtPriceVal: number = game.court_price ?? (game.price_per_player ?? 0) * baseline;
        if (courtPriceVal <= 0) {
          await supabase.from('games').update({ stripe_split_captured: true }).eq('id', game.id);
          continue;
        }

        const N = game.current_players ?? 1; // total players incl. organizer

        // Per-joiner capture (capped at hold: courtPrice/baseline * 1.08 + 2.50)
        const joinerShare = (courtPriceVal / Math.max(N, baseline)) * (1 + PLATFORM_FEE_PERCENT) + PLATFORM_FEE_FIXED;

        // Organizer capture = their court share + platform fee
        let organizerCapture: number;
        if (N >= baseline) {
          organizerCapture = (courtPriceVal / N) * (1 + PLATFORM_FEE_PERCENT) + PLATFORM_FEE_FIXED;
        } else {
          organizerCapture = (courtPriceVal * (baseline + 1 - N) / baseline) * (1 + PLATFORM_FEE_PERCENT) + PLATFORM_FEE_FIXED;
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
    .select('id, slot_id, court_id, current_players, sport_type')
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

      const minPlayers = resolveMinPlayers(game.sport_type ?? null);

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

  // ─────────────────────────────────────────────────────────────────────
  // 3. AUTO-CONFIRM GAME RESULTS: 6h timeout with no adversarial confirmation
  //
  //    If the losing side (per the original proposal) never confirms or
  //    disputes a pending game_results row within RESULT_CONFIRM_TIMEOUT_HOURS,
  //    the proposed result is accepted as-is and ratings are updated —
  //    same ELO math as the manual-confirm path in submit-game-result.
  // ─────────────────────────────────────────────────────────────────────
  {
    const cutoffIso = new Date(Date.now() - RESULT_CONFIRM_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();

    const { data: pendingResults, error: pendingResultsErr } = await supabase
      .from('game_results')
      .select('id, game_id, sets, created_at')
      .eq('status', 'pending')
      .lt('created_at', cutoffIso);

    if (pendingResultsErr) {
      results.errors.push(`auto-confirm results fetch: ${pendingResultsErr.message}`);
    } else {
      for (const gr of pendingResults ?? []) {
        try {
          const outcome = deriveOutcome(gr.sets);

          if (outcome.status !== 'confirmed') {
            await supabase.from('game_results').update({
              status: outcome.status,
              confirmed_at: new Date().toISOString(),
            }).eq('id', gr.id).eq('status', 'pending'); // idempotent guard
            results.autoConfirmedResults.push(gr.id);
            continue;
          }

          const { data: teamRows } = await supabase
            .from('game_players').select('player_id, team').eq('game_id', gr.game_id);
          const teamIds: { a: string[]; b: string[] } = { a: [], b: [] };
          for (const p of teamRows ?? []) {
            if (p.team === 'a') teamIds.a.push(p.player_id);
            if (p.team === 'b') teamIds.b.push(p.player_id);
          }
          if (teamIds.a.length !== 2 || teamIds.b.length !== 2) {
            results.errors.push(`auto-confirm result ${gr.id}: teams not fully assigned`);
            continue;
          }
          const winnerIds = teamIds[outcome.winningTeam];
          const loserIds = teamIds[outcome.winningTeam === 'a' ? 'b' : 'a'];
          const playerIds = [...winnerIds, ...loserIds];

          const { data: ratingRows } = await supabase
            .from('player_ratings').select('player_id, rating, matches_played')
            .eq('sport_type', 'futevolei').in('player_id', playerIds);

          const ratingMap: Record<string, { rating: number; matches_played: number }> = {};
          for (const pid of playerIds) ratingMap[pid] = { rating: RATING_DEFAULT, matches_played: 0 };
          for (const r of ratingRows ?? []) ratingMap[r.player_id] = { rating: r.rating, matches_played: r.matches_played };

          const winnerAvg = (ratingMap[winnerIds[0]].rating + ratingMap[winnerIds[1]].rating) / 2;
          const loserAvg = (ratingMap[loserIds[0]].rating + ratingMap[loserIds[1]].rating) / 2;
          const expectedWinnerWin = 1 / (1 + 10 ** (-(winnerAvg - loserAvg) / RATING_SCALE));
          const movement = 1 - expectedWinnerWin;

          const newRatings: Record<string, number> = {};
          for (const pid of winnerIds) newRatings[pid] = clampRating(ratingMap[pid].rating + kFactorFor(ratingMap[pid].matches_played) * movement);
          for (const pid of loserIds) newRatings[pid] = clampRating(ratingMap[pid].rating - kFactorFor(ratingMap[pid].matches_played) * movement);

          for (const pid of playerIds) {
            await supabase.from('player_ratings').upsert({
              player_id: pid,
              sport_type: 'futevolei',
              rating: newRatings[pid],
              matches_played: ratingMap[pid].matches_played + 1,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'player_id,sport_type' });

            await supabase.from('player_rating_history').insert({
              player_id: pid,
              sport_type: 'futevolei',
              game_id: gr.game_id,
              rating: newRatings[pid],
              matches_played: ratingMap[pid].matches_played + 1,
            });
          }

          await supabase.from('game_results').update({
            status: 'confirmed',
            winner_ids: winnerIds,
            loser_ids: loserIds,
            confirmed_at: new Date().toISOString(),
          }).eq('id', gr.id).eq('status', 'pending'); // idempotent guard

          await supabase.from('notifications').insert(
            playerIds.map(pid => ({
              user_id: pid,
              type: 'rating_updated',
              title: 'Resultado confirmado automaticamente',
              message: `O time adversário não confirmou em ${RESULT_CONFIRM_TIMEOUT_HOURS}h, então o resultado registrado foi aceito. Seu rating de futevôlei mudou de ${ratingMap[pid].rating.toFixed(2)} para ${newRatings[pid].toFixed(2)}.`,
              game_id: gr.game_id,
            })),
          );

          results.autoConfirmedResults.push(gr.id);
        } catch (e: any) {
          results.errors.push(`auto-confirm result ${gr.id}: ${e.message}`);
        }
      }
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
