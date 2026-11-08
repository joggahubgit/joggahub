// Server-side fulfillment of a paid Stripe Checkout session.
//
// Called by BOTH stripe-webhook and finalize-checkout (the success screen on web
// and mobile). Every input comes from the session metadata, which only our own
// create-*-checkout-session functions write — never from the browser URL.
//
// Exactly-once: the session is claimed in public.checkout_fulfillments before
// anything is created, and every step is idempotent, so a retry after a crash
// resumes instead of duplicating.
//
// If the purchase can no longer be honoured (slot taken, game full/cancelled),
// the card hold is released (or the charge refunded) and the payer is notified.

import Stripe from 'https://esm.sh/stripe@14.21.0';
import {
  METADATA_VERSION, UserError, playerRule, wallAddMinutes, wallStart,
} from './checkout.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export type FulfillResult =
  | { status: 'done'; kind: string; gameId: string | null; bookingId: string | null; slotId: string | null; created: boolean }
  | { status: 'processing' }
  | { status: 'failed'; error: string }
  | { status: 'unpaid' }
  | { status: 'legacy' };

type Md = Record<string, string>;
type Done = { gameId: string | null; bookingId: string | null; slotId: string | null; classId?: string | null };

const STALE_CLAIM_MS = 2 * 60 * 1000;

export async function fulfillSession(
  stripe: Stripe,
  db: Db,
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  const md = (session.metadata ?? {}) as Md;
  if (md.v !== METADATA_VERSION) return { status: 'legacy' };

  // ── 1. Was it really paid (or authorized, for holds)? ──
  const piId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  if (session.status !== 'complete' || !piId) return { status: 'unpaid' };
  const pi = await stripe.paymentIntents.retrieve(piId);
  if (pi.status !== 'requires_capture' && pi.status !== 'succeeded') return { status: 'unpaid' };

  // ── 2. Claim the session ──
  const claim = await claimSession(db, session.id, md);
  if (claim.state === 'done') return { status: 'done', ...claim.result, kind: md.kind, created: false };
  if (claim.state === 'failed') return { status: 'failed', error: claim.error };
  if (claim.state === 'busy') return { status: 'processing' };

  // ── 3. Create what was bought ──
  try {
    let done: Done;
    switch (md.kind) {
      case 'private_game': done = await fulfillPrivateGame(db, session, md); break;
      case 'organizer': done = await fulfillOrganizer(db, session, md); break;
      case 'join': done = await fulfillJoin(db, pi, md); break;
      case 'pay_reservation': done = await fulfillPayReservation(db, pi, md); break;
      case 'class_enrollment': done = await fulfillClassEnrollment(db, session, pi, md); break;
      default: throw new UserError(`Tipo de pagamento desconhecido: ${md.kind}`);
    }
    await db.from('checkout_fulfillments')
      .update({ status: 'done', result: done, error: null, updated_at: new Date().toISOString() })
      .eq('session_id', session.id);
    return { status: 'done', kind: md.kind, ...done, created: true };
  } catch (err) {
    if (err instanceof UserError) {
      await releasePayment(stripe, pi);
      await db.from('checkout_fulfillments')
        .update({ status: 'failed', error: err.message, updated_at: new Date().toISOString() })
        .eq('session_id', session.id);
      await db.from('notifications').insert({
        user_id: md.userId,
        type: 'payment_released',
        title: 'Pagamento não concluído',
        message: `${err.message} O valor foi liberado no seu cartão.`,
        game_id: md.gameId || null,
      });
      return { status: 'failed', error: err.message };
    }
    // Unexpected (network/DB): drop the claim so the next webhook retry or
    // success-screen poll resumes. Every step above is idempotent.
    console.error('[fulfill] unexpected error', session.id, err);
    await db.from('checkout_fulfillments').delete().eq('session_id', session.id).eq('status', 'processing');
    throw err;
  }
}

// ── Claim ────────────────────────────────────────────────────────────────────

type Claim =
  | { state: 'claimed' }
  | { state: 'busy' }
  | { state: 'done'; result: Done }
  | { state: 'failed'; error: string };

