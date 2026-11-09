// Clube cancelou depois que o jogador já foi cobrado: o jogador recebe tudo de
// volta, mas o Stripe não devolve a taxa dele. Essa taxa é descontada do
// repasse do clube (linha "ajuste" no Financeiro, via venue_adjustments).
// Antes da cobrança (valor só retido) liberar não custa nada: não chame.

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { wallNowMs } from './checkout.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export async function recordClubRefundFee(
  stripe: Stripe, db: Db,
  p: { piId: string; venueId: string | null | undefined; refKind: 'game' | 'class' | 'booking'; refId: string; what: string },
) {
  if (!p.venueId) return;
  try {
    const pi = await stripe.paymentIntents.retrieve(p.piId, { expand: ['latest_charge.balance_transaction'] });
    const charge = pi.latest_charge as Stripe.Charge | null;
    const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
    const fee = bt ? bt.fee / 100 : 0;
    if (fee <= 0) return;
    const { error } = await db.from('venue_adjustments').insert({
      venue_id: p.venueId,
      amount: -Math.round(fee * 100) / 100,
      reason: `Taxa do Stripe não devolvida — cancelamento pelo clube (${p.what})`,
      ref_kind: p.refKind,
      ref_id: p.refId,
      payment_intent_id: p.piId,
      event_at: new Date(wallNowMs()).toISOString(),
    });
    if (error && error.code !== '23505') console.error('[clubFee] não registrou o ajuste', p.piId, error.message);
  } catch (e) {
    console.error('[clubFee] falhou — registrar o ajuste manualmente', p.piId, e);
  }
}
