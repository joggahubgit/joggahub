-- Futevôlei: replace manual winner-pick with real set scores, validated
-- against competitive rules (best of 3, sets to 18/18/15, win by 2).

alter table public.game_results add column if not exists sets jsonb;
alter table public.game_results alter column winner_ids drop not null;
alter table public.game_results alter column loser_ids drop not null;

alter table public.game_results drop constraint if exists game_results_status_check;
alter table public.game_results add constraint game_results_status_check
  check (status in ('pending', 'confirmed', 'disputed', 'invalid', 'draw'));
