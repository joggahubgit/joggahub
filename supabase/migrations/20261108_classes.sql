-- Aulas (cursos) oferecidas pelo clube.
--
-- Um curso tem N aulas (sessões) entre a data de início e a de término, numa
-- quadra. Ao criar, os horários das aulas ficam bloqueados na agenda da quadra
-- (slots.is_available = false), do mesmo jeito que uma reserva bloqueia.
-- O aluno paga o curso inteiro pelo app; a inscrição fecha 2h antes da 1ª aula.
--
-- Somente aditivo: nenhuma tabela, policy ou função existente é alterada.
-- Toda escrita passa pelas funções abaixo (o cliente não grava direto).
--
-- Horários seguem a convenção do resto do app: hora local do clube gravada
-- num timestamptz sem conversão ("wall clock"). Por isso o "agora" usado nas
-- regras é a hora de Brasília reinterpretada como UTC (class_wall_now()).

-- ── Tabelas ────────────────────────────────────────────────────────────────

create table if not exists public.classes (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references public.venues(id),
  court_id        uuid not null references public.courts(id),
  title           text not null check (char_length(title) between 3 and 80),
  coach_name      text not null check (char_length(coach_name) between 2 and 80),
  description     text check (description is null or char_length(description) <= 1000),
  level           text not null default 'todos'
                  check (level in ('iniciante', 'intermediario', 'avancado', 'todos')),
  sport_type      text not null,
  capacity        integer not null check (capacity between 1 and 50),
  enrolled_count  integer not null default 0 check (enrolled_count >= 0),
  price           numeric(10,2) not null check (price > 0 and price <= 100000),
  lesson_count    integer not null check (lesson_count between 1 and 100),
  start_date      date not null,
  end_date        date not null,
  schedule_mode   text not null check (schedule_mode in ('weekly', 'custom')),
  status          text not null default 'active' check (status in ('active', 'cancelled')),
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  cancelled_at    timestamptz,
  check (end_date >= start_date),
  check (enrolled_count <= capacity)
);

create index if not exists classes_court_idx on public.classes (court_id, start_date);
create index if not exists classes_venue_idx on public.classes (venue_id, start_date);

create table if not exists public.class_sessions (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  check (ends_at > starts_at),
  unique (class_id, starts_at)
);

create index if not exists class_sessions_class_idx on public.class_sessions (class_id, starts_at);

-- Slots que cada aula bloqueou. created = true → o slot foi criado pela aula
-- (preencher buraco na agenda) e é apagado ao cancelar; false → slot que já
-- existia e volta a ficar disponível.
create table if not exists public.class_session_slots (
  session_id  uuid not null references public.class_sessions(id) on delete cascade,
  slot_id     uuid not null references public.slots(id) on delete cascade,
  created     boolean not null,
  primary key (session_id, slot_id)
);

create index if not exists class_session_slots_slot_idx on public.class_session_slots (slot_id);

create table if not exists public.class_enrollments (
  id                        uuid primary key default gen_random_uuid(),
  class_id                  uuid not null references public.classes(id),
  player_id                 uuid not null references public.profiles(id),
  status                    text not null default 'active'
                            check (status in ('active', 'cancelled')),
  amount_paid               numeric(10,2) not null,
  service_fee               numeric(10,2) not null default 0,
  stripe_session_id         text unique,
  stripe_payment_intent_id  text,
  refunded                  boolean not null default false,
  created_at                timestamptz not null default now(),
  cancelled_at              timestamptz
);

create unique index if not exists class_enrollments_one_active
  on public.class_enrollments (class_id, player_id) where status = 'active';
create index if not exists class_enrollments_player_idx on public.class_enrollments (player_id, created_at desc);

-- ── Segurança (RLS) ────────────────────────────────────────────────────────

alter table public.classes enable row level security;
alter table public.class_sessions enable row level security;
alter table public.class_session_slots enable row level security;
alter table public.class_enrollments enable row level security;

revoke insert, update, delete on public.classes, public.class_sessions,
  public.class_session_slots, public.class_enrollments from anon, authenticated;

-- Catálogo público (como slots/quadras).
drop policy if exists "Classes viewable by everyone" on public.classes;
create policy "Classes viewable by everyone" on public.classes for select using (true);

drop policy if exists "Class sessions viewable by everyone" on public.class_sessions;
create policy "Class sessions viewable by everyone" on public.class_sessions for select using (true);

drop policy if exists "Class session slots viewable by everyone" on public.class_session_slots;
create policy "Class session slots viewable by everyone" on public.class_session_slots for select using (true);

-- Inscrição: o próprio aluno, ou o admin do clube do curso.
drop policy if exists "Players see own enrollments" on public.class_enrollments;
create policy "Players see own enrollments" on public.class_enrollments for select
  using (player_id = auth.uid());

