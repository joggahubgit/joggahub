-- Close client-side write holes now that money flows run on the server
-- (create-*-checkout-session, finalize-checkout/stripe-webhook, join-free-game,
-- leave-game, cancel-game, cancel-booking). Edge functions use the service role,
-- which bypasses RLS, so none of them is affected.
--
-- Before: any signed-in user could
--   * update ANY game (policy "Service role can update any game" was USING true),
--   * join any game as paid without paying (insert into game_players paid=true),
--   * create games, and create/update their own bookings (e.g. payment_status='paid'),
--   * send any notification to anyone.
-- The game-status updates the web still fires (scheduled -> confirmed/expired) are
-- redundant: the process-game-transitions cron does the same. Without permission
-- they simply update 0 rows (no error).

begin;

-- ── games ────────────────────────────────────────────────────────────────────
drop policy if exists "Service role can update any game"            on public.games;
drop policy if exists "Organizer and participants can update games" on public.games;
drop policy if exists "Organizer can update their games"            on public.games;
drop policy if exists "Game creators can update their games"        on public.games;
drop policy if exists "Users can create games"                      on public.games;
-- kept: SELECT policies; "Venue admins can update games on their courts" (gestor).

-- ── game_players ─────────────────────────────────────────────────────────────
drop policy if exists "Players can join games"             on public.game_players;
drop policy if exists "Players can insert themselves"      on public.game_players;
drop policy if exists "Organizer can manage game players"  on public.game_players;
drop policy if exists "Players can remove themselves"      on public.game_players;
-- kept: SELECT policies. Joining/leaving/removing goes through edge functions.

-- ── bookings ─────────────────────────────────────────────────────────────────
drop policy if exists "Users can create bookings"          on public.bookings;
drop policy if exists "Users can update their own bookings" on public.bookings;
-- The gestor marks bookings as paid / cancelled from the venue panel. Bookings are
-- created_by the player, so the old owner-only policy silently blocked the gestor.
drop policy if exists "Venue admins can update bookings for their courts" on public.bookings;
create policy "Venue admins can update bookings for their courts" on public.bookings
  for update to authenticated
  using (exists (
    select 1 from public.courts c join public.venues v on v.id = c.venue_id
    where c.id = bookings.court_id and v.admin_id = auth.uid()))
  with check (exists (
    select 1 from public.courts c join public.venues v on v.id = c.venue_id
    where c.id = bookings.court_id and v.admin_id = auth.uid()));

-- ── booking_players (unused by the apps) ─────────────────────────────────────
drop policy if exists "Users can insert their own booking player entry" on public.booking_players;

-- ── notifications ────────────────────────────────────────────────────────────
-- "Service role can insert notifications" was WITH CHECK (true) for everyone; the
-- service role does not need a policy at all.
drop policy if exists "Service role can insert notifications" on public.notifications;
-- Clients only create chat notifications. Sender and recipient must both be in the game.
drop policy if exists "Game-related notifications between real participants" on public.notifications;
create policy "Chat notifications between game participants" on public.notifications
  for insert to authenticated
  with check (
    type = 'chat_message'
    and game_id is not null
    and (
      exists (select 1 from public.games g where g.id = notifications.game_id and g.organizer_id = auth.uid())
      or exists (select 1 from public.game_players gp where gp.game_id = notifications.game_id and gp.player_id = auth.uid())
    )
    and (
      exists (select 1 from public.games g where g.id = notifications.game_id and g.organizer_id = notifications.user_id)
      or exists (select 1 from public.game_players gp where gp.game_id = notifications.game_id and gp.player_id = notifications.user_id)
    )
  );

commit;
