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
    // playerId always comes from the verified JWT
    const playerId = user.id;

    const {
      gameId,
      playerName,
      courtName,
      venueName,
      sport,
      date,
      time,
      slotId,
      courtId,
      durationMins: reqDuration,
      successUrl,
      cancelUrl,
      mode,           // 'organizer' | 'join_self' | 'join_other' | 'pay_reservation'
      captureManual,  // when true: authorize hold, do not capture immediately
    } = await req.json();

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Fetch price from DB — never trust body for financial values ──
    let vagaPrice: number;

    if (mode === 'organizer' && !gameId) {
      // Game doesn't exist yet — price comes from slot/court
      const durationMins = [90, 120].includes(Number(reqDuration)) ? Number(reqDuration) : null;
      if (!durationMins) throw new Error('Duração inválida');

      const { data: slot } = await supabase
        .from('slots')
        .select('court_id, price_override')
        .eq('id', slotId)
        .single();
      const eid = slot?.court_id ?? courtId;
      const { data: court } = await supabase.from('courts').select('price_per_hour').eq('id', eid).single();
      const pricePerHour = (slot?.price_override as number) ?? (court?.price_per_hour as number) ?? null;
      if (!pricePerHour) throw new Error('Preço da quadra não encontrado');
      const courtPrice = Math.round(pricePerHour * (durationMins / 60) * 100) / 100;
      vagaPrice = Math.round(courtPrice / 10 * 100) / 100;
    } else {
      const { data: game, error: gameErr } = await supabase
        .from('games')
        .select('price_per_player')
        .eq('id', gameId)
        .single();
      if (gameErr || !game) throw new Error('Jogo não encontrado');
      vagaPrice = game.price_per_player as number;
    }
    // Service fee: 8% + R$2,50 per transaction
    const serviceFee = Math.round((vagaPrice * 0.08 + 2.50) * 100) / 100;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      ...(captureManual ? { payment_intent_data: { capture_method: 'manual' } } : {}),
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
              description: '8% + R$2,50 por transação',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        gameId: gameId ?? '',
        playerId,
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
