-- Financeiro do gestor: um extrato único, calculado no banco, com o valor que é
-- do clube (sem a taxa do JoggaHub), mais ocupação e receita potencial.
--
-- Somente aditivo: só LÊ as tabelas existentes. Nova tabela venue_payouts
-- (repasses manuais do JoggaHub ao clube; inserida pelo JoggaHub via SQL).
--
-- Regras:
--   * Data de cada lançamento = data do jogo/aula (competência). Curso com várias
--     aulas é dividido igualmente entre as aulas.
--   * Partidas/reservas: valor do clube = games.court_price. Situação:
--       recebido   → cobrança feita (games.stripe_split_captured)
--       reservado  → valor retido no cartão; o jogador ainda pode cancelar (falta > 24h)
--       a_cobrar   → retido e o prazo de cancelamento (24h) já passou; será cobrado até 2h antes
--       pendente   → reserva do gestor aguardando o jogador pagar
--       aguardando → partida aberta que ainda não tem o mínimo de jogadores
--   * Cursos e day use: cobrados na hora → recebido (amount_paid, sem a taxa).
--   * Cancelados não entram nos totais (aparecem como 'cancelado').
--   * Potencial: horários livres futuros × preço (slot / tabela do dia / quadra).
--   * Horários de 30 min usam price_override como R$/hora; horários maiores
--     (Criar disponibilidade) usam price_override como valor da sessão.

create table if not exists public.venue_payouts (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id),
  amount       numeric(10,2) not null check (amount > 0),
  period_start date,
  period_end   date,
  paid_at      date not null default current_date,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists venue_payouts_venue_idx on public.venue_payouts (venue_id, paid_at desc);
alter table public.venue_payouts enable row level security;
revoke insert, update, delete on public.venue_payouts from anon, authenticated;
drop policy if exists "Venue admins see own payouts" on public.venue_payouts;
create policy "Venue admins see own payouts" on public.venue_payouts for select
  using (exists (select 1 from public.venues v where v.id = venue_payouts.venue_id and v.admin_id = auth.uid()));

-- Lançamentos (uma linha por partida/reserva, por inscrição de day use e por aula de curso)
create or replace function public.venue_finance_entries(p_venue uuid, p_from date, p_to date)
returns table (
  kind text, ref_id uuid, event_at timestamptz, court_id uuid, court_name text,
  who text, title text, amount numeric, status text
)
language sql stable security definer set search_path = public as $$
  with courts_v as (select id, name from courts where venue_id = p_venue),
  g as (
    select g.*, b.payment_status as b_pay, b.total_price as b_total, b.status as b_status
    from games g
    left join bookings b on b.id = g.booking_id
    where g.court_id in (select id from courts_v)
      and (g.scheduled_at at time zone 'UTC')::date between p_from and p_to
  )
  -- Partidas (abertas e reservas privadas com partida)
  select
    case when g.is_open then 'partida_aberta' else 'reserva' end,
    g.id, g.scheduled_at, g.court_id, c.name,
    coalesce(p.name, 'Jogador'),
    case when g.is_open then 'Partida aberta' else 'Reserva' end,
    round(coalesce(g.court_price,
          case when g.b_total is not null then (g.b_total - 2.5) / 1.08 end, 0)::numeric, 2),
    case
      when g.status in ('cancelled', 'expired') or g.b_status = 'cancelled' then 'cancelado'
      when coalesce(g.stripe_split_captured, false) then 'recebido'
      when g.b_pay = 'pending' then 'pendente'
      -- partida aberta que já passou sem juntar o mínimo: não aconteceu
      when g.is_open and g.status = 'scheduled' and g.scheduled_at <= class_wall_now() then 'cancelado'
      when g.is_open and g.status = 'scheduled' then 'aguardando'
      when g.status = 'completed' or g.status = 'pending_results' then
        case when g.b_pay = 'paid' or g.b_pay is null then 'recebido' else 'pendente' end
      -- dinheiro retido no cartão: antes do prazo de cancelamento ainda pode voltar ao jogador
      when g.scheduled_at - interval '24 hours' <= class_wall_now() then 'a_cobrar'
      else 'reservado'
    end
  from g
  join courts_v c on c.id = g.court_id
  left join profiles p on p.id = g.organizer_id

  union all
  -- Reservas antigas sem partida ligada
  select 'reserva', b.id, s.start_time, s.court_id, c.name, coalesce(p.name, 'Jogador'), 'Reserva',
    round(((b.total_price - 2.5) / 1.08)::numeric, 2),
    case when b.status = 'cancelled' then 'cancelado'
         when b.payment_status = 'paid' then 'recebido' else 'pendente' end
  from bookings b
  join slots s on s.id = b.slot_id
  join courts_v c on c.id = s.court_id
  left join profiles p on p.id = b.created_by
  where not exists (select 1 from games g2 where g2.booking_id = b.id)
    and (s.start_time at time zone 'UTC')::date between p_from and p_to

  union all
  -- Day use: uma linha por jogador inscrito
  select 'day_use', e.id, cs.starts_at, cl.court_id, c.name, coalesce(p.name, 'Jogador'), cl.title,
    e.amount_paid,
    case
      when e.status <> 'active' then 'cancelado'
      when not e.payment_held then 'recebido'                                   -- já cobrado
      when cs.starts_at - interval '24 hours' <= class_wall_now() then 'a_cobrar' -- retido, prazo de saída passou
      else 'reservado'                                                          -- retido, ainda pode sair
    end
  from class_enrollments e
  join classes cl on cl.id = e.class_id and cl.kind = 'day_use' and cl.venue_id = p_venue
  join class_sessions cs on cs.class_id = cl.id
  join courts_v c on c.id = cl.court_id
  left join profiles p on p.id = e.player_id
  where (cs.starts_at at time zone 'UTC')::date between p_from and p_to

  union all
  -- Cursos: valor de cada aluno dividido igualmente entre as aulas (mês da aula)
  select 'aula', e.id, cs.starts_at, cl.court_id, c.name, coalesce(p.name, 'Aluno'), cl.title,
    round(e.amount_paid / greatest(cl.lesson_count, 1), 2),
    case when e.status = 'active' then 'recebido' else 'cancelado' end
  from class_enrollments e
  join classes cl on cl.id = e.class_id and cl.kind = 'course' and cl.venue_id = p_venue
  join class_sessions cs on cs.class_id = cl.id
  join courts_v c on c.id = cl.court_id
  left join profiles p on p.id = e.player_id
  where (cs.starts_at at time zone 'UTC')::date between p_from and p_to
