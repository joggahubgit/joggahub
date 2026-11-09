// O jogador pediu para sair DEPOIS do prazo de desistência grátis (24h antes)
// e o clube autorizou: devolve tudo menos a taxa de serviço JoggaHub
// (8% + R$2,50 sobre o que ele pagou). Só o gestor do clube pode chamar.
//
//   valor retido no cartão → cobra só a taxa (o resto é liberado na hora)
//   valor já cobrado       → reembolsa tudo menos a taxa
//   cartão salvo, sem retenção ainda → só cancela (nada foi cobrado)
//
// Alvos: { enrollmentId } (curso/day use), { gameId, playerId } (sair de uma
// partida) ou { gameId, whole: true } (cancelar a partida fechada inteira).
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { UserError, corsHeaders, json, wallMs, wallNowMs } from '../_shared/checkout.ts';
import { brl, cancelTarget } from '../_shared/scheduled.ts';

const FREE_CANCEL_HOURS = 24;

/** Taxa de serviço contida num valor pago (valor = base × 1,08 + 2,50). */
const feeOf = (paid: number) => Math.round((paid - (paid - 2.5) / 1.08) * 100) / 100;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });

    // ── O que cancelar, de quem é o dinheiro e se o gestor manda nesse clube ──
    let venueId: string | null = null;
    let startIso: string | null = null;
    let piId: string | null = null;
    let payerId: string;
    let what: string;
    // deno-lint-ignore no-explicit-any
    let target: any; // mesmo formato de scheduled_payments, para reaproveitar cancelTarget

    if (typeof body.enrollmentId === 'string') {
      const { data: e } = await db.from('class_enrollments')
        .select('id, class_id, player_id, status, stripe_payment_intent_id, classes(venue_id, title, kind, status)')
        .eq('id', body.enrollmentId).maybeSingle();
      if (!e || e.status !== 'active') throw new UserError('Inscrição não encontrada ou já cancelada.');
      // deno-lint-ignore no-explicit-any
      const cls = (e as any).classes;
      venueId = cls?.venue_id ?? null;
      const { data: first } = await db.from('class_sessions').select('starts_at').eq('class_id', e.class_id).order('starts_at').limit(1).maybeSingle();
      startIso = first?.starts_at ?? null;
      piId = e.stripe_payment_intent_id;
      payerId = e.player_id;
      what = `${cls?.kind === 'day_use' ? 'do day use' : 'do curso'} "${cls?.title ?? ''}"`;
      target = { kind: 'class_enrollment', class_enrollment_id: e.id, user_id: e.player_id, player_id: e.player_id };
    } else if (typeof body.gameId === 'string') {
      const { data: g } = await db.from('games')
        .select('id, status, is_open, organizer_id, slot_id, scheduled_at, stripe_session_id, organizer_payment_intent_id, courts(venue_id, name)')
        .eq('id', body.gameId).maybeSingle();
      if (!g || !['scheduled', 'confirmed_booking'].includes(g.status)) throw new UserError('Partida não encontrada ou não está ativa.');
      // deno-lint-ignore no-explicit-any
      venueId = (g as any).courts?.venue_id ?? null;
      startIso = g.scheduled_at;
      if (g.slot_id) {
        const { data: s } = await db.from('slots').select('start_time').eq('id', g.slot_id).maybeSingle();
        startIso = s?.start_time ?? startIso;
      }
      const whole = body.whole === true;
      payerId = whole ? g.organizer_id : String(body.playerId ?? '');
      if (!payerId) throw new UserError('Jogador não informado.');
      if (whole && g.is_open) throw new UserError('Partida aberta: autorize a saída de cada jogador.');
      const isOrganizer = payerId === g.organizer_id;
      if (!whole && isOrganizer && !g.is_open) throw new UserError('Na partida fechada, autorize o cancelamento da reserva inteira.');
      if (isOrganizer) {
        piId = g.organizer_payment_intent_id ?? null;
        if (!piId && g.stripe_session_id) {
          const s = await stripe.checkout.sessions.retrieve(g.stripe_session_id);
          piId = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
        }
      } else {
        const { data: gp } = await db.from('game_players').select('stripe_payment_intent_id')
          .eq('game_id', g.id).eq('player_id', payerId).maybeSingle();
        if (!gp) throw new UserError('Este jogador não está na partida.');
        piId = gp.stripe_payment_intent_id;
      }
      what = `da partida em ${(g as any).courts?.name ?? 'quadra'}`;
      target = {
        kind: whole ? 'private_game' : isOrganizer ? 'organizer' : 'join',
        game_id: g.id, user_id: payerId, player_id: payerId,
      };
    } else {
      throw new UserError('Informe a inscrição ou a partida.');
    }

    const { data: venue } = await db.from('venues').select('admin_id').eq('id', venueId ?? '').maybeSingle();
    if (!venue || venue.admin_id !== user.id) return json({ error: 'Forbidden' }, 403);

    // Só depois do prazo grátis e antes do início (antes do prazo o jogador sai sozinho, sem custo)
    if (startIso) {
      const left = (wallMs(startIso) - wallNowMs()) / 3600_000;
      if (left > FREE_CANCEL_HOURS) throw new UserError('Ainda está no prazo de desistência grátis: o jogador pode sair pelo app sem custo.');
      if (left <= 0) throw new UserError('A partida/aula já começou.');
    }

    // ── Dinheiro: fica só a taxa ──
    let refunded = 0;
    let fee = 0;
    if (piId) {
      // Marca no Stripe: o que ficar é só a taxa JoggaHub (painel admin e extratos)
      const pi = await stripe.paymentIntents.update(piId, { metadata: { saida_autorizada: '1' } });
      if (pi.status === 'requires_capture') {
        fee = feeOf(pi.amount / 100);
        await stripe.paymentIntents.capture(pi.id, { amount_to_capture: Math.round(fee * 100) },
          { idempotencyKey: `club-cancel-fee-${pi.id}` });
        refunded = pi.amount / 100 - fee; // liberado no cartão (não é cobrado)
      } else if (pi.status === 'succeeded') {
        const paid = (pi.amount_received ?? pi.amount) / 100;
        fee = feeOf(paid);
        refunded = Math.round((paid - fee) * 100) / 100;
        if (refunded > 0) {
          await stripe.refunds.create({ payment_intent: pi.id, amount: Math.round(refunded * 100) },
            { idempotencyKey: `club-cancel-refund-${pi.id}` });
        }
      }
    }

    // ── Vaga: mesma lógica do cancelamento por falta de pagamento ──
    // (curso: cancela a inscrição; partida aberta: tira o jogador / passa a organização;
    //  partida fechada: cancela tudo, libera o horário e as retenções dos outros)
    await cancelTarget(stripe, db, target);
    if (target.kind === 'class_enrollment') {
      await db.from('class_enrollments').update({ refunded: refunded > 0 }).eq('id', target.class_enrollment_id);
    }
    await db.from('scheduled_payments').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .in('status', ['scheduled', 'failed'])
      .eq(target.kind === 'class_enrollment' ? 'class_enrollment_id' : 'game_id',
          target.kind === 'class_enrollment' ? target.class_enrollment_id : target.game_id)
      .eq('user_id', payerId);

    await db.from('notifications').insert({
      user_id: payerId, type: 'game_left', title: 'Saída autorizada pelo clube',
      message: fee > 0
        ? `O clube autorizou sua saída ${what}. Devolvemos ${brl(refunded)}; a taxa de serviço de ${brl(fee)} não é devolvida.`
        : `O clube autorizou sua saída ${what}. Nada foi cobrado.`,
      game_id: target.game_id ?? null,
    });

    return json({ success: true, refunded, fee });
  } catch (error) {
    if (error instanceof UserError) return json({ error: error.message }, 400);
    console.error('[club-authorize-cancel]', error);
    return json({ error: (error as Error).message ?? 'Erro ao autorizar cancelamento' }, 500);
  }
});
