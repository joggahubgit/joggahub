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
    const { sessionId, captureAmount } = await req.json();

    if (!sessionId || !captureAmount) {
      throw new Error('sessionId e captureAmount são obrigatórios');
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    // Retrieve the checkout session to get the payment intent ID
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paymentIntentId = session.payment_intent as string;
    if (!paymentIntentId) throw new Error('Payment intent não encontrado na sessão');

    // Partially capture: only the organizer's share — the remaining hold stays on the card
    const pi = await stripe.paymentIntents.capture(paymentIntentId, {
      amount_to_capture: Math.round(captureAmount * 100), // dollars → cents
    });

    return new Response(
      JSON.stringify({ success: true, paymentIntentId, status: pi.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
