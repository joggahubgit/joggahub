-- Desistência do aluno: reembolso total até 48h antes da 1ª aula.
-- Chamada só pelo servidor (função leave-class), que faz o reembolso no Stripe.
-- Somente aditivo.

create or replace function public.class_leave(p_enrollment_id uuid, p_player_id uuid)
returns table (payment_intent_id text, class_title text)
language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_first timestamptz;
  v_title text;
begin
  select * into e from class_enrollments where id = p_enrollment_id for update;
  if e.id is null or e.player_id <> p_player_id then
    raise exception 'Inscrição não encontrada.' using hint = 'user';
  end if;
  if e.status <> 'active' then
    raise exception 'Esta inscrição já foi cancelada.' using hint = 'user';
  end if;

  perform 1 from classes where id = e.class_id for update;
  select min(starts_at) into v_first from class_sessions where class_id = e.class_id;
  if v_first - interval '48 hours' <= class_wall_now() then
    raise exception 'A desistência com reembolso só é possível até 48h antes da primeira aula. Fale com o clube.'
      using hint = 'user';
  end if;

  update class_enrollments set status = 'cancelled', cancelled_at = now() where id = e.id;
  update classes set enrolled_count = greatest(enrolled_count - 1, 0) where id = e.class_id
    returning title into v_title;

  return query select e.stripe_payment_intent_id, v_title;
end;
$$;

revoke all on function public.class_leave(uuid, uuid) from public, anon, authenticated;
