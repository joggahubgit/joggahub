-- Day use: o clube abre a quadra para jogo livre, com preço fixo por pessoa.
--
-- Usa a mesma estrutura das aulas (classes): 1 data, sem professor, até 12
-- vagas, pagamento na hora pelo app, bloqueio da agenda e reembolso. Não conta
-- para o ranking (não é um registro em games). O gestor não é jogador.
--
-- Regras próprias do day use:
--   * até 12 vagas; duração de 30 min a 12 h (pode cobrir o dia todo);
--   * desistência com reembolso até 24 h antes (aulas: 48 h);
--   * lista de quem entrou é visível para os jogadores (só nome e foto).
-- Somente aditivo: tabelas/funções existentes do app não mudam; nas aulas,
-- só ganham a coluna kind (default 'course') e o professor passa a ser
-- opcional quando kind = 'day_use'.

alter table public.classes add column if not exists kind text not null default 'course';
alter table public.classes drop constraint if exists classes_kind_check;
alter table public.classes add constraint classes_kind_check check (kind in ('course', 'day_use'));

-- Professor: obrigatório no curso, vazio no day use.
alter table public.classes drop constraint if exists classes_coach_name_check;
alter table public.classes add constraint classes_coach_name_check
  check (kind = 'day_use' or char_length(coach_name) between 2 and 80);

create index if not exists classes_kind_idx on public.classes (kind, start_date) where status = 'active';

-- Cria o day use e bloqueia a agenda, tudo ou nada.
create or replace function public.create_day_use(
  p_court_id uuid, p_title text, p_description text, p_capacity integer, p_price numeric,
  p_start text, p_end text)  -- 'YYYY-MM-DDTHH:MM' na hora local do clube
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_venue uuid;
  v_sport text;
  v_class uuid;
  v_session uuid;
  v_start timestamptz := p_start::timestamp at time zone 'UTC';
  v_end timestamptz := p_end::timestamp at time zone 'UTC';
  v_conflicts text;
begin
  select c.venue_id, c.sport_type into v_venue, v_sport
  from courts c join venues v on v.id = c.venue_id
  where c.id = p_court_id and v.admin_id = auth.uid();
  if v_venue is null then
    raise exception 'Você não administra esta quadra.' using errcode = '42501';
  end if;

  if p_capacity is null or p_capacity < 1 or p_capacity > 12 then
    raise exception 'O day use pode ter de 1 a 12 vagas.';
  end if;
  if v_end <= v_start then
    raise exception 'O horário de término precisa ser depois do início.';
  end if;
  if v_end - v_start < interval '30 minutes' or v_end - v_start > interval '12 hours' then
    raise exception 'O day use deve durar entre 30 minutos e 12 horas.';
  end if;
  if (v_start at time zone 'UTC')::date <> (v_end at time zone 'UTC')::date then
    raise exception 'O day use deve começar e terminar no mesmo dia.';
  end if;
  if v_start <= class_wall_now() then
    raise exception 'O day use precisa ser no futuro.';
  end if;

  select string_agg(distinct to_char(s.start_time at time zone 'UTC', 'HH24:MI'), ', ')
  into v_conflicts
  from slots s
  where s.court_id = p_court_id
    and tstzrange(s.start_time, s.end_time) && tstzrange(v_start, v_end)
    and (s.is_available = false
         or exists (select 1 from bookings b where b.slot_id = s.id and b.status <> 'cancelled')
         or exists (select 1 from games g where g.slot_id = s.id and g.status in ('scheduled', 'confirmed_booking')));
  if v_conflicts is not null then
    raise exception 'Horários já ocupados na quadra: %', v_conflicts using hint = 'conflict';
  end if;

  insert into classes (venue_id, court_id, kind, title, coach_name, description, level, sport_type,
                       capacity, price, lesson_count, start_date, end_date, schedule_mode, created_by)
  values (v_venue, p_court_id, 'day_use', trim(p_title), '', nullif(trim(p_description), ''), 'todos', v_sport,
          p_capacity, p_price, 1, (v_start at time zone 'UTC')::date, (v_start at time zone 'UTC')::date,
          'custom', auth.uid())
  returning id into v_class;

  insert into class_sessions (class_id, starts_at, ends_at) values (v_class, v_start, v_end)
  returning id into v_session;
  perform class_block_session(v_session, p_court_id, v_start, v_end);
  return v_class;
end;
$$;

revoke all on function public.create_day_use(uuid, text, text, integer, numeric, text, text) from public, anon;
grant execute on function public.create_day_use(uuid, text, text, integer, numeric, text, text) to authenticated;

-- Desistência: day use até 24 h antes; curso até 48 h antes (regra anterior).
create or replace function public.class_leave(p_enrollment_id uuid, p_player_id uuid)
returns table (payment_intent_id text, class_title text)
language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_first timestamptz;
  v_title text;
  v_kind text;
  v_hours integer;
begin
  select * into e from class_enrollments where id = p_enrollment_id for update;
  if e.id is null or e.player_id <> p_player_id then
    raise exception 'Inscrição não encontrada.' using hint = 'user';
  end if;
  if e.status <> 'active' then
    raise exception 'Esta inscrição já foi cancelada.' using hint = 'user';
  end if;

  select kind into v_kind from classes where id = e.class_id for update;
  v_hours := case when v_kind = 'day_use' then 24 else 48 end;
  select min(starts_at) into v_first from class_sessions where class_id = e.class_id;
  if v_first - make_interval(hours => v_hours) <= class_wall_now() then
    raise exception 'A desistência com reembolso só é possível até %h antes do início. Fale com o clube.', v_hours
      using hint = 'user';
  end if;

  update class_enrollments set status = 'cancelled', cancelled_at = now() where id = e.id;
  update classes set enrolled_count = greatest(enrolled_count - 1, 0) where id = e.class_id
    returning title into v_title;

  return query select e.stripe_payment_intent_id, v_title;
end;
$$;

revoke all on function public.class_leave(uuid, uuid) from public, anon, authenticated;

-- Quem entrou no day use (nome e foto), visível para os jogadores logados.
-- Só day use; inscrições de curso continuam privadas.
create or replace function public.day_use_players(p_class_id uuid)
returns table (player_id uuid, name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.avatar_url
  from class_enrollments e
  join classes c on c.id = e.class_id and c.kind = 'day_use'
  join profiles p on p.id = e.player_id
  where e.class_id = p_class_id and e.status = 'active'
  order by e.created_at
$$;

revoke all on function public.day_use_players(uuid) from public, anon;
grant execute on function public.day_use_players(uuid) to authenticated;

-- Day use segue o pagamento do futevôlei: valor RETIDO no cartão e cobrado 2h
-- antes do início (função capture-day-use, a cada minuto). Com mais de 6 dias de
-- antecedência o Stripe não segura a retenção, então cobra na hora.
alter table public.class_enrollments add column if not exists payment_held boolean not null default false;
alter table public.class_enrollments add column if not exists captured_at timestamptz;
alter table public.class_enrollments add column if not exists capture_error text;
create index if not exists class_enrollments_held_idx on public.class_enrollments (class_id) where payment_held and status = 'active';
