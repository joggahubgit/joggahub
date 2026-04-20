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
    const { bookingId } = await req.json();
    if (!bookingId) throw new Error('bookingId is required');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch booking details
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, slot_id, created_by, payment_status, total_price, status')
      .eq('id', bookingId)
      .single();

    if (bookErr || !booking) throw new Error('Reserva não encontrada');
    if (booking.status === 'cancelled') throw new Error('Reserva já cancelada');

    const isPaid = booking.payment_status === 'paid';
    let stripeRefunded = false;

    // Attempt Stripe refund for paid bookings (same as cancel-game)
    if (isPaid && booking.slot_id) {
      const sessions = await stripe.checkout.sessions.list({ limit: 100 });
      const matching = sessions.data.find(
        s => s.metadata?.slotId === booking.slot_id && s.payment_status === 'paid'
      );

      if (matching) {
        const paymentIntentId = typeof matching.payment_intent === 'string'
          ? matching.payment_intent
          : matching.payment_intent?.id;

        if (paymentIntentId) {
          try {
            await stripe.refunds.create({ payment_intent: paymentIntentId });
            stripeRefunded = true;
          } catch (_) {
            // Refund failed — will fall back to manual notice in UI
          }
        }
      }
    }

    // Cancel the booking (payment_status constraint: pending|paid|failed|refunded)
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', payment_status: isPaid ? 'refunded' : 'failed' })
      .eq('id', bookingId);

    // Free up the slot
    if (booking.slot_id) {
      await supabase
        .from('slots')
        .update({ is_available: true })
        .eq('id', booking.slot_id);

      // Cancel any game linked to this slot that wasn't already finished
      await supabase
        .from('games')
        .update({ status: 'cancelled', is_open: false })
        .eq('slot_id', booking.slot_id)
        .not('status', 'in', '("completed","expired","cancelled")');
    }

    // Notify the player
    if (booking.created_by) {
      await supabase.from('notifications').insert({
        user_id: booking.created_by,
        type: 'booking_cancelled',
        title: 'Reserva cancelada',
        message: isPaid && stripeRefunded
          ? 'Sua reserva foi cancelada pelo clube. O reembolso foi processado e será creditado em breve.'
          : isPaid
          ? 'Sua reserva foi cancelada pelo clube. Entre em contato para informações sobre reembolso.'
          : 'Sua reserva foi cancelada pelo clube.',
        game_id: null,
      });
    }

    return new Response(
      JSON.stringify({ success: true, was_paid: isPaid, stripe_refunded: stripeRefunded }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
