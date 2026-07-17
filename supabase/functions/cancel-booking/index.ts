import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function cancelledEmailHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb; padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#6d28d9); padding:32px 32px 28px; text-align:center;">
          <div style="font-size:28px; margin-bottom:4px;">⚽</div>
          <div style="color:#ffffff; font-size:20px; font-weight:700;">JoggaHub</div>
        </td></tr>
        <tr><td style="padding:36px 32px 32px;">
          <h1 style="margin:0 0 12px; font-size:20px; font-weight:700; color:#111827;">${title}</h1>
          <p style="margin:0; font-size:15px; line-height:1.6; color:#4b5563;">${message}</p>
        </td></tr>
        <tr><td style="padding:20px 32px; background-color:#f9fafb; border-top:1px solid #f0f0f0;" align="center">
          <p style="margin:0; font-size:12px; color:#9ca3af;">JoggaHub · Reserve quadras e monte sua partida</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendCancelledEmail(supabase: ReturnType<typeof createClient>, userId: string, title: string, message: string) {
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (!email) return;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'JoggaHub <confirmacao@joggahub.com>',
        to: email,
        subject: title,
        html: cancelledEmailHtml(title, message),
      }),
    });
  } catch (e) {
    console.error('[cancel-booking] email send failed:', e);
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

    // ── Authorization: caller must be booking owner or venue admin ──
    if (booking.created_by !== callerId) {
      let isVenueAdmin = false;
      if (booking.slot_id) {
        const { data: slotData } = await supabase.from('slots').select('court_id').eq('id', booking.slot_id).single();
        const { data: courtData } = await supabase.from('courts').select('venue_id').eq('id', slotData?.court_id ?? '').single();
        const { data: venueData } = await supabase.from('venues').select('admin_id').eq('id', courtData?.venue_id ?? '').single();
        isVenueAdmin = venueData?.admin_id === callerId;
      }
      if (!isVenueAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
      }
    }

    const isPaid = booking.payment_status === 'paid';
    let stripeRefunded = false;

    // Attempt Stripe refund for paid bookings
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
      const message = isPaid && stripeRefunded
        ? 'Sua reserva foi cancelada pelo clube. O reembolso foi processado e será creditado em breve.'
        : isPaid
        ? 'Sua reserva foi cancelada pelo clube. Entre em contato para informações sobre reembolso.'
        : 'Sua reserva foi cancelada pelo clube.';
      await supabase.from('notifications').insert({
        user_id: booking.created_by,
        type: 'booking_cancelled',
        title: 'Reserva cancelada',
        message,
        game_id: null,
      });
      await sendCancelledEmail(supabase, booking.created_by, 'Reserva cancelada', message);
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
