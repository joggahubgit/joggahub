-- Rating history: one row per player per confirmed match, so the profile
-- can show a rating-over-time chart and per-match before/after deltas.
-- Written by submit-game-result and process-game-transitions whenever a
-- game_results row becomes 'confirmed' (never for draw/invalid — no rating change there).

create table if not exists public.player_rating_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  sport_type text not null,
  game_id uuid references public.games(id) on delete set null,
  rating numeric not null,
  matches_played integer not null,
  created_at timestamptz not null default now()
);

create index if not exists player_rating_history_player_sport_idx
  on public.player_rating_history (player_id, sport_type, created_at);

alter table public.player_rating_history enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'player_rating_history' and policyname = 'Rating history viewable by everyone') then
    create policy "Rating history viewable by everyone" on public.player_rating_history
      for select using (true);
  end if;
end $$;

-- No insert/update/delete policy: only the service role (edge functions) writes here.

-- Teammates/opponents need to see each other's game_players rows (name,
-- team) for match history and stats — today only the organizer can see
-- rows other than their own. Add a policy so any co-participant in the
-- same game can read the roster, alongside the existing organizer/self policies.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'game_players' and policyname = 'Co-participants can view the roster') then
    create policy "Co-participants can view the roster" on public.game_players
      for select using (
        exists (
          select 1 from public.game_players gp2
          where gp2.game_id = game_players.game_id and gp2.player_id = auth.uid()
        )
      );
  end if;
end $$;
