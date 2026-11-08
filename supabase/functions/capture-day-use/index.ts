// Cobra day use e cursos 2h antes do início (day use) ou da 1ª aula (curso),
// mesmo prazo das partidas abertas. Chamada pelo cron. Só mexe em inscrições
// com valor retido (class_enrollments.payment_held). Pode ser chamada a qualquer
// momento sem efeito colateral: só cobra o que já está dentro da janela de 2h.

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/checkout.ts';

const CAPTURE_HOURS_BEFORE = 2;

/** "Agora" em Brasília na convenção dos horários gravados (wall clock). */
function wallNowIso() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
  return new Date(`${s}Z`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });

  // Inscrições com valor retido; cobra as que começam em até 2h
  const limit = new Date(wallNowIso().getTime() + CAPTURE_HOURS_BEFORE * 3600_000).toISOString();
  const { data: rows, error } = await db
    .from('class_enrollments')
    .select('id, stripe_payment_intent_id, classes!inner(kind, status, title), class_id')
    .eq('status', 'active')
    .eq('payment_held', true)
    .eq('classes.status', 'active');
  if (error) return json({ error: error.message }, 500);

  const classIds = [...new Set((rows ?? []).map(r => r.class_id))];
  if (!classIds.length) return json({ captured: 0 });
  const { data: sessions } = await db.from('class_sessions').select('class_id, starts_at').in('class_id', classIds);
  // Início = primeira sessão (curso tem várias aulas; day use tem uma)
  const startByClass = new Map<string, string>();
  for (const s of sessions ?? []) {
    const cur = startByClass.get(s.class_id);
    if (!cur || (s.starts_at as string) < cur) startByClass.set(s.class_id, s.starts_at as string);
  }

  let captured = 0;
  const errors: string[] = [];
  for (const r of rows ?? []) {
    const start = startByClass.get(r.class_id);
    if (!start || start.substring(0, 19) > limit.substring(0, 19)) continue; // ainda não é hora
    if (!r.stripe_payment_intent_id) continue;
    try {
      const pi = await stripe.paymentIntents.retrieve(r.stripe_payment_intent_id);
      if (pi.status === 'requires_capture') {
        await stripe.paymentIntents.capture(pi.id, {}, { idempotencyKey: `day-use-capture-${r.id}` });
      } else if (pi.status !== 'succeeded') {
        throw new Error(`PaymentIntent em ${pi.status}`);
      }
      await db.from('class_enrollments')
        .update({ payment_held: false, captured_at: new Date().toISOString(), capture_error: null })
        .eq('id', r.id);
      captured++;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error('[capture-day-use] FALHOU — cobrar manualmente', r.id, r.stripe_payment_intent_id, msg);
      await db.from('class_enrollments').update({ capture_error: msg.substring(0, 300) }).eq('id', r.id);
      errors.push(r.id);
    }
  }

  return json({ captured, errors: errors.length });
});