async function claimSession(db: Db, sessionId: string, md: Md): Promise<Claim> {
  const { error } = await db.from('checkout_fulfillments')
    .insert({ session_id: sessionId, kind: md.kind, user_id: md.userId });
  if (!error) return { state: 'claimed' };
  if (error.code !== '23505') throw new Error(`claim: ${error.message}`);

  const { data: row } = await db.from('checkout_fulfillments')
    .select('status, result, error, attempts, updated_at')
    .eq('session_id', sessionId)
    .single();
  if (!row) return { state: 'busy' };
  if (row.status === 'done') return { state: 'done', result: row.result };
  if (row.status === 'failed') return { state: 'failed', error: row.error ?? 'Falha ao processar pagamento' };

  // Another worker is on it — take over only if it looks dead.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: taken } = await db.from('checkout_fulfillments')
    .update({ attempts: (row.attempts ?? 1) + 1, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('status', 'processing')
    .lt('updated_at', staleBefore)
    .select('session_id');
  return taken?.length ? { state: 'claimed' } : { state: 'busy' };
}

async function releasePayment(stripe: Stripe, pi: Stripe.PaymentIntent) {
  try {
    if (pi.status === 'requires_capture') await stripe.paymentIntents.cancel(pi.id);
    else if (pi.status === 'succeeded') await stripe.refunds.create({ payment_intent: pi.id });
  } catch (e) {
    // Never hide this: the payer must not stay charged for something they didn't get.
    console.error('[fulfill] RELEASE FAILED — refund manually', pi.id, e);
  }
}

// ── Curso (aulas) ────────────────────────────────────────────────────────────
// Inscrição criada por class_enroll no banco: trava o curso, confere status,
// prazo (2h antes da 1ª aula), vagas e duplicidade, e é idempotente pela sessão.

async function fulfillClassEnrollment(db: Db, session: Stripe.Checkout.Session, pi: Stripe.PaymentIntent, md: Md): Promise<Done> {
  const { error } = await db.rpc('class_enroll', {
    p_class_id: md.classId,
    p_player_id: md.userId,
    p_stripe_session_id: session.id,
    p_payment_intent_id: pi.id,
    p_amount: Number(md.price),
    p_fee: Number(md.fee),
  });
  if (error) {
    // hint 'user' = regra de negócio (lotado, fechado, cancelado…): devolve o dinheiro
    if (error.hint === 'user') throw new UserError(error.message);
    throw new Error(`class_enroll: ${error.message}`);
  }
  // Day use com valor retido (cobrado 2h antes pela capture-day-use)
  if (pi.status === 'requires_capture') {
    await db.from('class_enrollments').update({ payment_held: true }).eq('stripe_session_id', session.id);
  }
  return { gameId: null, bookingId: null, slotId: null, classId: md.classId };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function playerName(db: Db, userId: string) {
  const { data } = await db.from('profiles').select('name').eq('id', userId).maybeSingle();
  return (data?.name as string | undefined) || 'Jogador';
}

async function gameBySession(db: Db, sessionId: string) {
  const { data } = await db.from('games')
    .select('id, slot_id, booking_id')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();
  return data as { id: string; slot_id: string | null; booking_id: string | null } | null;
}

async function ensurePlayer(db: Db, row: Record<string, unknown>) {
  const { error } = await db.from('game_players').insert(row);
  if (error && error.code !== '23505') throw new Error(`game_players: ${error.message}`);
}

async function activeGameOnSlot(db: Db, slotId: string) {
  const { data } = await db.from('games')
    .select('id, is_open, booking_id, stripe_session_id')
    .eq('slot_id', slotId)
    .not('status', 'in', '("expired","cancelled")')
    .maybeSingle();
  return data as { id: string; is_open: boolean; booking_id: string | null; stripe_session_id: string | null } | null;
}

/** Same rule as confirm-slot-booking: block every 30-min slot inside the session. */
async function blockSessionSlots(db: Db, courtId: string, startWall: string, durationMins: number) {
  await db.from('slots')
    .update({ is_available: false })
    .eq('court_id', courtId)
    .gte('start_time', startWall)
    .lt('start_time', wallAddMinutes(startWall, durationMins));
}

// ── Private game (organizer books the whole court; split or full) ───────────

async function fulfillPrivateGame(db: Db, session: Stripe.Checkout.Session, md: Md): Promise<Done> {
  const userId = md.userId;
  const courtId = md.courtId;
  const durationMins = Number(md.durationMins);
  const payMode = md.payMode === 'split' ? 'split' : 'full';
  const sport = md.sport;
  const courtPrice = Number(md.courtPrice);

  // Resume after a crash: the game is the last thing created.
  const existingGame = await gameBySession(db, session.id);
  if (existingGame) {
    await ensurePlayer(db, {
      game_id: existingGame.id, player_id: userId, player_name: await playerName(db, userId), paid: true,
      ...(sport === 'futevolei' ? { team: 'a' } : {}),
    });
    return { gameId: existingGame.id, bookingId: existingGame.booking_id, slotId: existingGame.slot_id };
  }

  // 1. Slot
  let slotId = md.slotId || null;
  let startWall: string;
  if (slotId) {
    const { data: slot } = await db.from('slots').select('id, court_id, start_time, is_available').eq('id', slotId).maybeSingle();
    if (!slot) throw new UserError('Este horário não existe mais.');
    startWall = wallStart(slot.start_time);
    const { data: mine } = await db.from('bookings').select('id').eq('slot_id', slotId).eq('created_by', userId).neq('status', 'cancelled').maybeSingle();
    if (!mine) {
      const game = await activeGameOnSlot(db, slotId);
      if (game) throw new UserError('Este horário acabou de ser reservado por outra pessoa.');
      const { data: taken } = await db.from('slots').select('id')
        .eq('court_id', courtId).eq('is_available', false)
        .gte('start_time', startWall).lt('start_time', wallAddMinutes(startWall, durationMins));
      if (taken?.length) throw new UserError('Este horário acabou de ser reservado por outra pessoa.');
    }
  } else {
    // Dynamic slot (court without pre-created slots)
    startWall = wallStart(md.startTime);
    const endWall = wallAddMinutes(startWall, durationMins);
    const { data: existing } = await db.from('slots').select('id').eq('court_id', courtId).eq('start_time', startWall).maybeSingle();
    if (existing) {
      slotId = existing.id;
      const { data: mine } = await db.from('bookings').select('id').eq('slot_id', slotId).eq('created_by', userId).neq('status', 'cancelled').maybeSingle();
      if (!mine) throw new UserError('Este horário acabou de ser reservado por outra pessoa.');
    } else {
      const { data: conflicts } = await db.from('slots').select('id')
        .eq('court_id', courtId).eq('is_available', false)
        .lt('start_time', endWall).gt('end_time', startWall);
      if (conflicts?.length) throw new UserError('Este horário acabou de ser reservado por outra pessoa.');
      const { data: created, error } = await db.from('slots').insert({
        court_id: courtId, start_time: startWall, end_time: endWall, is_available: false,
        price_override: Number(md.pricePerHour) || null,
      }).select('id').single();
      if (error) throw new UserError('Este horário acabou de ser reservado por outra pessoa.');
      slotId = created.id;
    }
  }

  // 2. Booking (reuse if a previous attempt already created it)
  const { data: existingBooking } = await db.from('bookings').select('id')
    .eq('slot_id', slotId).eq('created_by', userId).neq('status', 'cancelled').maybeSingle();
  let bookingId: string | null = existingBooking?.id ?? null;
  if (!bookingId) {
    const { data: booking, error } = await db.from('bookings').insert({
      slot_id: slotId,
      court_id: courtId,
      created_by: userId,
      total_price: (session.amount_total ?? 0) / 100,
      max_players: Number(md.maxPlayers),
      payment_type: payMode,
      payment_status: 'paid',
      status: 'confirmed',
    }).select('id').single();
    if (error) throw new Error(`bookings: ${error.message}`);
    bookingId = booking.id;
  }

  // 3. Block the slots
  await blockSessionSlots(db, courtId, startWall, durationMins);

  // 4. Game
  const rule = playerRule(sport);
  const { data: game, error: gameErr } = await db.from('games').insert({
    organizer_id: userId,
    created_by: userId,
    court_id: courtId,
    slot_id: slotId,
    booking_id: bookingId,
    scheduled_at: startWall,
    scheduled_end_at: wallAddMinutes(startWall, durationMins),
    max_players: payMode === 'split' ? rule.max : Number(md.maxPlayers),
    current_players: 1,
    price_per_player: payMode === 'split' ? courtPrice / rule.min : 0,
    court_price: courtPrice,
    pay_mode: payMode,
    sport_type: sport,
    is_open: false,
    status: 'confirmed_booking',
    game_type: 'casual',
    stripe_session_id: session.id,
  }).select('id').single();
  if (gameErr) throw new Error(`games: ${gameErr.message}`);

  await ensurePlayer(db, {
    game_id: game.id, player_id: userId, player_name: await playerName(db, userId), paid: true,
    ...(sport === 'futevolei' ? { team: 'a' } : {}),
  });

  return { gameId: game.id, bookingId, slotId };
}

// ── Organizer creates an open game (pays only their own spot, held) ─────────

async function fulfillOrganizer(db: Db, session: Stripe.Checkout.Session, md: Md): Promise<Done> {
  const userId = md.userId;
  const sport = md.sport;

  const existing = await gameBySession(db, session.id);
  if (existing) {
    await ensurePlayer(db, {
      game_id: existing.id, player_id: userId, player_name: await playerName(db, userId), paid: true,
      ...(sport === 'futevolei' ? { team: 'a' } : {}),
    });
    return { gameId: existing.id, bookingId: null, slotId: existing.slot_id };
  }

  const { data: slot } = await db.from('slots').select('id, start_time, is_available').eq('id', md.slotId).maybeSingle();
  if (!slot) throw new UserError('Este horário não existe mais.');
  if (!slot.is_available || await activeGameOnSlot(db, slot.id)) {
    throw new UserError('Este horário acabou de ser reservado por outra pessoa.');
  }
  const startWall = wallStart(slot.start_time);

  const { data: game, error } = await db.from('games').insert({
    organizer_id: userId,
    created_by: userId,
    court_id: md.courtId,
    slot_id: slot.id,
    scheduled_at: startWall,
    scheduled_end_at: wallAddMinutes(startWall, Number(md.durationMins)),
    max_players: Number(md.maxPlayers),
    current_players: 1,
    price_per_player: Number(md.vagaPrice),
    court_price: Number(md.courtPrice),
    sport_type: sport,
    is_open: true,
    game_type: 'casual',
    status: 'scheduled',
    stripe_session_id: session.id,
  }).select('id').single();
  if (error) throw new Error(`games: ${error.message}`);

  // Same as before: the open game blocks its start slot.
  await db.from('slots').update({ is_available: false }).eq('id', slot.id);

  await ensurePlayer(db, {
    game_id: game.id, player_id: userId, player_name: await playerName(db, userId), paid: true,
    ...(sport === 'futevolei' ? { team: 'a' } : {}),
  });

  return { gameId: game.id, bookingId: null, slotId: slot.id };
}

// ── A player joins an existing game (self, or paid by someone else) ─────────

async function fulfillJoin(db: Db, pi: Stripe.PaymentIntent, md: Md): Promise<Done> {
  const gameId = md.gameId;
  const playerId = md.playerId;
  const team = md.team === 'a' || md.team === 'b' ? md.team : null;
  const holdId = pi.capture_method === 'manual' ? pi.id : null;

  const { data: game } = await db.from('games')
    .select('id, status, max_players, organizer_id, sport_type, slot_id')
    .eq('id', gameId).maybeSingle();
  if (!game) throw new UserError('Partida não encontrada.');

  const { data: already } = await db.from('game_players').select('id, paid, stripe_payment_intent_id')
    .eq('game_id', gameId).eq('player_id', playerId).maybeSingle();

  let newlyConfirmed = false;
  if (already) {
    // Resume / duplicate delivery: make sure it is recorded as paid.
    await db.from('game_players').update({
      paid: true,
      ...(holdId && !already.stripe_payment_intent_id ? { stripe_payment_intent_id: holdId } : {}),
    }).eq('id', already.id);
  } else {
    if (game.status === 'expired' || game.status === 'cancelled') {
      throw new UserError('Esta partida foi encerrada ou cancelada.');
    }
    const { data: roster } = await db.from('game_players').select('team').eq('game_id', gameId);
    if ((roster?.length ?? 0) >= game.max_players) throw new UserError('A partida já está completa.');
    if (game.sport_type === 'futevolei' && team) {
      const perTeam = Math.floor(game.max_players / 2);
      const inTeam = (roster ?? []).filter((p: { team: string | null }) => (p.team ?? 'a') === team).length;
      if (inTeam >= perTeam) throw new UserError(`O time ${team.toUpperCase()} já está completo.`);
    }

    await ensurePlayer(db, {
      game_id: gameId,
      player_id: playerId,
      player_name: await playerName(db, playerId),
      paid: true,
      ...(holdId ? { stripe_payment_intent_id: holdId } : {}),
      ...(team ? { team } : {}),
    });

    // Count from the roster instead of incrementing, so concurrent joins can't drift.
    const { count } = await db.from('game_players').select('id', { count: 'exact', head: true }).eq('game_id', gameId);
    const total = count ?? 0;
    newlyConfirmed = game.status === 'scheduled' && total >= playerRule(game.sport_type ?? '').min;
    await db.from('games').update({
      current_players: total,
      ...(newlyConfirmed ? { status: 'confirmed_booking' } : {}),
    }).eq('id', gameId);

    // Same notifications the web used to send from the browser.
    const name = await playerName(db, playerId);
    const { data: others } = await db.from('game_players').select('player_id').eq('game_id', gameId).neq('player_id', playerId);
    if (others?.length) {
      await db.from('notifications').insert(others.map((p: { player_id: string }) => ({
        user_id: p.player_id, type: 'game_joined', title: 'Novo jogador entrou!',
        message: `${name} entrou na partida. Agora são ${total}/${game.max_players} jogadores.`, game_id: gameId,
      })));
    }
    if (newlyConfirmed && game.organizer_id) {
      await db.from('notifications').insert({
        user_id: game.organizer_id, type: 'game_confirmed', title: 'Reserva confirmada!',
        message: 'Sua partida atingiu o mínimo de jogadores e está confirmada.', game_id: gameId,
      });
    }
    if (playerId !== md.userId) {
      await db.from('notifications').insert({
        user_id: playerId, type: 'game_joined', title: 'Você foi adicionado a uma partida!',
        message: 'Seu pagamento foi confirmado e você está inscrito na partida.', game_id: gameId,
      });
    }
  }

  return { gameId, bookingId: null, slotId: game.slot_id ?? null };
}

// ── Organizer pays a booking the venue (gestor) created manually ────────────

async function fulfillPayReservation(db: Db, pi: Stripe.PaymentIntent, md: Md): Promise<Done> {
  const { data: row } = await db.from('game_players').select('id')
    .eq('game_id', md.gameId).eq('player_id', md.userId).maybeSingle();
  if (!row) throw new UserError('Você não faz parte desta reserva.');
  await db.from('game_players').update({ paid: true, stripe_payment_intent_id: pi.id }).eq('id', row.id);

  const { data: game } = await db.from('games').select('booking_id, slot_id').eq('id', md.gameId).single();
  if (game?.booking_id) {
    await db.from('bookings').update({ payment_status: 'paid' }).eq('id', game.booking_id);
  }
  return { gameId: md.gameId, bookingId: game?.booking_id ?? null, slotId: game?.slot_id ?? null };
}
