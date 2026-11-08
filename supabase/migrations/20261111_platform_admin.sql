-- Administração do JoggaHub (repasses aos clubes).
--
-- Quem é admin fica na tabela platform_admins (adicionar pelo SQL Editor):
--   insert into platform_admins (user_id) select id from auth.users where email = 'seu@email.com';
-- Toda função admin_* confere is_platform_admin() no servidor; o cliente não
-- lê nem grava as tabelas direto. Somente aditivo.

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;
grant execute on function public.is_platform_admin() to authenticated;

-- Visão geral: um item por clube
create or replace function public.admin_payouts_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Acesso restrito à administração do JoggaHub.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'venue_id', v.id, 'venue_name', v.name, 'city', v.city,
      'summary', venue_payout_summary(v.id)
    ) order by v.name)
    from venues v
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_register_payout(p_venue uuid, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Acesso restrito à administração do JoggaHub.' using errcode = '42501';
  end if;
  return register_venue_payout(p_venue, nullif(trim(p_note), ''));
end;
$$;

create or replace function public.admin_set_payout_schedule(p_venue uuid, p_schedule text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Acesso restrito à administração do JoggaHub.' using errcode = '42501';
  end if;
  if p_schedule not in ('per_game', 'weekly') then
    raise exception 'Regra inválida.';
  end if;
  insert into venue_payout_settings (venue_id, schedule) values (p_venue, p_schedule)
  on conflict (venue_id) do update set schedule = excluded.schedule;
end;
$$;

revoke all on function public.admin_payouts_overview() from public, anon;
revoke all on function public.admin_register_payout(uuid, text) from public, anon;
revoke all on function public.admin_set_payout_schedule(uuid, text) from public, anon;
grant execute on function public.admin_payouts_overview() to authenticated;
grant execute on function public.admin_register_payout(uuid, text) to authenticated;
grant execute on function public.admin_set_payout_schedule(uuid, text) to authenticated;
