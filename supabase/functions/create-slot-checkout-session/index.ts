// Checkout for a private game: the organizer books the whole court.
//   payMode 'split' — holds the full court price; others pay their share later
//   payMode 'full'  — holds the full court price; captured 24h before the game
//
// Price, sport and player limits come from the DB; the booking + game are created
// afterwards by the server (_shared/fulfill.ts), never by the browser.
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  METADATA_VERSION, UserError, assertReturnUrl, checkoutExpiresAt, corsHeaders, durationOrNull, json,
  playerRule, round2, serviceFeeFor, wallAddMinutes, wallLabel, wallStart, withSessionId,
} from '../_shared/checkout.ts';
import { customerFor, scheduledCheckoutParams, shouldSchedule } from '../_shared/scheduled.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── JWT verification: the organizer always comes from the token ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);
    const userId = user.id;

    const body = await req.json();
    const successUrl = withSessionId(assertReturnUrl(body.successUrl, 'URL de retorno'));
    const cancelUrl = assertReturnUrl(body.cancelUrl, 'URL de cancelamento');

    const payMode = body.payMode;
    if (payMode !== 'split' && payMode !== 'full') throw new UserError('Forma de pagamento inválida');
    const durationMins = durationOrNull(body.durationMins);
    if (!durationMins) throw new UserError('Duração inválida');
    if (!body.courtId) throw new UserError('courtId é obrigatório');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: court } = await db.from('courts')
      .select('id, name, sport_type, price_per_hour, venues(name)')
      .eq('id', body.courtId).maybeSingle();
    if (!court) throw new UserError('Quadra não encontrada');

    // ── Slot: pre-created (slotId) or dynamic (startTime) ──
    let startTime: string;
    let pricePerHour = Number(court.price_per_hour) || 0;
    const slotMeta: Record<string, string> = {};
    if (body.slotId) {
      const { data: slot } = await db.from('slots')
        .select('id, court_id, start_time, is_available, price_override')
        .eq('id', body.slotId).maybeSingle();
      if (!slot || slot.court_id !== court.id) throw new UserError('Horário não encontrado.');
      if (!slot.is_available) throw new UserError('Este horário já foi reservado.');
      const { data: activeGame } = await db.from('games').select('id').eq('slot_id', slot.id)
        .not('status', 'in', '("expired","cancelled")').maybeSingle();
      if (activeGame) throw new UserError('Este horário já tem uma partida.');
      startTime = slot.start_time;
      if (slot.price_override != null) pricePerHour = Number(slot.price_override);
      slotMeta.slotId = slot.id;
    } else if (typeof body.startTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(body.startTime)) {
      startTime = body.startTime;
      slotMeta.startTime = wallStart(startTime);
    } else {
      throw new UserError('Horário não informado.');
    }
    if (new Date(startTime).getTime() <= Date.now()) throw new UserError('Este horário já passou.');

    // The whole session must still be free.
    const startWall = wallStart(startTime);
    const { data: taken } = await db.from('slots').select('id')
      .eq('court_id', court.id).eq('is_available', false)
      .gte('start_time', startWall).lt('start_time', wallAddMinutes(startWall, durationMins));
    if (taken?.length) throw new UserError('Parte deste horário já foi reservada. Escolha outro horário.');

    if (!pricePerHour) throw new UserError('Preço da quadra não encontrado');
    const courtPrice = round2(pricePerHour * (durationMins / 60));
    const rule = playerRule(court.sport_type);
    const requested = Number(body.maxPlayers);
    const maxPlayers = payMode === 'split'
      ? rule.max
      : (requested >= 2 && requested <= rule.max ? requested : rule.max);

    // Split and Full both hold courtPrice + fee (manual capture), as before.
    const serviceFee = serviceFeeFor(courtPrice);
    // many-to-one embed: PostgREST returns an object, the generated type says array
    const venueName = (court.venues as unknown as { name?: string } | null)?.name ?? '';
    const { date, time } = wallLabel(startTime);
    const endTime = wallAddMinutes(startWall, durationMins).substring(11, 16);
    const isSplit = payMode === 'split';

    const description = `Partida fechada — ${court.name} · ${date} ${time}`;
    const piMetadata = { tipo: 'partida_fechada', courtId: court.id };
    const md: Record<string, string> = {
      kind: 'private_game',
      courtId: court.id,
      ...slotMeta,
      durationMins: String(durationMins),
      payMode,
      sport: court.sport_type,
      maxPlayers: String(maxPlayers),
      pricePerHour: String(pricePerHour),
      courtPrice: String(courtPrice),
    };

    // Mais de 6 dias até a partida: só salva o cartão; a retenção é feita 6 dias antes.
    if (shouldSchedule(startTime)) {
      const scheduled = await stripe.checkout.sessions.create(scheduledCheckoutParams({
        userId,
        customer: await customerFor(stripe, db, userId),
        amount: round2(courtPrice + serviceFee),
        startIso: startTime,
        chargeText: isSplit
          ? 'o valor final é cobrado 2h antes da partida e diminui conforme os jogadores entram'
          : 'cobrado 24h antes da partida',
        leaveHours: 24,
        description,
        piMetadata,
        metadata: md,
        successUrl,
        cancelUrl,
      }));
      return json({ url: scheduled.url, sessionId: scheduled.id, scheduled: true });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      expires_at: checkoutExpiresAt(),
      client_reference_id: userId,
      // Nome/descrição iguais aos do app (Financeiro do gestor) para bater com o Stripe
      payment_intent_data: {
        capture_method: 'manual',
        description,
        metadata: piMetadata,
      },
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(courtPrice * 100),
            product_data: {
              name: `Partida fechada — ${court.name}`,
              description: isSplit
                ? `${venueName} · ${date} · ${time} – ${endTime} · Valor retido até o fim da partida`
                : `${venueName} · ${date} · ${time} – ${endTime} · Valor cobrado 24h antes da partida`,
            },
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(serviceFee * 100),
            product_data: { name: 'Taxa de serviço JoggaHub', description: '8% + R$2,50 por transação' },
          },
          quantity: 1,
        },
      ],
      metadata: { v: METADATA_VERSION, userId, ...md },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return json({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (!(error instanceof UserError)) console.error('[create-slot-checkout-session]', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});
