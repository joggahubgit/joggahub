-- JoggaHub — Supabase Schema
-- Run this in your Supabase SQL Editor

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text,
  phone text,
  skill_level text check (skill_level in ('beginner', 'intermediate', 'advanced')),
  avatar_url text,
  location text,
  preferred_position text,
  role text not null default 'player' check (role in ('player', 'venue_admin')),
  xp integer not null default 0,
  games_played integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- ============================================================
-- VENUES
-- ============================================================
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  lat numeric,
  lng numeric,
  phone text,
  email text,
  description text,
  opening_hours text,
  image_url text,
  admin_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.venues enable row level security;
create policy "Venues viewable by everyone" on public.venues for select using (true);
create policy "Admins can manage their venues" on public.venues for all using (auth.uid() = admin_id);

-- ============================================================
-- COURTS
-- ============================================================
create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues(id) on delete cascade,
  name text not null,
  sport_type text not null default 'football',
  surface text,
  price_per_hour numeric not null default 0,
  min_players integer default 8,
  max_players integer default 14,
  indoor boolean not null default false,
  amenities text[] default '{}',
  images text[] default '{}',
  rating numeric default 0,
  review_count integer default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.courts enable row level security;
create policy "Courts viewable by everyone" on public.courts for select using (true);
create policy "Venue admins can manage courts" on public.courts for all
  using (
    exists (
      select 1 from public.venues v where v.id = courts.venue_id and v.admin_id = auth.uid()
    )
  );

-- ============================================================
-- SLOTS (available time slots per court)
-- ============================================================
create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  court_id uuid references public.courts(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  price_override numeric, -- null = use court.price_per_hour
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  constraint no_overlap exclude using gist (
    court_id with =,
    tstzrange(start_time, end_time) with &&
  )
);

alter table public.slots enable row level security;
create policy "Slots viewable by everyone" on public.slots for select using (true);
create policy "Venue admins can manage slots" on public.slots for all
  using (
    exists (
      select 1 from public.courts c
      join public.venues v on v.id = c.venue_id
      where c.id = slots.court_id and v.admin_id = auth.uid()
    )
  );

-- ============================================================
-- BOOKINGS
-- ============================================================
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid references public.slots(id),
  court_id uuid references public.courts(id),
  created_by uuid references public.profiles(id),
  total_price numeric not null,
  max_players integer not null default 10,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  payment_type text not null default 'full' check (payment_type in ('full', 'split')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.bookings enable row level security;
create policy "Users can view their own bookings" on public.bookings for select
  using (auth.uid() = created_by);
create policy "Users can create bookings" on public.bookings for insert
  with check (auth.uid() = created_by);
create policy "Users can update their own bookings" on public.bookings for update
  using (auth.uid() = created_by);
create policy "Venue admins can view all bookings for their courts" on public.bookings for select
  using (
    exists (
      select 1 from public.courts c
      join public.venues v on v.id = c.venue_id
      where c.id = bookings.court_id and v.admin_id = auth.uid()
    )
  );

-- ============================================================
-- BOOKING PLAYERS (split payment tracking)
-- ============================================================
create table if not exists public.booking_players (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  user_id uuid references public.profiles(id),
  email text, -- for invited players not yet on platform
  amount_owed numeric not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.booking_players enable row level security;
create policy "Players can view their own payment entries" on public.booking_players for select
  using (auth.uid() = user_id);
create policy "Booking creator can view all players" on public.booking_players for select
  using (
    exists (
      select 1 from public.bookings b where b.id = booking_players.booking_id and b.created_by = auth.uid()
    )
  );
create policy "Users can insert their own booking player entry" on public.booking_players for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- GAMES (open games players can join)
-- ============================================================
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  sport_type text not null default 'football',
  skill_level text check (skill_level in ('beginner', 'intermediate', 'advanced', 'mixed')),
  max_players integer not null default 10,
  current_players integer not null default 1,
  price_per_player numeric not null,
  is_open boolean not null default true,
  description text,
  rules text[],
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- Fields added via migrations (not in initial schema — kept here for reference):
  organizer_id uuid references public.profiles(id),
  slot_id uuid references public.slots(id) on delete set null,
  court_id uuid references public.courts(id),
  scheduled_at timestamptz,    -- start datetime (denormalized from slot.start_time for quick display)
  game_type text check (game_type in ('casual', 'competitive')),
  -- Status lifecycle:
  --   scheduled        → game created, open for players
  --   confirmed_booking → minimum players reached (auto-confirmed)
  --   pending_results  → 5 min after slot.end_time, waiting for MVP vote / result
  --   completed        → results submitted or 12h window expired
  --   expired          → game never reached minimum players / was never activated
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed_booking', 'pending_results', 'completed', 'expired')),
  xp_distributed boolean not null default false  -- true only when results were confirmed and XP awarded
);

-- Migration to run on existing Supabase instance:
--   alter table public.games add column if not exists status text not null default 'scheduled'
--     check (status in ('scheduled', 'confirmed_booking', 'pending_results', 'completed', 'expired'));
--   alter table public.games add column if not exists xp_distributed boolean not null default false;
--   alter table public.games add column if not exists organizer_id uuid references public.profiles(id);
--   alter table public.games add column if not exists slot_id uuid references public.slots(id) on delete set null;
--   alter table public.games add column if not exists court_id uuid references public.courts(id);
--   alter table public.games add column if not exists scheduled_at timestamptz;
--   alter table public.games add column if not exists game_type text check (game_type in ('casual', 'competitive'));

alter table public.games enable row level security;
create policy "Open games viewable by everyone" on public.games for select using (true);
create policy "Users can create games" on public.games for insert with check (auth.uid() = created_by);
create policy "Game creators can update their games" on public.games for update using (auth.uid() = created_by);

-- ============================================================
-- REVIEWS
-- ============================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  court_id uuid references public.courts(id) on delete cascade,
  user_id uuid references public.profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(court_id, user_id)
);

alter table public.reviews enable row level security;
create policy "Reviews viewable by everyone" on public.reviews for select using (true);
create policy "Users can create one review per court" on public.reviews for insert with check (auth.uid() = user_id);

-- ============================================================
-- SEED DATA (optional — for development)
-- ============================================================

-- Insert a test venue
-- insert into public.venues (name, address, city, phone, email, description, opening_hours)
-- values (
--   'Arena Sports Center',
--   'Rua das Palmeiras, 123',
--   'São Paulo',
--   '(11) 98765-4321',
--   'contato@arenasports.com.br',
--   'Quadra society de alta qualidade com grama sintética.',
--   'Segunda a Sexta: 08h - 23h | Sábado e Domingo: 07h - 22h'
-- );
