import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cancel hold (requires_capture) or refund if already captured
async function cancelOrReleasePi(stripe: Stripe, piId: string): Promise<void> {
  try {
    await stripe.paymentIntents.cancel(piId);
  } catch (_) {
    await stripe.refunds.create({ payment_intent: piId });
  }
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

    const { gameId } = await req.json();
    if (!gameId) throw new Error('gameId is required');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch game — need slot_id, booking_id, organizer_id, is_open, and stripe_session_id for hold release
    const { data: game } = await supabase
      .from('games')
      .select('slot_id, booking_id, scheduled_end_at, organizer_id, is_open, stripe_session_id')
      .eq('id', gameId)
      .single();

    const slotId = game?.slot_id ?? null;
    const bookingId = game?.booking_id ?? null;
    const isPrivateGame = !!bookingId;
    const isOpenGame = game?.is_open === true;

    // ── Authorization: venue admin OR organizer of an open game ──
    const isOrganizerCancelling = isOpenGame && game?.organizer_id === callerId;

    // Fetch slot data upfront — needed for auth check and slot release
    const { data: slotData } = slotId
      ? await supabase.from('slots').select('court_id, start_time').eq('id', slotId).single()
      : { data: null };

    if (!isOrganizerCancelling) {
      if (!slotId || !slotData) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
      }
      const { data: courtData } = await supabase.from('courts').select('venue_id').eq('id', slotData.court_id ?? '').single();
      const { data: venueData } = await supabase.from('venues').select('admin_id').eq('id', courtData?.venue_id ?? '').single();
      if (venueData?.admin_id !== callerId) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
      }
    }

    // Fetch organizer from booking (private game) for notifications
    let organizerId: string | null = null;
    if (isPrivateGame) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('created_by')
        .eq('id', bookingId)
        .single();
      organizerId = booking?.created_by ?? null;
    }

    // Get all players for this game (open game players)
    const { data: gamePlayers } = await supabase
      .from('game_players')
      .select('player_id, player_name, paid')
      .eq('game_id', gameId);

    const allPlayers = gamePlayers ?? [];
    const paidPlayers = allPlayers.filter(p => p.paid);
    const refunds: { name: string; status: string }[] = [];

    if (isPrivateGame && slotId) {
      // Private game: resolve PI from stripe_session_id (if stored) or search by slotId
      let paymentIntentId: string | null = null;

      if (game?.stripe_session_id) {
        try {
          const orgSession = await stripe.checkout.sessions.retrieve(game.stripe_session_id);
          paymentIntentId = typeof orgSession.payment_intent === 'string'
            ? orgSession.payment_intent
            : orgSession.payment_intent?.id ?? null;
        } catch (_) { /* fall through to slotId search */ }
      }

      if (!paymentIntentId) {
        // Fallback: search by slotId (covers old games without stripe_session_id)
        const sessions = await stripe.checkout.sessions.list({ limit: 100 });
        const matching = sessions.data.find(
          s => s.metadata?.slotId === slotId &&
               (s.payment_status === 'paid' || s.payment_status === 'unpaid'),
        );
        if (matching) {
          paymentIntentId = typeof matching.payment_intent === 'string'
            ? matching.payment_intent
            : matching.payment_intent?.id ?? null;
        }
      }

      if (paymentIntentId) {
        try {
          await cancelOrReleasePi(stripe, paymentIntentId);
          refunds.push({ name: 'Organizador', status: 'released' });
        } catch (e: any) {
          refunds.push({ name: 'Organizador', status: e.message ?? 'error' });
        }
      } else {
        refunds.push({ name: 'Organizador', status: 'manual_required' });
      }
    } else if (!isPrivateGame) {
      // Open game: cancel each player's hold via game_players.stripe_payment_intent_id
      const { data: playersWithPI } = await supabase
        .from('game_players')
        .select('player_id, player_name, stripe_payment_intent_id')
        .eq('game_id', gameId)
        .not('stripe_payment_intent_id', 'is', null);

      for (const gp of playersWithPI ?? []) {
        try {
          await cancelOrReleasePi(stripe, gp.stripe_payment_intent_id!);
          refunds.push({ name: gp.player_name, status: 'released' });
        } catch (e: any) {
          refunds.push({ name: gp.player_name, status: e.message ?? 'error' });
        }
      }

      // Organizer's hold is via games.stripe_session_id (gameId was '' at checkout time)
      if (game?.stripe_session_id) {
        try {
          const orgSession = await stripe.checkout.sessions.retrieve(game.stripe_session_id);
          const orgPI = typeof orgSession.payment_intent === 'string'
            ? orgSession.payment_intent
            : orgSession.payment_intent?.id;
          if (orgPI) {
            await cancelOrReleasePi(stripe, orgPI);
            refunds.push({ name: 'Organizador', status: 'released' });
          }
        } catch (e: any) {
          refunds.push({ name: 'Organizador', status: e.message ?? 'error' });
        }
      }
    }

    // Cancel game
    await supabase
      .from('games')
      .update({ is_open: false, slot_id: null, status: 'cancelled' })
      .eq('id', gameId);

    // For private games: also cancel the associated booking
    if (isPrivateGame) {
      const refunded = refunds.some(r => r.status === 'released');
      await supabase
        .from('bookings')
        .update({ status: 'cancelled', payment_status: refunded ? 'refunded' : 'failed' })
        .eq('id', bookingId);
    }

    // Free up the slot (and all consecutive slots blocked for this session)
    if (slotId) {
      if (game?.scheduled_end_at && slotData?.start_time) {
        await supabase.from('slots')
          .update({ is_available: true })
          .eq('court_id', slotData.court_id)
          .gte('start_time', slotData.start_time.substring(0, 19))
          .lt('start_time', game.scheduled_end_at.substring(0, 19));
      } else {
        await supabase.from('slots').update({ is_available: true }).eq('id', slotId);
      }
    }

    // Notify open game players
    if (allPlayers.length > 0) {
      await supabase.from('notifications').insert(
        allPlayers.map(p => ({
          user_id: p.player_id,
          type: 'game_cancelled',
          title: 'Partida cancelada',
          message: p.paid
            ? 'A partida em que você estava inscrito foi cancelada. O reembolso será processado em breve.'
            : 'A partida em que você estava inscrito foi cancelada.',
          game_id: gameId,
        })),
      );
    }

    // Notify organizer for private games
    if (isPrivateGame && organizerId) {
      const refunded = refunds.some(r => r.status === 'released');
      await supabase.from('notifications').insert({
        user_id: organizerId,
        type: 'game_cancelled',
        title: 'Partida privada cancelada',
        message: refunded
          ? 'Sua partida privada foi cancelada. O reembolso será creditado em breve.'
          : 'Sua partida privada foi cancelada. Entre em contato para informações sobre reembolso.',
        game_id: gameId,
      });
    }

    return new Response(
      JSON.stringify({ success: true, refunds }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
