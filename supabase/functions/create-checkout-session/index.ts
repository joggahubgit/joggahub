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
      gameId,
      playerId,
      playerName,
      courtName,
      venueName,
      sport,
      date,
      time,
      vagaPrice,      // valor da vaga (sem taxa)
      serviceFee,     // taxa de serviço (15%)
      totalPrice,     // vagaPrice + serviceFee
      successUrl,
      cancelUrl,
      mode,           // 'join_self' | 'join_other'
    } = await req.json();

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(vagaPrice * 100),
            product_data: {
              name: `Vaga — ${sport} em ${courtName}`,
              description: `${venueName} · ${date} às ${time}`,
            },
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(serviceFee * 100),
            product_data: {
              name: 'Taxa de serviço JoggaHub',
              description: '15% sobre o valor da vaga',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        gameId: gameId ?? '',
        playerId: playerId ?? '',
        playerName: playerName ?? '',
        mode: mode ?? 'join_self',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
