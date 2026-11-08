-- Backoffice da administração JoggaHub: previsão de repasses, arenas, dados
-- bancários (PIX) dos clubes e equipe de administradores.
-- Toda função admin_* confere is_platform_admin() no servidor. Somente aditivo.

-- Dados bancários do clube para os repasses
alter table public.venue_payout_settings add column if not exists pix_key text;
alter table public.venue_payout_settings add column if not exists account_holder text;
alter table public.venue_payout_settings add column if not exists document text;   -- CPF/CNPJ
alter table public.venue_payout_settings add column if not exists updated_at timestamptz default now();

create or replace function public.admin_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Acesso restrito à administração do JoggaHub.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.admin_guard() from public, anon, authenticated;

-- Data em que cada valor deve ser repassado, pela regra do clube:
--   por partida → no dia da partida/aula;  semanal → na segunda-feira seguinte.
create or replace function public.payout_due_date(p_schedule text, p_event timestamptz)
returns date language sql immutable as $$
  select case
    when p_schedule = 'weekly'
      then ((date_trunc('week', p_event at time zone 'UTC') + interval '7 days'))::date
    else (p_event at time zone 'UTC')::date
  end
$$;

-- Previsão de repasses: pagos/retidos ainda não repassados, por data prevista e clube.
create or replace function public.admin_payout_forecast(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((
    with v as (
      select v.id, v.name,
        coalesce(s.schedule, 'per_game') as schedule,
        coalesce((select max(covers_until) from venue_payouts p where p.venue_id = v.id), '2000-01-01'::timestamptz) as covered
      from venues v left join venue_payout_settings s on s.venue_id = v.id
    ),
    e as (
      select v.id as venue_id, v.name as venue_name, v.schedule, x.*
      from v, lateral venue_finance_entries(v.id, (p_from - 14), (p_to + 1)) x
      where x.status in ('recebido', 'a_cobrar', 'reservado') and x.event_at > v.covered
    ),
    d as (
      select payout_due_date(schedule, event_at) as due_date, venue_id, venue_name, schedule,
        sum(amount) filter (where status = 'recebido') as paid,
        sum(amount) filter (where status <> 'recebido') as held,
        count(*) as items
      from e group by 1, 2, 3, 4
    )
    select jsonb_agg(to_jsonb(d) order by d.due_date, d.venue_name)
    from d where d.due_date between p_from and p_to
  ), '[]'::jsonb);
end;
$$;

-- Arenas: dados, gestor, quadras, regra e dados bancários, números do mês
create or replace function public.admin_venues()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m_from date := date_trunc('month', class_wall_now() at time zone 'UTC')::date;
  m_to date := (date_trunc('month', class_wall_now() at time zone 'UTC') + interval '1 month - 1 day')::date;
begin
  perform admin_guard();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'name', v.name, 'city', v.city, 'address', v.address, 'phone', v.phone, 'email', v.email,
      'description', v.description, 'created_at', v.created_at,
      'admin_id', v.admin_id,
      'admin_email', (select u.email from auth.users u where u.id = v.admin_id),
      'admin_last_sign_in', (select u.last_sign_in_at from auth.users u where u.id = v.admin_id),
      'courts', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sport_type', c.sport_type,
                    'price_per_hour', c.price_per_hour, 'is_active', c.is_active) order by c.name)
                  from courts c where c.venue_id = v.id), '[]'::jsonb),
      'payout', jsonb_build_object(
        'schedule', coalesce(s.schedule, 'per_game'), 'pix_key', s.pix_key,
        'account_holder', s.account_holder, 'document', s.document),
      'month_club_paid', coalesce((select sum(amount) from venue_finance_entries(v.id, m_from, m_to) e where e.status = 'recebido'), 0),
      'month_items', coalesce((select count(*) from venue_finance_entries(v.id, m_from, m_to) e where e.status <> 'cancelado'), 0)
    ) order by v.name)
    from venues v left join venue_payout_settings s on s.venue_id = v.id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_update_venue(p_venue uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  update venues set
    name = coalesce(nullif(trim(p_data->>'name'), ''), name),
    city = coalesce(p_data->>'city', city),
    address = coalesce(p_data->>'address', address),
    phone = coalesce(p_data->>'phone', phone),
    email = coalesce(p_data->>'email', email)
  where id = p_venue;
  insert into venue_payout_settings (venue_id, schedule, pix_key, account_holder, document, updated_at)
  values (p_venue, coalesce(p_data->>'schedule', 'per_game'), p_data->>'pix_key', p_data->>'account_holder', p_data->>'document', now())
  on conflict (venue_id) do update set
    schedule = coalesce(excluded.schedule, venue_payout_settings.schedule),
    pix_key = excluded.pix_key, account_holder = excluded.account_holder, document = excluded.document,
    updated_at = now();
end;
$$;

create or replace function public.admin_set_court_active(p_court uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  update courts set is_active = p_active where id = p_court;
end;
$$;

create or replace function public.admin_add_court(p_venue uuid, p_name text, p_sport text, p_price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform admin_guard();
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Dê um nome à quadra.'; end if;
  if p_sport not in ('futevolei', 'society', 'futsal', 'football') then raise exception 'Modalidade inválida.'; end if;
  insert into courts (venue_id, name, sport_type, price_per_hour, is_active)
  values (p_venue, trim(p_name), p_sport, coalesce(p_price, 0), true) returning id into v_id;
  return v_id;
end;
$$;

-- Equipe
create or replace function public.admin_list_admins()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_guard();
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'since', a.created_at,
                     'last_sign_in', u.last_sign_in_at, 'me', a.user_id = auth.uid()) order by a.created_at)
                   from platform_admins a join auth.users u on u.id = a.user_id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_add_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform admin_guard();
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Não existe conta com esse email. Peça para a pessoa se cadastrar no site primeiro.';
  end if;
  insert into platform_admins (user_id) values (v_user) on conflict do nothing;
end;
$$;

create or replace function public.admin_remove_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_user = auth.uid() then raise exception 'Você não pode remover a si mesmo.'; end if;
  if (select count(*) from platform_admins) <= 1 then raise exception 'Precisa haver pelo menos um administrador.'; end if;
  delete from platform_admins where user_id = p_user;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_payout_forecast(date, date)', 'admin_venues()', 'admin_update_venue(uuid, jsonb)',
    'admin_set_court_active(uuid, boolean)', 'admin_add_court(uuid, text, text, numeric)',
    'admin_list_admins()', 'admin_add_admin(text)', 'admin_remove_admin(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Usado pela função admin-create-venue (service role) para achar conta existente pelo email
create or replace function public.admin_find_user_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;
revoke all on function public.admin_find_user_by_email(text) from public, anon, authenticated;
