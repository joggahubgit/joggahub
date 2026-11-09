// Checkout da inscrição num curso (aulas): o aluno paga o curso inteiro.
// Valor retido e cobrado 2h antes (ou cartão salvo, se faltar mais de 6 dias). Preço, vagas e prazo vêm do banco; a
// inscrição é criada depois pelo servidor (_shared/fulfill.ts → class_enroll),
// nunca pelo navegador.
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  METADATA_VERSION, UserError, assertReturnUrl, checkoutExpiresAt, corsHeaders, json,
  round2, serviceFeeFor, withSessionId,
} from '../_shared/checkout.ts';
import { customerFor, scheduledCheckoutParams, shouldSchedule } from '../_shared/scheduled.ts';

/** Mesma regra de class_wall_now() no banco: hora de Brasília como "wall clock". */
function wallNowMs() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
  return new Date(`${s}Z`).getTime();
}
const ENROLL_CUTOFF_HOURS = 2;
/** O Stripe segura a retenção por ~7 dias; acima disso o day use cobra na hora. */
const HOLD_MAX_DAYS = 6;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
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
    if (typeof body.classId !== 'string') throw new UserError('Curso não informado.');

    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: cls } = await db.from('classes')
      .select('id, kind, title, coach_name, price, capacity, enrolled_count, lesson_count, status, start_date, end_date, venues(name)')
      .eq('id', body.classId).maybeSingle();
    if (!cls || cls.status !== 'active') throw new UserError('Este curso não está disponível.');
    if (cls.enrolled_count >= cls.capacity) throw new UserError('O curso está lotado.');

    const { data: first } = await db.from('class_sessions').select('starts_at, ends_at')
      .eq('class_id', cls.id).order('starts_at').limit(1).maybeSingle();
    if (!first) throw new UserError('Este curso não tem aulas.');
    const firstMs = new Date(first.starts_at).getTime();
    if (firstMs - ENROLL_CUTOFF_HOURS * 3600_000 <= wallNowMs()) {
      throw new UserError('As inscrições deste curso já fecharam.');
    }

    const { data: already } = await db.from('class_enrollments').select('id')
      .eq('class_id', cls.id).eq('player_id', userId).eq('status', 'active').maybeSingle();
    if (already) throw new UserError('Você já está inscrito neste curso.');

    const price = round2(Number(cls.price));
    const fee = serviceFeeFor(price);
    const venueName = (cls.venues as unknown as { name?: string } | null)?.name ?? '';
    const d = (s: string) => `${s.substring(8, 10)}/${s.substring(5, 7)}`;

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    // Curso e day use seguem as partidas: valor retido no cartão e cobrado 2h antes
    // do início / da 1ª aula (função capture-day-use). Com mais de 6 dias de
    // antecedência só salva o cartão e retém 6 dias antes (process-scheduled-payments).
    const hold = firstMs - wallNowMs() <= HOLD_MAX_DAYS * 24 * 3600_000;
    const isDayUse = cls.kind === 'day_use';
    const description = `${isDayUse ? 'Day use' : 'Curso'} — ${cls.title} · ${d(cls.start_date)}`;
    const piMetadata = { tipo: isDayUse ? 'day_use' : 'aula', classId: cls.id };
    const md = { kind: 'class_enrollment', classId: cls.id, price: String(price), fee: String(fee) };

    if (!hold || shouldSchedule(first.starts_at)) {
      const scheduled = await stripe.checkout.sessions.create(scheduledCheckoutParams({
        userId,
        customer: await customerFor(stripe, db, userId),
        amount: round2(price + fee),
        startIso: first.starts_at,
        chargeText: isDayUse ? 'cobrado 2h antes do início' : 'cobrado 2h antes da primeira aula',
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
      payment_intent_data: {
        capture_method: 'manual' as const,
        description,
        metadata: piMetadata,
      },
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(price * 100),
            product_data: cls.kind === 'day_use'
              ? {
                  name: `Day use — ${cls.title}`,
                  description: `${venueName} · ${d(cls.start_date)} · ${first.starts_at.substring(11, 16)}–${first.ends_at.substring(11, 16)}`,
                }
              : {
                  name: `Curso — ${cls.title}`,
                  description: `${venueName} · ${cls.lesson_count} aulas · ${d(cls.start_date)} a ${d(cls.end_date)} · Prof. ${cls.coach_name}`,
                },
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(fee * 100),
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
    if (!(error instanceof UserError)) console.error('[create-class-checkout-session]', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});
