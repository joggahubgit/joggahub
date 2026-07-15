import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CANCEL_CUTOFF_HOURS = 24;
const OPEN_GAME_MIN_PLAYERS = 10;

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

    const { gameId, targetPlayerId } = await req.json();
    if (!gameId) throw new Error('gameId is required');

    // targetPlayerId is set when organizer removes another player
    const playerBeingRemoved: string = targetPlayerId ?? callerId;
    const isOrganizerRemoving = !!targetPlayerId && targetPlayerId !== callerId;

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch game
    const { data: game } = await supabase
      .from('games')
      .select('id, organizer_id, slot_id, status, current_players')
      .eq('id', gameId)
      .single();

    if (!game) throw new Error('Partida não encontrada');
    if (!['scheduled', 'confirmed_booking'].includes(game.status)) {
      throw new Error('Partida não está ativa');
    }

    // Authorization: caller must be the player themselves or the organizer
    if (callerId !== playerBeingRemoved && callerId !== game.organizer_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    // Check cutoff: must be before 24h before game start
    if (game.slot_id) {
      const { data: slot } = await supabase
        .from('slots')
        .select('start_time')
        .eq('id', game.slot_id)
        .single();

      if (slot?.start_time) {
        const hoursUntil = (new Date(slot.start_time).getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntil < CANCEL_CUTOFF_HOURS) {
          throw new Error('Cancelamento não permitido dentro das 24h anteriores à partida');
        }
      }
    }

    // Fetch player's game_players row
    const { data: gp } = await supabase
      .from('game_players')
      .select('player_id, player_name, paid, stripe_payment_intent_id')
      .eq('game_id', gameId)
      .eq('player_id', playerBeingRemoved)
      .single();

    if (!gp) throw new Error('Jogador não encontrado na partida');

    // Release payment: cancel hold if not yet captured, otherwise refund
    let refunded = false;
    if (gp.paid) {
      let paymentIntentId: string | null = gp.stripe_payment_intent_id ?? null;

      // Fallback: search checkout sessions by gameId + playerId
      // payment_status 'unpaid' = hold authorized but not captured
      if (!paymentIntentId) {
        const sessions = await stripe.checkout.sessions.list({ limit: 100 });
        const match = sessions.data.find(
          s => s.metadata?.gameId === gameId &&
               s.metadata?.playerId === playerBeingRemoved &&
               (s.payment_status === 'paid' || s.payment_status === 'unpaid'),
        );
        if (match) {
          paymentIntentId = typeof match.payment_intent === 'string'
            ? match.payment_intent
            : (match.payment_intent?.id ?? null);
        }
      }

      if (paymentIntentId) {
        try {
          // Try to cancel hold (PI in requires_capture state) — no Stripe fee
          await stripe.paymentIntents.cancel(paymentIntentId);
          refunded = true;
        } catch (_) {
          // PI already captured — refund instead
          try {
            await stripe.refunds.create({ payment_intent: paymentIntentId });
            refunded = true;
          } catch (_2) {
            // Both failed — player will be notified to contact support
          }
        }
      }
    }

    // Remove player and decrement count
    await supabase.from('game_players').delete().eq('game_id', gameId).eq('player_id', playerBeingRemoved);
    const newPlayerCount = game.current_players - 1;
    const gameUpdate: Record<string, unknown> = { current_players: newPlayerCount };

    // Open game: if confirmed_booking drops below minimum, revert to scheduled so new players can join
    if (game.status === 'confirmed_booking' && newPlayerCount < OPEN_GAME_MIN_PLAYERS) {
      const { data: gameRow } = await supabase.from('games').select('is_open').eq('id', gameId).single();
      if (gameRow?.is_open) {
        gameUpdate.status = 'scheduled';
      }
    }

    await supabase.from('games').update(gameUpdate).eq('id', gameId);

    // Notify the player being removed
    const message = gp.paid
      ? refunded
        ? isOrganizerRemoving
          ? 'Você foi removido da partida. O reembolso será creditado em breve.'
          : 'Saída confirmada. O reembolso será creditado em breve.'
        : isOrganizerRemoving
          ? 'Você foi removido da partida. Entre em contato para informações sobre reembolso.'
          : 'Saída confirmada. Entre em contato com o suporte sobre o reembolso.'
      : isOrganizerRemoving
        ? 'Você foi removido da partida.'
        : 'Saída confirmada.';

    await supabase.from('notifications').insert({
      user_id: playerBeingRemoved,
      type: isOrganizerRemoving ? 'game_removed' : 'game_left',
      title: isOrganizerRemoving ? 'Você foi removido da partida' : 'Saída confirmada',
      message,
      game_id: gameId,
    });

    return new Response(
      JSON.stringify({ success: true, refunded, was_paid: gp.paid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
