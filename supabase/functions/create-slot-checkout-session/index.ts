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
    // userId always comes from the verified JWT
    const userId = user.id;

    const {
      slotId,
      courtId,
      courtName,
      venueName,
      date,
      time,
      endTime,
      payMode,      // 'split' | 'full' | undefined
      successUrl,
      cancelUrl,
    } = await req.json();

    if (!courtId) throw new Error('courtId é obrigatório');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Fetch price from DB — never trust body for financial values ──
    let courtPrice: number | null = null;

    if (slotId) {
      const { data: slot } = await supabase
        .from('slots')
        .select('court_id, price_override, start_time, end_time')
        .eq('id', slotId)
        .single();
      if (slot?.price_override != null) {
        courtPrice = slot.price_override as number;
      } else {
        const eid = slot?.court_id ?? courtId;
        const { data: court } = await supabase.from('courts').select('price_per_hour').eq('id', eid).single();
        const pricePerHour = (court?.price_per_hour as number) ?? null;
        if (pricePerHour && slot?.start_time && slot?.end_time) {
          const durationHours = (new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / 3_600_000;
          courtPrice = Math.round(pricePerHour * durationHours * 100) / 100;
        } else {
          courtPrice = pricePerHour;
        }
      }
    } else {
      const { data: court } = await supabase.from('courts').select('price_per_hour').eq('id', courtId).single();
      courtPrice = (court?.price_per_hour as number) ?? null;
    }

    if (!courtPrice) throw new Error('Preço da quadra não encontrado');

    const isSplit = payMode === 'split';
    // Service fee: 8% + R$2,50 per transaction (same model as create-checkout-session)
    const serviceFee = Math.round((courtPrice * 0.08 + 2.50) * 100) / 100;
    // Split: hold = courtPrice + serviceFee as guarantee (manual capture at cutoff)
    // Full: charge courtPrice + serviceFee immediately
    const totalCharge = Math.round((courtPrice + serviceFee) * 100) / 100;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      ...(isSplit && {
        payment_intent_data: {
          capture_method: 'manual',
        },
      }),
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(courtPrice * 100),
            product_data: {
              name: isSplit ? `Garantia de reserva — ${courtName}` : `Reserva — ${courtName}`,
              description: isSplit
                ? `${venueName} · ${date} · ${time}${endTime ? ` – ${endTime}` : ''} · Valor retido até o fim da partida`
                : `${venueName} · ${date} · ${time}${endTime ? ` – ${endTime}` : ''}`,
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
        mode: 'slot',
        slotId: slotId ?? '',
        courtId: courtId ?? '',
        userId,
        payMode: payMode ?? 'full',
        courtPrice: String(courtPrice),
        totalCharge: String(totalCharge),
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
