-- Cartão salvo + retenção automática 6 dias antes.
--
-- Reservas com mais de 6 dias de antecedência não retêm nada na hora (a
-- retenção do Stripe dura ~7 dias): o Checkout só salva o cartão e a vaga já
-- fica garantida. A função process-scheduled-payments retém o valor 6 dias
-- antes do início; se o banco recusar, o jogador tem 24h para "Pagar agora",
-- senão a vaga é cancelada e o clube avisado.
--
-- Só cria coisas novas (tabelas, coluna opcional, funções). Não altera dados.

-- Cliente Stripe de cada usuário (para guardar o cartão). Só o servidor lê.
create table if not exists public.stripe_customers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  created_at  timestamptz not null default now()
);
alter table public.stripe_customers enable row level security;

-- Retenção do organizador gravada direto na partida. Antes ela só era achada
-- pela sessão de checkout; com cartão salvo a sessão não tem pagamento.
alter table public.games add column if not exists organizer_payment_intent_id text;

create table if not exists public.scheduled_payments (
  id                  uuid primary key default gen_random_uuid(),
  session_id          text not null unique,          -- checkout que salvou o cartão
  kind                text not null check (kind in ('private_game', 'organizer', 'join', 'class_enrollment')),
  user_id             uuid not null references auth.users(id),   -- quem paga
  player_id           uuid,                                     -- join: dono da vaga
  game_id             uuid references public.games(id),
  class_enrollment_id uuid references public.class_enrollments(id),
  venue_id            uuid,
  customer_id         text not null,
  payment_method_id   text not null,
  amount              numeric(10,2) not null,        -- valor total (com a taxa)
  description         text not null,
  pi_metadata         jsonb not null default '{}'::jsonb,
  starts_at           timestamptz not null,          -- início (wall clock)
  hold_at             timestamptz not null,          -- reter em (wall clock) = início − 6 dias
  status              text not null default 'scheduled'
                      check (status in ('scheduled', 'held', 'failed', 'paid', 'cancelled', 'expired')),
  payment_intent_id   text,
  error               text,
  pay_deadline        timestamptz,                   -- prazo do "Pagar agora" (hora real)
  attempts            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists scheduled_payments_due on public.scheduled_payments (status, hold_at);
create index if not exists scheduled_payments_game on public.scheduled_payments (game_id);
create index if not exists scheduled_payments_enrollment on public.scheduled_payments (class_enrollment_id);
create index if not exists scheduled_payments_user on public.scheduled_payments (user_id);
-- Sem policies: o cliente só lê pelas funções abaixo (sem ids do Stripe).
alter table public.scheduled_payments enable row level security;

-- Pagamentos agendados/pendentes do próprio usuário (telas de partida, curso e "Pagar agora").
create or replace function public.my_scheduled_payments()
returns table (
  id uuid, kind text, player_id uuid, game_id uuid, class_id uuid, amount numeric, description text,
  starts_at timestamptz, hold_at timestamptz, status text, pay_deadline timestamptz
)
language sql stable security definer set search_path = public as $$
  select sp.id, sp.kind, sp.player_id, sp.game_id, e.class_id, sp.amount, sp.description,
         sp.starts_at, sp.hold_at, sp.status, sp.pay_deadline
  from scheduled_payments sp
  left join class_enrollments e on e.id = sp.class_enrollment_id
  where sp.user_id = auth.uid()
    and sp.status in ('scheduled', 'failed')
  order by sp.starts_at;
$$;
revoke all on function public.my_scheduled_payments() from public, anon;
grant execute on function public.my_scheduled_payments() to authenticated;
