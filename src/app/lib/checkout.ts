import { supabase } from '@/lib/supabase';
import { PLATFORM_FEE_PERCENT, PLATFORM_FEE_FIXED } from './gameConfig';

export function calcFees(base: number) {
  const fee = Math.ceil((base * PLATFORM_FEE_PERCENT + PLATFORM_FEE_FIXED) * 100) / 100;
  return { base, fee, total: base + fee };
}

interface CheckoutParams {
  gameId?: string;
  playerId: string;
  playerName: string;
  courtName: string;
  venueName: string;
  sport: string;
  date: string;
  time: string;
  vagaPrice: number;
  mode: 'organizer' | 'join_self' | 'join_other' | 'pay_reservation';
  slotId?: string;
  /** Duration in minutes (90 or 120) — required for organizer flow price validation */
  durationMins?: number;
  /** When true, Stripe authorizes but does not capture immediately (split join hold) */
  captureManual?: boolean;
  /** Passed through to PaymentSuccess so it can handle split vs full flows */
  payMode?: 'split' | 'full';
  /** Override the auto-built success URL (used by organizer flow) */
  successUrl?: string;
  /** Override the auto-built cancel URL (used by organizer flow) */
  cancelUrl?: string;
}

export async function redirectToCheckout(params: CheckoutParams) {
  const { fee: serviceFee, total } = calcFees(params.vagaPrice);

  const origin = window.location.origin;
  const slotParam = params.slotId ? `&slotId=${params.slotId}` : '';
  const payModeParam = params.payMode ? `&payMode=${params.payMode}` : '';
  // Include session_id for manual-capture checkouts so PaymentSuccess can store the payment_intent_id
  const sessionParam = params.captureManual ? '&session_id={CHECKOUT_SESSION_ID}' : '';
  const successUrl = params.successUrl
    ?? `${origin}/payment-success?gameId=${params.gameId ?? ''}&playerId=${params.playerId}&playerName=${encodeURIComponent(params.playerName)}&mode=${params.mode}${slotParam}${payModeParam}${sessionParam}`;
  const cancelUrl = params.cancelUrl
    ?? `${origin}/open-game/${params.gameId ?? ''}`;

  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: {
      ...params,
      serviceFee,
      totalPrice: total,
      successUrl,
      cancelUrl,
      captureManual: params.captureManual ?? false,
    },
  });

  if (error) {
    // FunctionsHttpError hides the body — try to read it
    const body = await (error as any).context?.json?.().catch(() => null);
    console.error('Checkout error:', error.message, body);
    throw new Error(body?.error ?? error.message ?? 'Erro ao criar sessão de pagamento');
  }
  if (!data?.url) {
    console.error('Checkout: no URL in response', data);
    throw new Error('Erro ao criar sessão de pagamento');
  }

  window.location.href = data.url;
}
