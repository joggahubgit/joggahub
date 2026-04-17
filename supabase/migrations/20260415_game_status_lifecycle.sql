-- Migration: game status lifecycle
-- Adds status + xp_distributed columns to games table
-- Part of: game lifecycle flow (scheduled → confirmed_booking → pending_results → completed)

-- 1. Status column with allowed values
alter table public.games
  add column if not exists status text not null default 'scheduled'
  constraint games_status_check check (
    status in ('scheduled', 'confirmed_booking', 'pending_results', 'completed', 'expired')
  );

-- 2. XP distributed flag — distinguishes completed-with-XP from completed-without-XP
alter table public.games
  add column if not exists xp_distributed boolean not null default false;

-- 3. organizer_id — used everywhere in code but missing from original schema
alter table public.games
  add column if not exists organizer_id uuid references public.profiles(id);

-- 4. slot_id — used in cancel-game edge function and OpenGamePage
alter table public.games
  add column if not exists slot_id uuid references public.slots(id) on delete set null;

-- 5. court_id — used in OpenGamePage for venue lookup
alter table public.games
  add column if not exists court_id uuid references public.courts(id);

-- 6. scheduled_at — denormalized start datetime for quick display
alter table public.games
  add column if not exists scheduled_at timestamptz;

-- 7. game_type — 'casual' or 'competitive'
alter table public.games
  add column if not exists game_type text
  constraint games_game_type_check check (game_type in ('casual', 'competitive'));

-- 8. game_players table (referenced extensively in code but not in original schema)
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade not null,
  player_id uuid references public.profiles(id) not null,
  player_name text not null,
  paid boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (game_id, player_id)
);

alter table public.game_players enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'game_players' and policyname = 'Game players viewable by game participants') then
    create policy "Game players viewable by game participants" on public.game_players
      for select using (
        auth.uid() = player_id or
        exists (select 1 from public.games g where g.id = game_id and g.organizer_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'game_players' and policyname = 'Players can insert themselves') then
    create policy "Players can insert themselves" on public.game_players
      for insert with check (auth.uid() = player_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'game_players' and policyname = 'Organizer can manage game players') then
    create policy "Organizer can manage game players" on public.game_players
      for all using (
        exists (select 1 from public.games g where g.id = game_id and g.organizer_id = auth.uid())
      );
  end if;
end $$;

-- 9. notifications table (used in notify.ts but not in original schema)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null,
  title text not null,
  message text not null,
  game_id uuid references public.games(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'notifications' and policyname = 'Users can view their own notifications') then
    create policy "Users can view their own notifications" on public.notifications
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'notifications' and policyname = 'Service role can insert notifications') then
    create policy "Service role can insert notifications" on public.notifications
      for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'notifications' and policyname = 'Users can mark their notifications as read') then
    create policy "Users can mark their notifications as read" on public.notifications
      for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'games' and policyname = 'Service role can update any game') then
    create policy "Service role can update any game" on public.games
      for update using (true);
  end if;
end $$;
