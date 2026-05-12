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
        .select('court_id, price_override')
        .eq('id', slotId)
        .single();
      if (slot?.price_override != null) {
        courtPrice = slot.price_override as number;
      } else {
        const eid = slot?.court_id ?? courtId;
        const { data: court } = await supabase.from('courts').select('price_per_hour').eq('id', eid).single();
        courtPrice = (court?.price_per_hour as number) ?? null;
      }
    } else {
      const { data: court } = await supabase.from('courts').select('price_per_hour').eq('id', courtId).single();
      courtPrice = (court?.price_per_hour as number) ?? null;
    }

    if (!courtPrice) throw new Error('Preço da quadra não encontrado');

    const isSplit = payMode === 'split';
    // Split: hold = courtPrice × 1.15 (captures only organizer share at cutoff)
    // Full: price = courtPrice (organizer pays the full court)
    const price = isSplit
      ? Math.round(courtPrice * 1.15 * 100) / 100
      : courtPrice;

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
        userId,
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
