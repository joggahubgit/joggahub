// Aluno desiste do curso: reembolso total até 48h antes da 1ª aula.
// A regra e a vaga ficam no banco (class_leave); aqui só o reembolso no Stripe.

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/checkout.ts';

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

    const { enrollmentId } = await req.json().catch(() => ({}));
    if (typeof enrollmentId !== 'string') return json({ error: 'Inscrição não informada.' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data, error } = await db.rpc('class_leave', { p_enrollment_id: enrollmentId, p_player_id: user.id });
    if (error) return json({ error: error.message }, error.hint === 'user' ? 400 : 500);

    const row = (data as { payment_intent_id: string | null; class_title: string }[])[0];
    let refunded = false;
    if (row?.payment_intent_id) {
      try {
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
        const pi = await stripe.paymentIntents.retrieve(row.payment_intent_id);
        if (pi.status === 'succeeded') {
          await stripe.refunds.create({ payment_intent: pi.id }, { idempotencyKey: `class-leave-${enrollmentId}` });
        } else if (pi.status !== 'canceled') {
          await stripe.paymentIntents.cancel(pi.id);
        }
        refunded = true;
      } catch (e) {
        console.error('[leave-class] REFUND FAILED — reembolsar manualmente', row.payment_intent_id, e);
      }
    }
    await db.from('class_enrollments').update({ refunded }).eq('id', enrollmentId);
    await db.from('notifications').insert({
      user_id: user.id,
      type: 'class_left',
      title: 'Inscrição cancelada',
      message: `Você saiu do curso "${row?.class_title ?? ''}". ${refunded ? 'O valor total foi reembolsado no seu cartão.' : 'O reembolso será feito pelo suporte.'}`,
    });

    return json({ ok: true, refunded });
  } catch (e) {
    console.error('[leave-class]', e);
    return json({ error: (e as Error).message ?? 'Erro ao cancelar inscrição' }, 500);
  }
});
