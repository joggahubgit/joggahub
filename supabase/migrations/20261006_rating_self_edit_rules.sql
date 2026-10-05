-- Player-side rating changes go through two functions with the rules inside:
--
--   declare_initial_rating(sport, rating) — once, before any rating exists:
--     at most the highest self-declared level (5.5), starts at 0 matches.
--   lower_my_rating(sport, rating) — any time, only DOWN (never below 1.0).
--
-- Raising a rating only happens through match results (submit-game-result /
-- process-game-transitions, service role — not affected by any of this).
--
-- Before: players wrote player_ratings directly. The INSERT policy only
-- checked ownership (a player could create themselves at 7.0 with 50
-- matches), the UPDATE policy allowed any value while matches_played = 0,
-- and nothing could be lowered after the first match. The baseline history
-- row the app tried to insert always failed (history has no INSERT policy).
--
-- DEPLOY IN TWO STEPS so the live app never breaks:
--   PART 1 (functions) → deploy the frontend that calls them → PART 2 (close
--   direct writes).

-- ═════════════════════════════ PART 1 ═════════════════════════════

create or replace function public.declare_initial_rating(p_sport text, p_rating numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_rating is null or p_rating < 1.0 or p_rating > 5.5 then
    raise exception 'Nível inicial inválido (entre 1.0 e 5.5)';
  end if;
  if exists (select 1 from player_ratings where player_id = v_uid and sport_type = p_sport) then
    raise exception 'Seu nível inicial já foi definido';
  end if;

  insert into player_ratings (player_id, sport_type, rating, matches_played)
  values (v_uid, p_sport, p_rating, 0);

  -- Baseline point (game_id null) for the evolution chart / first-match delta
  insert into player_rating_history (player_id, sport_type, game_id, rating, matches_played)
  values (v_uid, p_sport, null, p_rating, 0);
end;
$$;

create or replace function public.lower_my_rating(p_sport text, p_rating numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current player_ratings%rowtype;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select * into v_current from player_ratings
  where player_id = v_uid and sport_type = p_sport
  for update;
  if not found then raise exception 'Você ainda não tem nível definido'; end if;

  if p_rating is null or p_rating < 1.0 then
    raise exception 'O nível mínimo é 1.0';
  end if;
  if p_rating >= v_current.rating then
    raise exception 'O nível só pode ser reduzido manualmente — para subir, jogue partidas.';
  end if;

  update player_ratings
  set rating = p_rating, updated_at = now()
  where player_id = v_uid and sport_type = p_sport;

  insert into player_rating_history (player_id, sport_type, game_id, rating, matches_played)
  values (v_uid, p_sport, null, p_rating, v_current.matches_played);
end;
$$;

revoke all on function public.declare_initial_rating(text, numeric) from public, anon;
revoke all on function public.lower_my_rating(text, numeric) from public, anon;
grant execute on function public.declare_initial_rating(text, numeric) to authenticated;
grant execute on function public.lower_my_rating(text, numeric) to authenticated;

-- ═════════════════════════════ PART 2 ═════════════════════════════
-- Run only after the frontend using the functions above is live.

drop policy if exists "Players can set their own initial rating" on public.player_ratings;
drop policy if exists "Players can edit their own rating before playing" on public.player_ratings;
