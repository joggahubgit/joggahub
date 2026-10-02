-- Futevôlei rating system (ELO-style, per sport_type)
-- Adds player_ratings (current skill rating per player per sport, with a
-- self-declared starting value before any confirmed match) and
-- game_results (dupla-a-dupla confirmed match outcomes).
-- Written for a single paste into the Supabase SQL Editor (no CLI/migration runner in this project).

-- A `game_results` table already existed in this project with an unrelated,
-- unused schema (score_a/score_b/winning_team_id/registered_by/registered_at,
-- 0 rows, no code references anywhere). Drop it (cascades its old policies
-- `read_all`/`organizer_manage`) only if it still has that old shape — safe
-- to paste this whole file again later without wiping real match data once
-- the new schema (marked by the `status` column) is in place.
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'game_results')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_results' and column_name = 'status') then
    drop table public.game_results cascade;
  end if;
end $$;

create table if not exists public.player_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  sport_type text not null,
  rating numeric not null default 1.5 check (rating >= 1.0 and rating <= 7.0),
  matches_played integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (player_id, sport_type)
);

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade unique,
  winner_ids uuid[] not null,
  loser_ids uuid[] not null,
  submitted_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'disputed')),
  confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- player_ratings may already exist from an earlier partial run of this file
-- without the rating range check — add it now if missing.
do $$ begin
  alter table public.player_ratings add constraint player_ratings_rating_range check (rating >= 1.0 and rating <= 7.0);
exception when duplicate_object then null;
end $$;

alter table public.player_ratings enable row level security;
alter table public.game_results enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'player_ratings' and policyname = 'Ratings viewable by everyone') then
    create policy "Ratings viewable by everyone" on public.player_ratings
      for select using (true);
  end if;
end $$;

-- Self-declared starting level: a player may set their OWN rating only
-- before they have any confirmed match (matches_played = 0). Once a real
-- result updates it, this policy stops allowing further self-edits — only
-- the submit-game-result edge function (service role) can change it after that.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'player_ratings' and policyname = 'Players can set their own initial rating') then
    create policy "Players can set their own initial rating" on public.player_ratings
      for insert with check (auth.uid() = player_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'player_ratings' and policyname = 'Players can edit their own rating before playing') then
    create policy "Players can edit their own rating before playing" on public.player_ratings
      for update using (auth.uid() = player_id and matches_played = 0)
      with check (auth.uid() = player_id and matches_played = 0);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'game_results' and policyname = 'Game results viewable by game participants') then
    create policy "Game results viewable by game participants" on public.game_results
      for select using (
        exists (
          select 1 from public.game_players gp
          where gp.game_id = game_results.game_id and gp.player_id = auth.uid()
        )
      );
  end if;
end $$;

-- No insert/update/delete policies for game_results, and no update/delete
-- for player_ratings once matches_played > 0: all of that goes through the
-- submit-game-result edge function using the service-role key, which
-- bypasses RLS entirely (same pattern as the payment-related tables in
-- this project).
