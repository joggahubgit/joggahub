-- Fix RLS policies on games table to accept both created_by and organizer_id.
--
-- Background: games were originally created with `created_by`, but the current
-- flow uses `organizer_id` (added later via migration). The old INSERT and UPDATE
-- policies only checked `created_by`, silently blocking inserts and updates from
-- the client for any game created by the new flow.

-- Drop old policies
drop policy if exists "Users can create games" on public.games;
drop policy if exists "Game creators can update their games" on public.games;

-- Re-create INSERT: allow if the user is setting themselves as creator
create policy "Users can create games" on public.games
  for insert with check (
    auth.uid() = created_by or auth.uid() = organizer_id
  );

-- Re-create UPDATE: allow if the user is the organizer (either field)
create policy "Game creators can update their games" on public.games
  for update using (
    auth.uid() = created_by or auth.uid() = organizer_id
  );
