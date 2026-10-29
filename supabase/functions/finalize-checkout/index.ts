// Called by the payment success screen (web and mobile) with the Stripe session id.
// Runs the same server-side fulfillment as stripe-webhook, so the purchase completes
// even if the webhook is late — whichever arrives first creates it, exactly once.
// Returns what was created so the screen can show it.
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/checkout.ts';
import { fulfillSession } from '../_shared/fulfill.ts';

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

    const { sessionId } = await req.json();
    if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      return json({ error: 'Sessão de pagamento inválida' }, 400);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Only the payer can finalize their own session.
    const payer = session.metadata?.userId ?? session.client_reference_id;
    if (payer && payer !== user.id) return json({ error: 'Esta sessão de pagamento não é sua.' }, 403);
    if (!payer) return json({ status: 'legacy' });

    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const result = await fulfillSession(stripe, db, session);
    return json(result);
  } catch (error) {
    console.error('[finalize-checkout]', error);
    // Transient: the screen keeps polling and the webhook will also retry.
    return json({ status: 'processing' });
  }
});
