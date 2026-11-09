// Checkout for spots in a game:
//   organizer       — creates an open game, pays (holds) their own spot
//   join_self/other — joins an existing game (self, or paying for another player)
//   pay_reservation — pays a booking the venue created manually
//
// Every value that matters (price, players, slot, sport) is read from the DB here
// and written to the Stripe metadata. The game/enrollment is created afterwards by
// the server (_shared/fulfill.ts via stripe-webhook / finalize-checkout), never by
// the browser.
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  CAPTURE_CUTOFF_HOURS, METADATA_VERSION, SPORT_LABELS, UserError, assertReturnUrl, checkoutExpiresAt,
  corsHeaders, durationOrNull, json, playerRule, round2, serviceFeeFor, wallLabel, withSessionId,
} from '../_shared/checkout.ts';
import { customerFor, scheduledCheckoutParams, shouldSchedule } from '../_shared/scheduled.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── JWT verification: the payer always comes from the token ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);
    const userId = user.id;

    const body = await req.json();
    const mode = body.mode as string;
    const successUrl = withSessionId(assertReturnUrl(body.successUrl, 'URL de retorno'));
    const cancelUrl = assertReturnUrl(body.cancelUrl, 'URL de cancelamento');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    let vagaPrice: number;
    let captureManual: boolean;
    let label: { sport: string; court: string; venue: string; date: string; time: string };
    let metadata: Record<string, string>;
    let tipo: 'partida_aberta' | 'partida_fechada' = 'partida_aberta';
    let startIso = '';

    if (mode === 'organizer') {
      // ── New open game: price comes from slot/court ──
      const durationMins = durationOrNull(body.durationMins);
      if (!durationMins) throw new UserError('Duração inválida');
      const { data: slot } = await db.from('slots')
        .select('id, court_id, start_time, is_available, price_override')
        .eq('id', body.slotId).maybeSingle();
      if (!slot) throw new UserError('Horário não encontrado.');
      if (!slot.is_available) throw new UserError('Este horário já foi reservado.');
      if (new Date(slot.start_time).getTime() <= Date.now()) throw new UserError('Este horário já passou.');
      const { data: activeGame } = await db.from('games').select('id').eq('slot_id', slot.id)
        .not('status', 'in', '("expired","cancelled")').maybeSingle();
      if (activeGame) throw new UserError('Este horário já tem uma partida.');

      const court = await loadCourt(db, slot.court_id);
      const pricePerHour = Number(slot.price_override ?? court.price_per_hour) || 0;
      if (!pricePerHour) throw new UserError('Preço da quadra não encontrado');
      const courtPrice = round2(pricePerHour * (durationMins / 60));
      const rule = playerRule(court.sport_type);
      vagaPrice = round2(courtPrice / rule.min);
      const requested = Number(body.maxPlayers);
      const maxPlayers = requested >= rule.min && requested <= rule.max ? requested : rule.max;

      captureManual = true;
      startIso = slot.start_time;
      label = { sport: court.sport_type, court: court.name, venue: court.venueName, ...wallLabel(slot.start_time) };
      metadata = {
        kind: 'organizer', slotId: slot.id, courtId: slot.court_id, durationMins: String(durationMins),
        maxPlayers: String(maxPlayers), sport: court.sport_type, vagaPrice: String(vagaPrice), courtPrice: String(courtPrice),
      };
    } else if (mode === 'join_self' || mode === 'join_other' || mode === 'pay_reservation') {
      const { data: game } = await db.from('games')
        .select('id, status, max_players, price_per_player, sport_type, court_id, slot_id, scheduled_at, organizer_id, is_open')
        .eq('id', body.gameId).maybeSingle();
      if (!game) throw new UserError('Jogo não encontrado');
      if (game.status === 'expired' || game.status === 'cancelled') throw new UserError('Esta partida foi encerrada ou cancelada.');

      const court = await loadCourt(db, game.court_id);
      const startTime = await gameStart(db, game);
      startIso = startTime;
      label = { sport: game.sport_type ?? court.sport_type, court: court.name, venue: court.venueName, ...wallLabel(startTime) };
      tipo = mode === 'pay_reservation' || game.is_open === false ? 'partida_fechada' : 'partida_aberta';
      vagaPrice = Number(game.price_per_player) || 0;
      if (vagaPrice <= 0) throw new UserError('Preço da vaga não encontrado');

      if (mode === 'pay_reservation') {
        const { data: me } = await db.from('game_players').select('paid')
          .eq('game_id', game.id).eq('player_id', userId).maybeSingle();
        if (!me) throw new UserError('Você não faz parte desta reserva.');
        if (me.paid) throw new UserError('Esta reserva já está paga.');
        captureManual = false;
        metadata = { kind: 'pay_reservation', gameId: game.id };
      } else {
        const playerId = mode === 'join_other' ? String(body.targetPlayerId ?? '') : userId;
        if (!playerId) throw new UserError('Jogador não informado.');
        if (mode === 'join_other') {
          const { data: target } = await db.from('profiles').select('id').eq('id', playerId).maybeSingle();
          if (!target) throw new UserError('Jogador não encontrado.');
        }
        const cutoff = new Date(startTime).getTime() - CAPTURE_CUTOFF_HOURS * 3600_000;
        if (Date.now() >= cutoff) throw new UserError('As inscrições para esta partida já fecharam.');

        const { data: roster } = await db.from('game_players').select('player_id, team').eq('game_id', game.id);
        if ((roster ?? []).some((p: { player_id: string }) => p.player_id === playerId)) {
          throw new UserError('Este jogador já está na partida.');
        }
        if ((roster?.length ?? 0) >= game.max_players) throw new UserError('A partida já está completa.');

        let team = '';
        if (game.sport_type === 'futevolei') {
          team = body.team === 'b' ? 'b' : 'a';
          const perTeam = Math.floor(game.max_players / 2);
          const inTeam = (roster ?? []).filter((p: { team: string | null }) => (p.team ?? 'a') === team).length;
          if (inTeam >= perTeam) throw new UserError(`O time ${team.toUpperCase()} já está completo.`);
        }
        captureManual = body.captureManual !== false;
        metadata = { kind: 'join', gameId: game.id, playerId, ...(team ? { team } : {}) };
      }
    } else {
      throw new UserError('Modo de pagamento inválido');
    }

    const serviceFee = serviceFeeFor(vagaPrice);
    const description = `${tipo === 'partida_aberta' ? 'Partida aberta' : 'Partida fechada'} — ${label.court} · ${label.date} ${label.time}`;
    const piMetadata: Record<string, string> = { tipo, ...(metadata.gameId ? { gameId: metadata.gameId } : {}) };

    // Retenção com mais de 6 dias até a partida: só salva o cartão; retém 6 dias antes.
    if (captureManual && startIso && shouldSchedule(startIso)) {
      const scheduled = await stripe.checkout.sessions.create(scheduledCheckoutParams({
        userId,
        customer: await customerFor(stripe, db, userId),
        amount: round2(vagaPrice + serviceFee),
        startIso,
        chargeText: 'cobrado 2h antes da partida; pode ficar menor se mais jogadores entrarem',
        leaveHours: 24,
        description,
        piMetadata,
        metadata,
        successUrl,
        cancelUrl,
      }));
      return json({ url: scheduled.url, sessionId: scheduled.id, scheduled: true });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      expires_at: checkoutExpiresAt(),
      client_reference_id: userId,
      // Nome/descrição iguais aos do app (Financeiro do gestor) para bater com o Stripe
      payment_intent_data: {
        ...(captureManual ? { capture_method: 'manual' as const } : {}),
        description,
        metadata: piMetadata,
      },
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(vagaPrice * 100),
            product_data: {
              name: `${tipo === 'partida_aberta' ? 'Partida aberta' : 'Partida fechada'} — ${label.court}`,
              description: `${SPORT_LABELS[label.sport] ?? label.sport} · ${label.venue} · ${label.date} às ${label.time}`,
            },
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(serviceFee * 100),
            product_data: { name: 'Taxa de serviço JoggaHub', description: '8% + R$2,50 por transação' },
          },
          quantity: 1,
        },
      ],
      metadata: { v: METADATA_VERSION, userId, ...metadata },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return json({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (!(error instanceof UserError)) console.error('[create-checkout-session]', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});

// deno-lint-ignore no-explicit-any
async function loadCourt(db: any, courtId: string) {
  const { data: court } = await db.from('courts')
    .select('id, name, sport_type, price_per_hour, venues(name)')
    .eq('id', courtId).maybeSingle();
  if (!court) throw new UserError('Quadra não encontrada');
  return { ...court, venueName: court.venues?.name ?? '' };
}

/** Game start as stored wall-clock text: the slot's start, else scheduled_at. */
// deno-lint-ignore no-explicit-any
async function gameStart(db: any, game: { slot_id: string | null; scheduled_at: string | null }) {
  if (game.slot_id) {
    const { data: slot } = await db.from('slots').select('start_time').eq('id', game.slot_id).maybeSingle();
    if (slot?.start_time) return slot.start_time as string;
  }
  if (game.scheduled_at) return game.scheduled_at;
  throw new UserError('Horário da partida não encontrado');
}
