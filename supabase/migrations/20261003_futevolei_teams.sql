-- Futevôlei: team assignment at join time (Time A / Time B) + 6h auto-confirm
-- for match results that never get adversarial confirmation.

alter table public.game_players add column if not exists team text check (team in ('a', 'b'));

-- No new RLS needed: game_players insert/select policies already in place
-- cover this column like any other (players write their own row; the app
-- reads it through the same existing game_players select policy).
