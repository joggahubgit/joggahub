import { supabase } from '@/lib/supabase';

const SERVICE_FEE_PERCENT = 0.15;

export function calcFees(vagaPrice: number) {
  const serviceFee = Math.ceil(vagaPrice * SERVICE_FEE_PERCENT * 100) / 100;
  const total = vagaPrice + serviceFee;
  return { vagaPrice, serviceFee, total };
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
  mode: 'organizer' | 'join_self' | 'join_other';
  slotId?: string;
  /** Override the auto-built success URL (used by organizer flow) */
  successUrl?: string;
  /** Override the auto-built cancel URL (used by organizer flow) */
  cancelUrl?: string;
}

export async function redirectToCheckout(params: CheckoutParams) {
  const { serviceFee, total } = calcFees(params.vagaPrice);

  const origin = window.location.origin;
  const slotParam = params.slotId ? `&slotId=${params.slotId}` : '';
  const successUrl = params.successUrl
    ?? `${origin}/payment-success?gameId=${params.gameId ?? ''}&playerId=${params.playerId}&playerName=${encodeURIComponent(params.playerName)}&mode=${params.mode}${slotParam}`;
  const cancelUrl = params.cancelUrl
    ?? `${origin}/open-game/${params.gameId ?? ''}`;

  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: {
      ...params,
      serviceFee,
      totalPrice: total,
      successUrl,
      cancelUrl,
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