$$;

-- Ocupação e potencial por quadra no período (horas)
create or replace function public.venue_finance_capacity(p_venue uuid, p_from date, p_to date)
returns table (court_id uuid, court_name text, hours_created numeric, hours_sold numeric,
               hours_blocked numeric, hours_free_future numeric, potential numeric)
language sql stable security definer set search_path = public as $$
  with s as (
    select sl.*, c.name as court_name, c.price_per_hour,
      extract(epoch from (sl.end_time - sl.start_time)) / 3600.0 as hrs,
      exists (select 1 from class_session_slots css where css.slot_id = sl.id) as is_class,
      exists (select 1 from bookings b where b.slot_id = sl.id and b.status <> 'cancelled') as has_booking,
      exists (select 1 from games g where g.court_id = sl.court_id
                and g.status in ('scheduled', 'confirmed_booking', 'pending_results', 'completed')
                and tstzrange(g.scheduled_at, coalesce(g.scheduled_end_at, g.scheduled_at + interval '90 minutes'))
                    && tstzrange(sl.start_time, sl.end_time)) as has_game,
      (select cs2.price from court_schedules cs2
        where cs2.court_id = sl.court_id
          and cs2.day_of_week = extract(dow from (sl.start_time at time zone 'UTC'))) as day_price
    from slots sl
    join courts c on c.id = sl.court_id and c.venue_id = p_venue
    where (sl.start_time at time zone 'UTC')::date between p_from and p_to
  )
  select court_id, court_name,
    round(sum(hrs)::numeric, 1),
    round(sum(case when not is_available and (is_class or has_booking or has_game) then hrs else 0 end)::numeric, 1),
    round(sum(case when not is_available and not (is_class or has_booking or has_game) then hrs else 0 end)::numeric, 1),
    round(sum(case when is_available and start_time > class_wall_now() then hrs else 0 end)::numeric, 1),
    round(sum(case when is_available and start_time > class_wall_now() then
      case
        when price_override is not null and hrs > 0.5 then price_override            -- valor da sessão
        else coalesce(price_override, day_price, price_per_hour, 0) * hrs           -- R$/hora × horas
      end else 0 end)::numeric, 2)
  from s
  group by court_id, court_name
  order by court_name
$$;

-- Ponto de entrada do gestor: confere que ele administra o clube.
create or replace function public.venue_finance(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_venue uuid;
begin
  select id into v_venue from venues where admin_id = auth.uid() limit 1;
  if v_venue is null then
    raise exception 'Sem clube vinculado a esta conta.' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Período inválido.';
  end if;
  return jsonb_build_object(
    'entries', coalesce((select jsonb_agg(to_jsonb(e) order by e.event_at) from venue_finance_entries(v_venue, p_from, p_to) e), '[]'::jsonb),
    'capacity', coalesce((select jsonb_agg(to_jsonb(c)) from venue_finance_capacity(v_venue, p_from, p_to) c), '[]'::jsonb),
    -- Repasse (desde sempre): recebido de jogos/aulas que já aconteceram − repasses feitos
    'received_to_date', coalesce((select sum(e.amount) from venue_finance_entries(v_venue, '2000-01-01', (class_wall_now() at time zone 'UTC')::date) e
                                  where e.status = 'recebido' and e.event_at <= class_wall_now()), 0),
    'paid_out', coalesce((select sum(amount) from venue_payouts where venue_id = v_venue), 0),
    'last_payout', (select to_jsonb(p) from venue_payouts p where p.venue_id = v_venue order by paid_at desc limit 1)
  );
end;
$$;

revoke all on function public.venue_finance_entries(uuid, date, date) from public, anon, authenticated;
revoke all on function public.venue_finance_capacity(uuid, date, date) from public, anon, authenticated;
revoke all on function public.venue_finance(date, date) from public, anon;
grant execute on function public.venue_finance(date, date) to authenticated;
