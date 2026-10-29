/**
 * Mobile checkout: same Stripe Checkout + server-side fulfillment as the web.
 *
 * 1. Ask our edge function for a Checkout session (prices/players come from the DB).
 * 2. Open it in the system auth browser (SFSafariViewController / Custom Tabs) —
 *    never a WebView, and the app never sees card data.
 * 3. Stripe redirects to our deep link (joggahub://payment-success?session_id=…,
 *    or exp://…/--/payment-success in Expo Go); the auth session closes and we
 *    open the success screen, which asks the server (finalize-checkout) for the result.
 *
 * If the app is killed while the browser is open, the same deep link reopens the
 * app straight on /payment-success, and the stripe-webhook completes the purchase
 * on the server regardless.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { PLATFORM_FEE_FIXED, PLATFORM_FEE_PERCENT } from '@/lib/shared';

/** Same formula the server charges (8% + R$2,50, rounded to the cent). */
export function calcFees(base: number) {
  const fee = Math.round((base * PLATFORM_FEE_PERCENT + PLATFORM_FEE_FIXED) * 100) / 100;
  return { base, fee, total: Math.round((base + fee) * 100) / 100 };
}

type CheckoutFn = 'create-checkout-session' | 'create-slot-checkout-session';

export type SuccessDisplay = Record<string, string | number | undefined>;

export type CheckoutOutcome = 'opened-success' | 'cancelled';

async function readFnError(error: unknown) {
  // FunctionsHttpError hides the JSON body ({ error }) behind .context
  const ctx = (error as { context?: Response }).context;
  try {
    const body = ctx ? await ctx.json() : null;
    if (body?.error) return String(body.error);
  } catch {
    /* not JSON */
  }
  return error instanceof Error ? error.message : 'Erro ao iniciar pagamento';
}

/**
 * Starts a checkout. `display` travels in the return URL only to render the
 * success screen (court name, date…) — the server never reads it.
 */
export async function startCheckout(fn: CheckoutFn, body: Record<string, unknown>, display: SuccessDisplay): Promise<CheckoutOutcome> {
  const params = Object.fromEntries(
    Object.entries(display).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  );
  const successUrl = Linking.createURL('payment-success', { queryParams: params });
  const cancelUrl = Linking.createURL('payment-cancelled');

  const { data, error } = await supabase.functions.invoke(fn, { body: { ...body, successUrl, cancelUrl } });
  if (error) throw new Error(await readFnError(error));
  if (!data?.url) throw new Error('Não foi possível abrir o pagamento.');

  // The browser closes as soon as Stripe navigates to anything under our app URL.
  const result = await WebBrowser.openAuthSessionAsync(data.url, Linking.createURL(''));
  if (result.type !== 'success' || !result.url.includes('payment-success')) return 'cancelled';

  const { queryParams } = Linking.parse(result.url);
  const sessionId = typeof queryParams?.session_id === 'string' ? queryParams.session_id : '';
  router.push({ pathname: '/payment-success', params: { ...params, session_id: sessionId } });
  return 'opened-success';
}
