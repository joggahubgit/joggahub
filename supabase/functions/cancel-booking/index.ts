import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CANCEL_CUTOFF_HOURS = 24;

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

// deno-lint-ignore no-explicit-any
async function sendCancelledEmail(supabase: any, userId: string, title: string, message: string) {
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

    const byOwner = booking.created_by === callerId;

    // A booking with a game (private games) is cancelled through cancel-game, which
    // releases the organizer's hold AND every player's hold, frees the slots and
    // notifies everyone. Same caller token: it re-checks organizer / venue admin
    // and the organizer's 24h cutoff.
    const { data: linkedActiveGame } = await supabase
      .from('games').select('id')
      .eq('booking_id', bookingId)
      .not('status', 'in', '("completed","expired","cancelled","pending_results")')
      .maybeSingle();
    if (linkedActiveGame) {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/cancel-game`, {
        method: 'POST',
        headers: { Authorization: authHeader, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: linkedActiveGame.id }),
      });
      const out = await res.json().catch(() => ({}));
      return new Response(JSON.stringify(out), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Booking without a game (legacy slot booking) ──
    if (byOwner && booking.slot_id) {
      const { data: s0 } = await supabase.from('slots').select('start_time').eq('id', booking.slot_id).maybeSingle();
      if (s0?.start_time && (new Date(s0.start_time).getTime() - Date.now()) / 3600_000 < CANCEL_CUTOFF_HOURS) {
        throw new Error(`Cancelamento não permitido dentro das ${CANCEL_CUTOFF_HOURS}h anteriores ao horário. Entre em contato com o clube.`);
      }
    }

    const isPaid = booking.payment_status === 'paid';
    let stripeRefunded = false;

    // Refund/release: only the booking OWNER's own completed session for this slot
    // (a slot can be booked again later, so slotId alone could match someone else).
    if (isPaid && booking.slot_id) {
      const sessions = await stripe.checkout.sessions.list({ limit: 100 });
      const matching = sessions.data.find((s: Stripe.Checkout.Session) =>
        s.metadata?.slotId === booking.slot_id &&
        s.metadata?.userId === booking.created_by &&
        s.status === 'complete');
      const paymentIntentId = matching
        ? (typeof matching.payment_intent === 'string' ? matching.payment_intent : matching.payment_intent?.id)
        : null;
      if (paymentIntentId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (pi.status === 'succeeded') await stripe.refunds.create({ payment_intent: paymentIntentId });
          else if (pi.status !== 'canceled') await stripe.paymentIntents.cancel(paymentIntentId);
          stripeRefunded = true;
        } catch (e) {
          console.error('[cancel-booking] RELEASE FAILED — refund manually', paymentIntentId, e);
        }
      }
    }

    // Cancel the booking (payment_status constraint: pending|paid|failed|refunded)
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', payment_status: isPaid ? (stripeRefunded ? 'refunded' : 'paid') : 'failed' })
      .eq('id', bookingId);

    // Free up the slot — and the consecutive slots locked for the session, up
    // to the game's real end (a 1h30 booking holds three 30-min slots)
    if (booking.slot_id) {
      const { data: slotRow } = await supabase
        .from('slots').select('court_id, start_time').eq('id', booking.slot_id).single();
      const { data: linkedGame } = await supabase
        .from('games')
        .select('scheduled_end_at')
        .eq('booking_id', bookingId)
        .not('scheduled_end_at', 'is', null)
        .limit(1)
        .maybeSingle();

      if (slotRow && linkedGame?.scheduled_end_at) {
        await supabase
          .from('slots')
          .update({ is_available: true })
          .eq('court_id', slotRow.court_id)
          .gte('start_time', slotRow.start_time.substring(0, 19))
          .lt('start_time', linkedGame.scheduled_end_at.substring(0, 19));
      } else {
        await supabase
          .from('slots')
          .update({ is_available: true })
          .eq('id', booking.slot_id);
      }

      // Cancel any game linked to this slot that wasn't already finished
      await supabase
        .from('games')
        .update({ status: 'cancelled', is_open: false })
        .eq('slot_id', booking.slot_id)
        .not('status', 'in', '("completed","expired","cancelled")');
    }

    // Notify the player
    if (booking.created_by) {
      const who = byOwner ? 'Sua reserva foi cancelada.' : 'Sua reserva foi cancelada pelo clube.';
      const message = isPaid && stripeRefunded
        ? `${who} O reembolso foi processado e será creditado em breve.`
        : isPaid
        ? `${who} Entre em contato para informações sobre reembolso.`
        : who;
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
