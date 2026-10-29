-- Server-side fulfillment of Stripe Checkout sessions.
--
-- One row per Checkout session. Both the stripe-webhook and the finalize-checkout
-- function (called by the success screen on web/mobile) "claim" the session here
-- before creating anything, so a game/booking/enrollment is created exactly once
-- no matter which of them arrives first — or if both arrive at the same time.
--
-- Additive only: no existing table, policy or function is changed.
-- Only the service role (edge functions) touches this table.

create table if not exists public.checkout_fulfillments (
  session_id  text primary key,
  kind        text not null,
  user_id     uuid not null,
  status      text not null default 'processing'
              check (status in ('processing', 'done', 'failed')),
  result      jsonb,
  error       text,
  attempts    integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists checkout_fulfillments_user_idx
  on public.checkout_fulfillments (user_id, created_at desc);

alter table public.checkout_fulfillments enable row level security;
-- No policies on purpose: anon/authenticated get nothing; the service role bypasses RLS.
revoke all on table public.checkout_fulfillments from anon, authenticated;
