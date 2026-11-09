-- Financeiro do gestor: reservas com cartão salvo (mais de 6 dias) aparecem
-- como "agendado" até o valor ser reservado 6 dias antes. Antes, day use e curso
-- sem retenção apareciam como "recebido". Só substitui esta função.

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
    case when g.is_open then 'partida_aberta' else 'partida_fechada' end,
    g.id, g.scheduled_at, g.court_id, c.name,
    coalesce(p.name, 'Jogador'),
    case when g.is_open then 'Partida aberta' else 'Partida fechada' end,
    round(coalesce(g.court_price,
          case when g.b_total is not null then (g.b_total - 2.5) / 1.08 end, 0)::numeric, 2),
    case
      when g.status in ('cancelled', 'expired') or g.b_status = 'cancelled' then 'cancelado'
      -- cartão salvo: o valor ainda será reservado (6 dias antes)
      when exists (select 1 from scheduled_payments sp where sp.game_id = g.id
                     and sp.kind in ('private_game', 'organizer') and sp.status in ('scheduled', 'failed')) then 'agendado'
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
  select 'reserva', b.id, s.start_time, s.court_id, c.name, coalesce(p.name, 'Jogador'), 'Partida fechada',
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
      when exists (select 1 from scheduled_payments sp where sp.class_enrollment_id = e.id
                     and sp.status in ('scheduled', 'failed')) then 'agendado'      -- cartão salvo
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
    case
      when e.status <> 'active' then 'cancelado'
      when exists (select 1 from scheduled_payments sp where sp.class_enrollment_id = e.id
                     and sp.status in ('scheduled', 'failed')) then 'agendado'
      when not e.payment_held then 'recebido'
      when (select min(s1.starts_at) from class_sessions s1 where s1.class_id = cl.id) - interval '24 hours' <= class_wall_now() then 'a_cobrar'
      else 'reservado'
    end
  from class_enrollments e
  join classes cl on cl.id = e.class_id and cl.kind = 'course' and cl.venue_id = p_venue
  join class_sessions cs on cs.class_id = cl.id
  join courts_v c on c.id = cl.court_id
  left join profiles p on p.id = e.player_id
  where (cs.starts_at at time zone 'UTC')::date between p_from and p_to
$$;

