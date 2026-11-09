// "Pagar agora": o banco recusou a retenção automática (cartão salvo) e o
// jogador tem 24h para pagar com outro cartão. Cria um Checkout com o mesmo
// valor, retido (captura manual) como qualquer outra reserva. O resultado é
// gravado pelo servidor (_shared/fulfill.ts → scheduled_retry).
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  METADATA_VERSION, UserError, assertReturnUrl, checkoutExpiresAt, corsHeaders, json, withSessionId,
} from '../_shared/checkout.ts';
import { targetAlive } from '../_shared/scheduled.ts';

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

    const body = await req.json();
    const successUrl = withSessionId(assertReturnUrl(body.successUrl, 'URL de retorno'));
    const cancelUrl = assertReturnUrl(body.cancelUrl, 'URL de cancelamento');
    if (typeof body.scheduledPaymentId !== 'string') throw new UserError('Pagamento não informado.');

    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: sp } = await db.from('scheduled_payments').select('*').eq('id', body.scheduledPaymentId).maybeSingle();
    if (!sp || sp.user_id !== user.id) throw new UserError('Pagamento não encontrado.');
    if (sp.status === 'held' || sp.status === 'paid') throw new UserError('Este pagamento já foi feito.');
    if (sp.status !== 'failed') throw new UserError('Este pagamento não está mais pendente.');
    if (!sp.pay_deadline || Date.parse(sp.pay_deadline) <= Date.now()) throw new UserError('O prazo para pagar terminou.');
    if (!(await targetAlive(db, sp))) throw new UserError('Esta reserva já foi cancelada.');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      locale: 'pt-BR',
      customer: sp.customer_id,
      expires_at: checkoutExpiresAt(),
      client_reference_id: user.id,
      payment_intent_data: {
        capture_method: 'manual',
        description: sp.description,
        metadata: { ...(sp.pi_metadata ?? {}), scheduledPaymentId: sp.id },
      },
      line_items: [{
        price_data: {
          currency: 'brl',
          unit_amount: Math.round(Number(sp.amount) * 100),
          product_data: { name: sp.description, description: 'Inclui a taxa de serviço JoggaHub (8% + R$2,50)' },
        },
        quantity: 1,
      }],
      metadata: { v: METADATA_VERSION, userId: user.id, kind: 'scheduled_retry', scheduledPaymentId: sp.id },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return json({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (!(error instanceof UserError)) console.error('[create-retry-checkout-session]', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});
