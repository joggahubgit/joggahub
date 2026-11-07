-- Protege os horários das aulas na agenda.
--
-- O gestor pode apagar/liberar slots direto (RLS "Venue admins can manage
-- slots"), por "Remover horários", pelo modal do horário e por "Criar
-- disponibilidade". Sem esta trava, um horário de aula seria apagado ou
-- liberado em silêncio e alguém poderia reservar por cima do curso.
--
-- A trava é silenciosa de propósito: nunca gera erro (para não quebrar
-- cancelamentos de reserva que liberam faixas de horário). Para slots de um
-- curso ATIVO:
--   * UPDATE que liberaria o slot → o slot continua bloqueado;
--   * DELETE → a linha é mantida (as outras do mesmo comando seguem normais).
-- class_cancel marca o curso como cancelado ANTES de liberar a agenda, então
-- o cancelamento do curso passa normalmente.
-- Slots que não são de aula: nada muda.

create or replace function public.guard_class_slots()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_class boolean;
begin
  select exists (
    select 1 from class_session_slots css
    join class_sessions s on s.id = css.session_id
    join classes c on c.id = s.class_id
    where css.slot_id = old.id and c.status = 'active'
  ) into is_class;

  if not is_class then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    return null;              -- mantém o slot da aula
  end if;

  new.is_available := false;  -- continua bloqueado
  new.start_time := old.start_time;
  new.end_time := old.end_time;
  new.court_id := old.court_id;
  return new;
end;
$$;

drop trigger if exists trg_guard_class_slots on public.slots;
create trigger trg_guard_class_slots
  before update or delete on public.slots
  for each row execute function public.guard_class_slots();
