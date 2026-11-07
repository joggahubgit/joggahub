// Cancela um curso (aulas) pelo gestor do clube.
// Libera a agenda (class_cancel no banco), reembolsa cada aluno no Stripe,
// marca as inscrições como canceladas e avisa os alunos.
// Só o admin do clube do curso pode chamar.

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

    const { classId } = await req.json().catch(() => ({}));
    if (!classId || typeof classId !== 'string') return json({ error: 'classId é obrigatório' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: cls } = await db.from('classes').select('id, title, status, venue_id').eq('id', classId).maybeSingle();
    if (!cls) return json({ error: 'Curso não encontrado' }, 404);
    const { data: venue } = await db.from('venues').select('admin_id, name').eq('id', cls.venue_id).maybeSingle();
    if (venue?.admin_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (cls.status !== 'active') return json({ error: 'Este curso já foi cancelado.' }, 400);

    // 1. Banco: marca cancelado e libera a agenda. Retorna quem reembolsar.
    const { data: toRefund, error: cancelErr } = await db.rpc('class_cancel', { p_class_id: classId });
    if (cancelErr) throw new Error(cancelErr.message);

    // 2. Stripe: reembolso total de cada aluno.
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    const failed: string[] = [];
    let refunded = 0;
    for (const row of (toRefund ?? []) as { enrollment_id: string; player_id: string; payment_intent_id: string | null }[]) {
      let ok = false;
      if (row.payment_intent_id) {
        try {
          const pi = await stripe.paymentIntents.retrieve(row.payment_intent_id);
          if (pi.status === 'succeeded') {
            await stripe.refunds.create({ payment_intent: pi.id }, { idempotencyKey: `class-cancel-${row.enrollment_id}` });
          } else if (pi.status !== 'canceled') {
            await stripe.paymentIntents.cancel(pi.id);
          }
          ok = true;
          refunded++;
        } catch (e) {
          console.error('[cancel-class] REFUND FAILED — reembolsar manualmente', row.payment_intent_id, e);
          failed.push(row.enrollment_id);
        }
      }
      await db.from('class_enrollments')
        .update({ status: 'cancelled', refunded: ok, cancelled_at: new Date().toISOString() })
        .eq('id', row.enrollment_id);
      await db.from('notifications').insert({
        user_id: row.player_id,
        type: 'class_cancelled',
        title: 'Curso cancelado',
        message: `O curso "${cls.title}" foi cancelado pelo clube ${venue?.name ?? ''}. ${ok ? 'O valor total foi reembolsado no seu cartão.' : 'O clube vai providenciar o seu reembolso.'}`.trim(),
      });
    }

    return json({ ok: true, refunded, failed: failed.length });
  } catch (e) {
    console.error('[cancel-class]', e);
    return json({ error: (e as Error).message ?? 'Erro ao cancelar curso' }, 500);
  }
});
