// Cartão salvo: retém o valor 6 dias antes do início e cuida das recusas.
// Chamada pelo cron a cada 5 minutos. Pode ser chamada a qualquer momento: só
// age sobre o que já venceu, e cada passo é idempotente.
//
//  1. Retenção agendada vencida (hold_at <= agora) → retém no cartão salvo
//     (sem o jogador presente). Daí em diante segue igual a uma retenção feita
//     na hora: as cobranças de 2h/24h antes já encontram o pagamento.
//     Banco recusou / pediu autenticação → avisa o jogador ("Pagar agora", 24h).
//  2. Prazo do "Pagar agora" vencido → cancela a vaga e avisa jogador e clube.

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/checkout.ts';
import {
  RETRY_HOURS, attachHold, brl, cancelTarget, sendServerEmail, siteUrl, targetAlive, wallIso, wallLabelMinus, wallNowMs,
  type ScheduledPayment,
} from '../_shared/scheduled.ts';

/** Hora real → "seg, 10/11 às 19:05" (Brasília). */
const realLabel = (ms: number) =>
  wallLabelMinus(new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T'));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
  const out = { held: 0, failed: 0, cancelled: 0, expired: 0, errors: [] as string[] };

  // ── 1. Retenções que venceram ──
  const { data: due, error } = await db.from('scheduled_payments').select('*')
    .eq('status', 'scheduled').lte('hold_at', wallIso(wallNowMs())).order('hold_at').limit(40);
  if (error) return json({ error: error.message }, 500);

  for (const sp of (due ?? []) as ScheduledPayment[]) {
    try {
      if (!(await targetAlive(db, sp))) {
        await db.from('scheduled_payments').update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', sp.id).eq('status', 'scheduled');
        out.cancelled++;
        continue;
      }
      let pi: Stripe.PaymentIntent | null = null;
      let failure: string | null = null;
      try {
        pi = await stripe.paymentIntents.create({
          amount: Math.round(Number(sp.amount) * 100),
          currency: 'brl',
          customer: sp.customer_id,
          payment_method: sp.payment_method_id,
          off_session: true,
          confirm: true,
          capture_method: 'manual',
          description: sp.description,
          metadata: { ...(sp.pi_metadata ?? {}), agendado: '1', scheduledPaymentId: sp.id },
        }, { idempotencyKey: `scheduled-hold-${sp.id}` });
        if (pi.status !== 'requires_capture') failure = `Pagamento ficou em ${pi.status}`;
      } catch (e) {
        // deno-lint-ignore no-explicit-any
        const err = e as any;
        if (err?.type === 'StripeCardError' || err?.code === 'authentication_required' || err?.raw?.payment_intent) {
          failure = err.message ?? 'Cartão recusado';
        } else {
          throw e; // rede/Stripe fora: tenta de novo na próxima rodada
        }
      }

      if (!failure && pi) {
        if (await attachHold(db, sp, pi.id, 'scheduled')) {
          out.held++;
          await db.from('notifications').insert({
            user_id: sp.user_id, type: 'payment_held', title: 'Valor reservado no cartão',
            message: `Reservamos ${brl(Number(sp.amount))} no seu cartão para ${sp.description}. A cobrança acontece perto do horário.`,
            game_id: sp.game_id ?? null,
          });
        } else {
          await stripe.paymentIntents.cancel(pi.id).catch(() => {});
        }
        continue;
      }

      // Recusado: o jogador tem 24h para pagar
      if (pi && pi.status !== 'canceled') await stripe.paymentIntents.cancel(pi.id).catch(() => {});
      const deadlineMs = Date.now() + RETRY_HOURS * 3600_000;
      const { data: marked } = await db.from('scheduled_payments').update({
        status: 'failed', error: (failure ?? '').substring(0, 300), pay_deadline: new Date(deadlineMs).toISOString(),
        attempts: (sp.attempts ?? 0) + 1, updated_at: new Date().toISOString(),
      }).eq('id', sp.id).eq('status', 'scheduled').select('id');
      if (!marked?.length) continue;
      out.failed++;
      const link = `${siteUrl()}/pagamento-pendente/${sp.id}`;
      await db.from('notifications').insert({
        user_id: sp.user_id, type: 'payment_failed', title: 'Pagamento pendente: pague para manter a vaga',
        message: `Seu banco recusou a reserva de ${brl(Number(sp.amount))} para ${sp.description}. Pague até ${realLabel(deadlineMs)} em "Pagar agora", senão a vaga é cancelada.`,
        game_id: sp.game_id ?? null,
      });
      await sendServerEmail(db, sp.user_id, 'Pagamento pendente — pague para manter sua vaga', 'Seu banco recusou o pagamento',
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#4b5563;">Tentamos reservar <b>${brl(Number(sp.amount))}</b> no seu cartão para <b>${sp.description}</b> (início ${wallLabelMinus(sp.starts_at)}), mas o banco recusou.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#111827;">Pague até <b>${realLabel(deadlineMs)}</b> para manter sua vaga. Depois disso ela é cancelada.</p>
<p style="margin:0 0 20px;"><a href="${link}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Pagar agora</a></p>
<p style="margin:0;font-size:13px;color:#6b7280;">Você pode usar outro cartão.</p>`);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error('[process-scheduled-payments] hold', sp.id, msg);
      out.errors.push(`${sp.id}: ${msg}`);
    }
  }

  // ── 2. Prazo do "Pagar agora" vencido ──
  const { data: late } = await db.from('scheduled_payments').select('*')
    .eq('status', 'failed').lte('pay_deadline', new Date().toISOString()).limit(40);
  for (const sp of (late ?? []) as ScheduledPayment[]) {
    try {
      const { data: won } = await db.from('scheduled_payments')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', sp.id).eq('status', 'failed').select('id');
      if (!won?.length) continue; // pagou no último segundo
      const forClub = await cancelTarget(stripe, db, sp);
      if (!forClub) continue;
      out.expired++;
      await db.from('notifications').insert({
        user_id: sp.user_id, type: 'game_cancelled', title: 'Reserva cancelada',
        message: `O pagamento de ${sp.description} não foi concluído no prazo e a vaga foi cancelada. Nada foi cobrado.`,
        game_id: sp.game_id ?? null,
      });
      await sendServerEmail(db, sp.user_id, 'Reserva cancelada — pagamento não concluído', 'Sua reserva foi cancelada',
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">O pagamento de <b>${sp.description}</b> não foi concluído no prazo, então a vaga foi cancelada. Nada foi cobrado.</p>`);
      if (sp.venue_id) {
        const { data: v } = await db.from('venues').select('admin_id').eq('id', sp.venue_id).maybeSingle();
        if (v?.admin_id) {
          await db.from('notifications').insert({
            user_id: v.admin_id, type: 'payment_expired', title: 'Reserva cancelada por falta de pagamento',
            message: `${forClub} (${sp.description})`, game_id: sp.game_id ?? null,
          });
        }
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error('[process-scheduled-payments] expire', sp.id, msg);
      out.errors.push(`${sp.id}: ${msg}`);
    }
  }

  return json(out);
});
