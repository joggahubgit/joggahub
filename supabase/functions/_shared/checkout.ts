// Shared rules for the checkout functions (create-*-checkout-session, stripe-webhook,
// finalize-checkout). Keep in sync with src/app/lib/gameConfig.ts.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Version tag written to Stripe metadata by the server-side fulfillment flow. */
export const METADATA_VERSION = '2';

// Mirrors SPORT_PLAYER_RULES in src/app/lib/gameConfig.ts.
const SPORT_PLAYER_RULES: Record<string, { min: number; max: number }> = {
  football: { min: 10, max: 18 },
  society: { min: 10, max: 18 },
  futsal: { min: 10, max: 18 },
  futevolei: { min: 4, max: 4 },
};
const FALLBACK_PLAYER_RULE = { min: 4, max: 8 };
export const playerRule = (sport: string) => SPORT_PLAYER_RULES[sport] ?? FALLBACK_PLAYER_RULE;

/** Mirrors CAPTURE_CUTOFF_HOURS: joins close when split holds are captured. */
export const CAPTURE_CUTOFF_HOURS = 2;

export const SPORT_LABELS: Record<string, string> = {
  football: 'Futebol', society: 'Society', futsal: 'Futsal', futevolei: 'Futevôlei',
};

/** Service fee: 8% + R$2,50 per transaction (same as before). */
export const serviceFeeFor = (base: number) => round2(base * 0.08 + 2.5);
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const durationOrNull = (v: unknown) => ([90, 120].includes(Number(v)) ? Number(v) : null);

// ── Wall-clock helpers ───────────────────────────────────────────────────────
// Slot times are stored as wall-clock values in a timestamptz column (see
// src/app/lib/wallClock.ts). We read the "YYYY-MM-DDTHH:MM" text and never
// convert it through a timezone.

export const wallStart = (startTime: string) => `${startTime.substring(0, 16)}:00`;

export function wallAddMinutes(wall: string, minutes: number) {
  const d = new Date(`${wall.substring(0, 16)}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().substring(0, 19);
}

/**
 * "Agora" em Brasília na mesma convenção dos horários gravados (wall clock).
 * NUNCA compare um horário gravado com Date.now(): o relógio UTC está 3h à
 * frente de Brasília e tudo aconteceria 3h antes do prometido.
 */
export function wallNowMs() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
  return Date.parse(`${s}Z`);
}
/** Horário gravado (wall clock, ex.: "2026-11-18T20:00:00+00:00") em ms, sem fuso. */
export const wallMs = (iso: string) => Date.parse(`${iso.substring(0, 19)}Z`);

export function wallLabel(startTime: string) {
  const [y, m, d] = startTime.substring(0, 10).split('-');
  return { date: `${d}/${m}/${y}`, time: startTime.substring(11, 16) };
}

// ── Return URL allowlist ─────────────────────────────────────────────────────
// Stripe redirects the payer to success_url / cancel_url. Only our own web
// origins and the app's deep-link scheme are accepted. Per-project override via
// the ALLOWED_RETURN_URLS secret (comma-separated prefixes), e.g. staging adds
// http://localhost:5173 and exp:// for Expo Go.
const DEFAULT_RETURN_PREFIXES = [
  'https://joggahub.com.br',
  'https://www.joggahub.com.br',
  'joggahub://',
];

function returnPrefixes() {
  const raw = Deno.env.get('ALLOWED_RETURN_URLS');
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_RETURN_PREFIXES;
}

export function assertReturnUrl(url: unknown, label: string): string {
  if (typeof url !== 'string' || !url) throw new Error(`${label} ausente`);
  const ok = returnPrefixes().some(prefix => {
    if (!url.startsWith(prefix)) return false;
    if (prefix.endsWith('/') || prefix.endsWith(':')) return true;
    // "https://joggahub.com.br" must not match "https://joggahub.com.br.evil.com"
    const next = url.charAt(prefix.length);
    return next === '' || next === '/' || next === '?' || next === '#';
  });
  if (!ok) throw new Error(`${label} não permitida`);
  return url;
}

/** Stripe fills {CHECKOUT_SESSION_ID}; the success screen needs it to finalize. */
export function withSessionId(successUrl: string) {
  if (successUrl.includes('{CHECKOUT_SESSION_ID}')) return successUrl;
  return `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;
}

/** Checkout links expire after 30 min (Stripe minimum) so a held slot can't be paid hours later. */
export const checkoutExpiresAt = () => Math.floor(Date.now() / 1000) + 30 * 60;

/** Error that is safe to show to the payer. */
export class UserError extends Error {}
