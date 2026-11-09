// Leaving a game, all on the server (web and app):
//   - a player leaves                       → their hold is released (or refunded)
//   - the organizer removes a player        → same, for that player
//   - the organizer leaves an OPEN game     → their hold is released and the
//     earliest other player becomes organizer
// Players are counted from the roster (never "count - 1") because the 2h capture
// divides the court price by games.current_players. Everyone affected is notified
// by the server, so the browser doesn't need to write notifications.
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SPORT_LABELS, UserError, corsHeaders, json, playerRule } from '../_shared/checkout.ts';

const CANCEL_CUTOFF_HOURS = 24;

// deno-lint-ignore no-explicit-any
type Db = any;

/** Cancel a hold (no fee) or refund a captured charge. Returns false if neither worked. */
async function releasePi(stripe: Stripe, piId: string): Promise<boolean> {
  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status === 'canceled') return true;
    if (pi.status === 'succeeded') {
      await stripe.refunds.create({ payment_intent: piId });
      return true;
    }
    await stripe.paymentIntents.cancel(piId);
    return true;
  } catch (e) {
    console.error('[leave-game] RELEASE FAILED — refund manually', piId, e);
    return false;
  }
}

async function organizerPi(stripe: Stripe, game: { organizer_payment_intent_id?: string | null; stripe_session_id: string | null }) {
  if (game.organizer_payment_intent_id) return game.organizer_payment_intent_id;
  const sessionId = game.stripe_session_id;
  if (!sessionId) return null;
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    return typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
  } catch {
    return null;
  }
}

async function recount(db: Db, game: { id: string; status: string; is_open: boolean; sport_type: string | null }) {
  const { count } = await db.from('game_players').select('id', { count: 'exact', head: true }).eq('game_id', game.id);
  const total = count ?? 0;
  const update: Record<string, unknown> = { current_players: total };
  // Open game below the minimum again: reopen it so new players can join.
  if (game.is_open && game.status === 'confirmed_booking' && total < playerRule(game.sport_type ?? '').min) {
    update.status = 'scheduled';
  }
  await db.from('games').update(update).eq('id', game.id);
  return total;
}

