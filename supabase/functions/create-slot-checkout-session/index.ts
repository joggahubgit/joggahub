import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      slotId,
      courtId,
      userId,
      courtName,
      venueName,
      date,
      time,
      endTime,
      price,        // amount to authorize (full court price + fee for split, organizer share + fee for full)
      payMode,      // 'split' | 'full' | undefined
      successUrl,
      cancelUrl,
    } = await req.json();

    if (!userId || !price || !courtId) throw new Error('userId, courtId e price são obrigatórios');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const isSplit = payMode === 'split';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      // For split payments: authorize the full court price but only capture the organizer's share later
      ...(isSplit && {
        payment_intent_data: {
          capture_method: 'manual',
        },
      }),
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(price * 100),
            product_data: {
              name: isSplit ? `Garantia de reserva — ${courtName}` : `Reserva — ${courtName}`,
              description: isSplit
                ? `${venueName} · ${date} · ${time}${endTime ? ` – ${endTime}` : ''} · Valor retido até o fim da partida`
                : `${venueName} · ${date} · ${time}${endTime ? ` – ${endTime}` : ''}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        mode: 'slot',
        slotId: slotId ?? '',
        courtId: courtId ?? '',
        userId: userId ?? '',
        payMode: payMode ?? 'full',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
