import { loadStripe } from '@stripe/stripe-js'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

if (!publishableKey) {
  console.warn('Missing VITE_STRIPE_PUBLISHABLE_KEY — Stripe payments will not work.')
}

export const stripePromise = loadStripe(publishableKey || '')

// ── Helpers ──────────────────────────────────────────────────

/**
 * Create a Payment Intent via a Supabase Edge Function.
 * Deploy supabase/functions/create-payment-intent/index.ts to use this.
 */
export async function createPaymentIntent(params: {
  amount: number          // in cents
  currency?: string
  bookingId: string
  bookingPlayerId: string
  metadata?: Record<string, string>
}) {
  const { supabase } = await import('./supabase')
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: {
      amount: params.amount,
      currency: params.currency ?? 'brl',
      bookingId: params.bookingId,
      bookingPlayerId: params.bookingPlayerId,
      metadata: params.metadata ?? {},
    },
  })

  if (error) throw error
  return data as { clientSecret: string; paymentIntentId: string }
}