async function notifyOthers(db: Db, gameId: string, exclude: string[], title: string, message: string, type = 'game_left') {
  const { data } = await db.from('game_players').select('player_id').eq('game_id', gameId);
  const ids = (data ?? []).map((p: { player_id: string }) => p.player_id).filter((id: string) => id && !exclude.includes(id));
  if (ids.length) {
    await db.from('notifications').insert(ids.map((uid: string) => ({ user_id: uid, type, title, message, game_id: gameId })));
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);
    const callerId = user.id;

    const { gameId, targetPlayerId } = await req.json();
    if (!gameId) throw new UserError('gameId is required');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: game } = await db.from('games')
      .select('id, organizer_id, slot_id, status, is_open, booking_id, pay_mode, sport_type, court_id, stripe_session_id, organizer_payment_intent_id, scheduled_at')
      .eq('id', gameId).maybeSingle();
    if (!game) throw new UserError('Partida não encontrada');
    if (!['scheduled', 'confirmed_booking'].includes(game.status)) throw new UserError('Partida não está ativa');

    const removed: string = targetPlayerId ?? callerId;
    const byOrganizer = removed !== callerId;
    if (byOrganizer && callerId !== game.organizer_id) return json({ error: 'Forbidden' }, 403);

    // 24h cutoff (the club can still act through its own tools)
    let start: string | null = game.scheduled_at;
    if (game.slot_id) {
      const { data: slot } = await db.from('slots').select('start_time').eq('id', game.slot_id).maybeSingle();
      start = slot?.start_time ?? start;
    }
    if (start && (new Date(start).getTime() - Date.now()) / 3600_000 < CANCEL_CUTOFF_HOURS) {
      throw new UserError(`Cancelamento não permitido dentro das ${CANCEL_CUTOFF_HOURS}h anteriores à partida`);
    }

    const { data: court } = await db.from('courts').select('name').eq('id', game.court_id).maybeSingle();
    const where = `${SPORT_LABELS[game.sport_type ?? ''] ?? 'partida'}${court?.name ? ` em ${court.name}` : ''}`;

    // ── Organizer leaves ────────────────────────────────────────────────────
    if (removed === game.organizer_id) {
      if (byOrganizer) throw new UserError('O organizador não pode ser removido.');
      if (!game.is_open) throw new UserError('Para sair de uma partida privada, cancele a partida.');

      const { data: roster } = await db.from('game_players')
        .select('player_id, player_name, joined_at')
        .eq('game_id', gameId).neq('player_id', callerId)
        .order('joined_at', { ascending: true });
      const next = (roster ?? []).find((p: { player_id: string | null }) => !!p.player_id);
      if (!next) throw new UserError('Você é o único jogador. Para sair, cancele a partida.');

      const orgPi = await organizerPi(stripe, game);
      const refunded = orgPi ? await releasePi(stripe, orgPi) : false;

      await db.from('game_players').delete().eq('game_id', gameId).eq('player_id', callerId);
      // The organizer's hold lives on the game (not on game_players): clear it so
      // the 2h capture doesn't try to charge someone who left.
      await db.from('games').update({ organizer_id: next.player_id, stripe_session_id: null, organizer_payment_intent_id: null }).eq('id', gameId);
      const total = await recount(db, game);

      await db.from('notifications').insert([
        {
          user_id: callerId, type: 'game_left', title: 'Saída confirmada',
          message: refunded ? 'Saída confirmada. O reembolso será creditado em breve.' : 'Saída confirmada.',
          game_id: gameId,
        },
        {
          user_id: next.player_id, type: 'organizer_transferred', title: 'Você é o novo organizador!',
          message: `O organizador anterior saiu da partida de ${where}. Você agora é o responsável pela partida.`,
          game_id: gameId,
        },
      ]);
      await notifyOthers(db, gameId, [callerId, next.player_id], 'Organizador saiu da partida',
        `O organizador saiu da partida de ${where}. Agora são ${total} jogadores.`);

      return json({ success: true, refunded, newOrganizerId: next.player_id });
    }

    // ── A player leaves / is removed ────────────────────────────────────────
    const { data: gp } = await db.from('game_players')
      .select('player_id, player_name, paid, stripe_payment_intent_id')
      .eq('game_id', gameId).eq('player_id', removed).maybeSingle();
    if (!gp) throw new UserError('Jogador não encontrado na partida');

    // Players of a private game paid in full by the organizer joined for free.
    const joinedFree = !game.is_open && !!game.booking_id && game.pay_mode === 'full';
    let refunded = false;
    let paidSomething = false;
    if (gp.paid && !joinedFree) {
      let piId: string | null = gp.stripe_payment_intent_id ?? null;
      if (!piId) {
        // Older joins stored no PI: find this player's own session for this game.
        const sessions = await stripe.checkout.sessions.list({ limit: 100 });
        const match = sessions.data.find((s: Stripe.Checkout.Session) =>
          s.metadata?.gameId === gameId && s.metadata?.playerId === removed && s.status === 'complete');
        piId = match ? (typeof match.payment_intent === 'string' ? match.payment_intent : match.payment_intent?.id ?? null) : null;
      }
      paidSomething = !!piId;
      if (piId) refunded = await releasePi(stripe, piId);
    }

    await db.from('game_players').delete().eq('game_id', gameId).eq('player_id', removed);
    const total = await recount(db, game);

    const firstName = (gp.player_name ?? 'Jogador').split(' ')[0];
    const message = paidSomething
      ? refunded
        ? byOrganizer ? 'Você foi removido da partida. O reembolso será creditado em breve.' : 'Saída confirmada. O reembolso será creditado em breve.'
        : byOrganizer ? 'Você foi removido da partida. Entre em contato para informações sobre reembolso.' : 'Saída confirmada. Entre em contato com o suporte sobre o reembolso.'
      : byOrganizer ? 'Você foi removido da partida.' : 'Saída confirmada.';
    await db.from('notifications').insert({
      user_id: removed,
      type: byOrganizer ? 'game_removed' : 'game_left',
      title: byOrganizer ? 'Você foi removido da partida' : 'Saída confirmada',
      message,
      game_id: gameId,
    });
    await notifyOthers(db, gameId, [removed], 'Jogador saiu da partida',
      `${firstName} ${byOrganizer ? 'foi removido da' : 'saiu da'} partida de ${where}. Agora são ${total} jogadores.`);

    return json({ success: true, refunded, was_paid: paidSomething });
  } catch (error) {
    if (!(error instanceof UserError)) console.error('[leave-game]', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});
