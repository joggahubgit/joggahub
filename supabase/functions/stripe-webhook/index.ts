import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16',
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  // Only handle checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};
  const mode = metadata.mode ?? '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // Determine payment intent ID and whether this is a hold (manual capture)
    const piId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

    let isHold = false;
    if (piId) {
      const pi = await stripe.paymentIntents.retrieve(piId);
      isHold = pi.capture_method === 'manual';
    }

    // ── SLOT / PRIVATE GAME ──────────────────────────────────────────────────
    // Created by create-slot-checkout-session (PrivateGameReview.tsx)
    if (mode === 'slot') {
      const { slotId, userId, payMode } = metadata;

      if (payMode === 'split' || isHold) {
        // Hold authorized — store stripe_session_id on the game for later capture by cron
        // Game record may not exist yet (created by PaymentSuccess); update if it does
        if (slotId && session.id) {
          await supabase
            .from('games')
            .update({ stripe_session_id: session.id })
            .eq('slot_id', slotId)
            .not('status', 'in', '("cancelled","expired","completed")');
        }
      } else {
        // Full payment — confirm slot booking idempotently
        await handleSlotConfirm(supabase, slotId, userId, session);
      }
    }

    // ── OPEN GAME JOIN ───────────────────────────────────────────────────────
    // join_self: player paying to join an open game
    // join_other: player paying for another player's slot
    else if (mode === 'join_self' || mode === 'join_other') {
      const { gameId, playerId, playerName } = metadata;
      if (!gameId || !playerId) throw new Error('Missing gameId or playerId in metadata');

      if (isHold) {
        // Split private game joiner hold — store PI ID for capture at cutoff
        if (piId) {
          await supabase
            .from('game_players')
            .update({ stripe_payment_intent_id: piId })
            .eq('game_id', gameId)
            .eq('player_id', playerId);
        }
      } else {
        // Immediate capture — insert player and increment count (idempotent)
        await handleGameJoin(supabase, gameId, playerId, playerName ?? '');
      }
    }

    // ── PAY RESERVATION ──────────────────────────────────────────────────────
    // Player paying for a booking created manually by the gestor
    else if (mode === 'pay_reservation') {
      const { gameId, playerId } = metadata;
      if (!gameId || !playerId) throw new Error('Missing gameId or playerId in metadata');

      // Mark player as paid
      await supabase
        .from('game_players')
        .update({ paid: true })
        .eq('game_id', gameId)
        .eq('player_id', playerId);

      // Mark linked booking as paid
      const { data: game } = await supabase
        .from('games')
        .select('booking_id')
        .eq('id', gameId)
        .single();

      if (game?.booking_id) {
        await supabase
          .from('bookings')
          .update({ payment_status: 'paid' })
          .eq('id', game.booking_id);
      }
    }

    // ── ORGANIZER (open game) ─────────────────────────────────────────────────
    // Game record is created by PaymentSuccess.tsx using URL params not available here.
    // Webhook cannot replicate this flow — PaymentSuccess remains the source of truth.
    // If PaymentSuccess fails, user should contact support.

  } catch (err) {
    // Log but always return 200 — non-2xx causes Stripe to retry indefinitely
    console.error('Webhook handler error:', err);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function handleSlotConfirm(
  supabase: any,
  slotId: string,
  userId: string,
  session: Stripe.Checkout.Session,
) {
  if (!slotId || !userId) return;

  // Check for existing non-cancelled booking (idempotency guard)
  const { data: existing } = await supabase
    .from('bookings')
    .select('id, payment_status')
    .eq('slot_id', slotId)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (existing) {
    // Booking exists — ensure payment_status is marked paid
    if (existing.payment_status !== 'paid') {
      await supabase
        .from('bookings')
        .update({ payment_status: 'paid', status: 'confirmed' })
        .eq('id', existing.id);
    }
  } else {
    // Create booking
    const { data: slot } = await supabase
      .from('slots')
      .select('court_id, price_override')
      .eq('id', slotId)
      .single();

    await supabase.from('bookings').insert({
      slot_id: slotId,
      created_by: userId,
      court_id: slot?.court_id ?? null,
      total_price: (session.amount_total ?? 0) / 100,
      payment_status: 'paid',
      status: 'confirmed',
    });
  }

  // Ensure slot is blocked
  await supabase
    .from('slots')
    .update({ is_available: false })
    .eq('id', slotId);
}

async function handleGameJoin(
  supabase: any,
  gameId: string,
  playerId: string,
  playerName: string,
) {
  // Attempt insert — ON CONFLICT (game_id, player_id) DO NOTHING (idempotency)
  const { error: insertErr } = await supabase.from('game_players').insert({
    game_id: gameId,
    player_id: playerId,
    player_name: playerName,
    paid: true,
  });

  const isNewRow = !insertErr || insertErr.code !== '23505';

  // Mark paid if row already existed (webhook arrived after PaymentSuccess)
  if (insertErr?.code === '23505') {
    await supabase
      .from('game_players')
      .update({ paid: true })
      .eq('game_id', gameId)
      .eq('player_id', playerId);
    return; // current_players already incremented by PaymentSuccess
  }

  if (insertErr && insertErr.code !== '23505') {
    throw new Error(`game_players insert error: ${insertErr.message}`);
  }

  // Increment current_players only if this was a genuinely new row
  if (isNewRow) {
    const { data: game } = await supabase
      .from('games')
      .select('current_players, max_players, sport_type, status')
      .eq('id', gameId)
      .single();

    if (!game) return;

    const newCount = (game.current_players ?? 0) + 1;

    // Confirm game if it reaches minimum players
    const minPlayers = 10; // matches gameConfig DEFAULT_MIN_PLAYERS
    const shouldConfirm = game.status === 'scheduled' && newCount >= minPlayers;

    await supabase
      .from('games')
      .update({
        current_players: newCount,
        ...(shouldConfirm && { status: 'confirmed_booking' }),
      })
      .eq('id', gameId);
  }
}