drop policy if exists "Venue admins see class enrollments" on public.class_enrollments;
create policy "Venue admins see class enrollments" on public.class_enrollments for select
  using (exists (
    select 1 from public.classes c join public.venues v on v.id = c.venue_id
    where c.id = class_enrollments.class_id and v.admin_id = auth.uid()
  ));

-- ── Funções ────────────────────────────────────────────────────────────────

-- Hora atual de Brasília na convenção "wall clock" das tabelas.
create or replace function public.class_wall_now()
returns timestamptz language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo') at time zone 'UTC'
$$;

-- Bloqueia a agenda da quadra para uma aula. Erro se houver reserva/bloqueio.
-- Uso interno de create_class.
create or replace function public.class_block_session(p_session_id uuid, p_court_id uuid,
  p_start timestamptz, p_end timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record;
  cursor_t timestamptz := p_start;
  new_slot uuid;
begin
  for s in
    select id, start_time, end_time from slots
    where court_id = p_court_id and tstzrange(start_time, end_time) && tstzrange(p_start, p_end)
    order by start_time
    for update
  loop
    -- buraco antes deste slot → cria slot bloqueado só para a aula
    if s.start_time > cursor_t then
      insert into slots (court_id, start_time, end_time, is_available)
      values (p_court_id, cursor_t, s.start_time, false) returning id into new_slot;
      insert into class_session_slots values (p_session_id, new_slot, true);
    end if;
    update slots set is_available = false where id = s.id;
    insert into class_session_slots values (p_session_id, s.id, false);
    cursor_t := greatest(cursor_t, s.end_time);
  end loop;

  if cursor_t < p_end then
    insert into slots (court_id, start_time, end_time, is_available)
    values (p_court_id, cursor_t, p_end, false) returning id into new_slot;
    insert into class_session_slots values (p_session_id, new_slot, true);
  end if;
end;
$$;

-- Cria o curso e bloqueia a agenda, tudo ou nada.
-- p_sessions: [{"start":"2026-12-01T19:00","end":"2026-12-01T20:00"}, ...]
create or replace function public.create_class(
  p_court_id uuid, p_title text, p_coach_name text, p_description text, p_level text,
  p_capacity integer, p_price numeric, p_lesson_count integer,
  p_start_date date, p_end_date date, p_schedule_mode text, p_sessions jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_venue uuid;
  v_sport text;
  v_class uuid;
  v_session uuid;
  v_conflicts text[] := '{}';
  v_count integer;
  r record;
begin
  select c.venue_id, c.sport_type into v_venue, v_sport
  from courts c join venues v on v.id = c.venue_id
  where c.id = p_court_id and v.admin_id = auth.uid();
  if v_venue is null then
    raise exception 'Você não administra esta quadra.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Datas das aulas inválidas.';
  end if;

  drop table if exists _cs;
  create temp table _cs on commit drop as
    select (e->>'start')::timestamp at time zone 'UTC' as starts_at,
           (e->>'end')::timestamp at time zone 'UTC' as ends_at
    from jsonb_array_elements(p_sessions) e;

  select count(*) into v_count from _cs;
  if v_count <> p_lesson_count then
    raise exception 'O curso tem % aulas, mas % datas foram informadas.', p_lesson_count, v_count;
  end if;
  if exists (select 1 from _cs where starts_at is null or ends_at is null or ends_at <= starts_at) then
    raise exception 'Cada aula precisa de horário de início e fim.';
  end if;
  if exists (select 1 from _cs where ends_at - starts_at < interval '30 minutes'
                                  or ends_at - starts_at > interval '4 hours') then
    raise exception 'Cada aula deve durar entre 30 minutos e 4 horas.';
  end if;
  if exists (select 1 from _cs where (starts_at at time zone 'UTC')::date
                                  <> (ends_at at time zone 'UTC')::date) then
    raise exception 'A aula deve começar e terminar no mesmo dia.';
  end if;
  if (select (min(starts_at) at time zone 'UTC')::date from _cs) <> p_start_date
     or (select (max(starts_at) at time zone 'UTC')::date from _cs) <> p_end_date then
    raise exception 'A primeira aula deve ser na data de início e a última na data de término.';
  end if;
  if exists (select 1 from _cs where starts_at <= class_wall_now()) then
    raise exception 'Todas as aulas precisam ser no futuro.';
  end if;
  if exists (select 1 from _cs a join _cs b on a.ctid < b.ctid
             and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)) then
    raise exception 'Duas aulas do curso estão no mesmo horário.';
  end if;

  -- Conflitos com a agenda: slot já ocupado, reserva ativa ou partida ativa.
  for r in
    select distinct cs.starts_at
    from _cs cs
    join slots s on s.court_id = p_court_id
     and tstzrange(s.start_time, s.end_time) && tstzrange(cs.starts_at, cs.ends_at)
    where s.is_available = false
       or exists (select 1 from bookings b where b.slot_id = s.id and b.status <> 'cancelled')
       or exists (select 1 from games g where g.slot_id = s.id
                  and g.status in ('scheduled', 'confirmed_booking'))
    order by cs.starts_at
  loop
    v_conflicts := v_conflicts || to_char(r.starts_at at time zone 'UTC', 'DD/MM HH24:MI');
  end loop;
  if array_length(v_conflicts, 1) > 0 then
    raise exception 'Horários já ocupados na quadra: %', array_to_string(v_conflicts, ', ')
      using errcode = 'P0001', hint = 'conflict';
  end if;

  insert into classes (venue_id, court_id, title, coach_name, description, level, sport_type,
                       capacity, price, lesson_count, start_date, end_date, schedule_mode, created_by)
  values (v_venue, p_court_id, trim(p_title), trim(p_coach_name), nullif(trim(p_description), ''),
          p_level, v_sport, p_capacity, p_price, p_lesson_count, p_start_date, p_end_date,
          p_schedule_mode, auth.uid())
  returning id into v_class;

  for r in select starts_at, ends_at from _cs order by starts_at loop
    insert into class_sessions (class_id, starts_at, ends_at)
    values (v_class, r.starts_at, r.ends_at) returning id into v_session;
    perform class_block_session(v_session, p_court_id, r.starts_at, r.ends_at);
  end loop;

  return v_class;
end;
$$;

-- Inscreve o aluno após o pagamento (chamada só pelo servidor/webhook).
-- Idempotente pela sessão do Stripe. Retorna o id da inscrição.
create or replace function public.class_enroll(p_class_id uuid, p_player_id uuid,
  p_stripe_session_id text, p_payment_intent_id text, p_amount numeric, p_fee numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_first timestamptz;
  v_id uuid;
begin
  select id into v_id from class_enrollments where stripe_session_id = p_stripe_session_id;
  if v_id is not null then return v_id; end if;

  select * into c from classes where id = p_class_id for update;
  if c.id is null or c.status <> 'active' then
    raise exception 'Este curso não está mais disponível.' using hint = 'user';
  end if;
  select min(starts_at) into v_first from class_sessions where class_id = p_class_id;
  if v_first - interval '2 hours' <= class_wall_now() then
    raise exception 'As inscrições deste curso já fecharam.' using hint = 'user';
  end if;
  if exists (select 1 from class_enrollments where class_id = p_class_id
             and player_id = p_player_id and status = 'active') then
    raise exception 'Você já está inscrito neste curso.' using hint = 'user';
  end if;
  if c.enrolled_count >= c.capacity then
    raise exception 'O curso está lotado.' using hint = 'user';
  end if;

  insert into class_enrollments (class_id, player_id, amount_paid, service_fee,
                                 stripe_session_id, stripe_payment_intent_id)
  values (p_class_id, p_player_id, p_amount, p_fee, p_stripe_session_id, p_payment_intent_id)
  returning id into v_id;
  update classes set enrolled_count = enrolled_count + 1 where id = p_class_id;
  return v_id;
end;
$$;

-- Cancela o curso e libera a agenda (chamada só pelo servidor, que faz os
-- reembolsos no Stripe). Retorna as inscrições ativas para reembolsar.
create or replace function public.class_cancel(p_class_id uuid)
returns table (enrollment_id uuid, player_id uuid, payment_intent_id text)
language plpgsql security definer set search_path = public as $$
begin
  update classes set status = 'cancelled', cancelled_at = now()
  where id = p_class_id and status = 'active';

  -- slots criados pela aula: apaga; slots que já existiam: volta a liberar (se futuros)
  delete from slots where id in (
    select css.slot_id from class_session_slots css
    join class_sessions s on s.id = css.session_id
    where s.class_id = p_class_id and css.created
  );
  update slots set is_available = true
  where start_time > class_wall_now() and id in (
    select css.slot_id from class_session_slots css
    join class_sessions s on s.id = css.session_id
    where s.class_id = p_class_id and not css.created
  );

  return query
    select e.id, e.player_id, e.stripe_payment_intent_id
    from class_enrollments e where e.class_id = p_class_id and e.status = 'active';
end;
$$;

-- Só o servidor (service role) pode inscrever/cancelar; o gestor cria via create_class.
revoke all on function public.class_block_session(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.class_enroll(uuid, uuid, text, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.class_cancel(uuid) from public, anon, authenticated;
revoke all on function public.create_class(uuid, text, text, text, text, integer, numeric, integer, date, date, text, jsonb) from public, anon;
grant execute on function public.create_class(uuid, text, text, text, text, integer, numeric, integer, date, date, text, jsonb) to authenticated;
