import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Fetch game — need slot_id and booking_id to handle private vs open games
    const { data: game } = await supabase
      .from('games')
      .select('slot_id, booking_id')
      .eq('id', gameId)
      .single();

    const slotId = game?.slot_id ?? null;
    const bookingId = game?.booking_id ?? null;
    const isPrivateGame = !!bookingId;

    // ── Authorization: caller must be the venue admin ──
    if (!slotId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }
    const { data: slotData } = await supabase.from('slots').select('court_id').eq('id', slotId).single();
    const { data: courtData } = await supabase.from('courts').select('venue_id').eq('id', slotData?.court_id ?? '').single();
    const { data: venueData } = await supabase.from('venues').select('admin_id').eq('id', courtData?.venue_id ?? '').single();
    if (venueData?.admin_id !== callerId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
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
      // Private game: payment was made via slot checkout session — search by slotId
      const sessions = await stripe.checkout.sessions.list({ limit: 100 });
      const matching = sessions.data.find(
        s => s.metadata?.slotId === slotId && s.payment_status === 'paid'
      );

      if (matching) {
        const paymentIntentId = typeof matching.payment_intent === 'string'
          ? matching.payment_intent
          : matching.payment_intent?.id;

        if (paymentIntentId) {
          try {
            const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
            refunds.push({ name: 'Organizador', status: refund.status });
          } catch (e: any) {
            refunds.push({ name: 'Organizador', status: e.message ?? 'error' });
          }
        }
      } else {
        refunds.push({ name: 'Organizador', status: 'manual_required' });
      }
    } else if (!isPrivateGame && paidPlayers.length > 0) {
      // Open game: payment sessions are tagged with gameId metadata
      const sessions = await stripe.checkout.sessions.list({ limit: 100 });
      const matchingSessions = sessions.data.filter(
        s => s.metadata?.gameId === gameId && s.payment_status === 'paid'
      );

      for (const session of matchingSessions) {
        const playerName = session.metadata?.playerName ?? 'Jogador';
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;

        if (!paymentIntentId) {
          refunds.push({ name: playerName, status: 'no_payment_intent' });
          continue;
        }

        try {
          const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
          refunds.push({ name: playerName, status: refund.status });
        } catch (e: any) {
          refunds.push({ name: playerName, status: e.message ?? 'error' });
        }
      }

      if (matchingSessions.length === 0) {
        for (const p of paidPlayers) {
          refunds.push({ name: p.player_name, status: 'manual_required' });
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
      const refunded = refunds.some(r => r.status === 'succeeded');
      await supabase
        .from('bookings')
        .update({ status: 'cancelled', payment_status: refunded ? 'refunded' : 'failed' })
        .eq('id', bookingId);
    }

    // Free up the slot
    if (slotId) {
      await supabase.from('slots').update({ is_available: true }).eq('id', slotId);
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
      const refunded = refunds.some(r => r.status === 'succeeded');
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
