/** Community feed + futevôlei rankings, ported from Community.tsx (web). */
import { supabase } from '@/lib/supabase';
import { PROVISIONAL_MATCHES_THRESHOLD } from '@/lib/shared';

export interface RankingRow {
  position: number;
  id: string;
  name: string;
  rating: number;
  matches_played: number;
  avatarUrl: string | null;
  location: string | null;
}

const toRows = (data: any[] | null): RankingRow[] =>
  (data ?? []).map((r, i) => ({
    position: i + 1,
    id: r.player_id,
    name: r.profiles?.name ?? 'Jogador',
    rating: r.rating,
    matches_played: r.matches_played,
    avatarUrl: r.profiles?.avatar_url ?? null,
    location: r.profiles?.location ?? null,
  }));

export async function fetchRankings(): Promise<RankingRow[]> {
  const { data, error } = await supabase
    .from('player_ratings')
    .select('player_id, rating, matches_played, profiles(name, avatar_url, location)')
    .eq('sport_type', 'futevolei')
    .order('rating', { ascending: false })
    .limit(500);
  if (error) throw error;
  return toRows(data);
}

export interface VenueOption {
  id: string;
  name: string;
}

/** Clubs where the user played futevôlei (options for the "Clube" scope). */
export async function fetchMyFutevoleiVenues(userId: string): Promise<VenueOption[]> {
  const { data, error } = await supabase.from('game_players').select('games(sport_type, courts(venue_id, venues(id, name)))').eq('player_id', userId);
  if (error) throw error;
  const byId: Record<string, VenueOption> = {};
  for (const row of (data ?? []) as any[]) {
    const g = row.games;
    if (g?.sport_type !== 'futevolei') continue;
    const v = g?.courts?.venues;
    if (v?.id) byId[v.id] = { id: v.id, name: v.name };
  }
  return Object.values(byId);
}

/** Ranking of players with 10+ confirmed matches who played at a club. */
export async function fetchClubRankings(venueId: string): Promise<RankingRow[]> {
  const { data: games } = await supabase.from('games').select('id, courts(venue_id)').eq('sport_type', 'futevolei');
  const gameIds = ((games ?? []) as any[]).filter(g => g.courts?.venue_id === venueId).map(g => g.id);
  if (!gameIds.length) return [];
  const { data: roster } = await supabase.from('game_players').select('player_id').in('game_id', gameIds);
  const playerIds = [...new Set((roster ?? []).map(r => r.player_id))];
  if (!playerIds.length) return [];
  const { data, error } = await supabase
    .from('player_ratings')
    .select('player_id, rating, matches_played, profiles(name, avatar_url, location)')
    .eq('sport_type', 'futevolei')
    .in('player_id', playerIds)
    .gte('matches_played', PROVISIONAL_MATCHES_THRESHOLD)
    .order('rating', { ascending: false });
  if (error) throw error;
  return toRows(data);
}

export interface FeedPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface FeedItem {
  id: string;
  gameId: string;
  date: string | null;
  venueName: string;
  sets: { a: number; b: number }[];
  teamA: FeedPerson[];
  teamB: FeedPerson[];
  winningTeam: 'a' | 'b' | null;
}

export async function fetchFeed(): Promise<FeedItem[]> {
  const { data: results, error } = await supabase
    .from('game_results')
    .select('id, game_id, sets, winner_ids, confirmed_at')
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  if (!results?.length) return [];
  const gameIds = results.map(r => r.game_id);
  const [{ data: games }, { data: players }] = await Promise.all([
    supabase.from('games').select('id, scheduled_at, court_id, courts(name, venue_id, venues(name))').in('id', gameIds),
    supabase.from('game_players').select('game_id, player_id, player_name, team').in('game_id', gameIds),
  ]);
  const playerIds = [...new Set((players ?? []).map(p => p.player_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, avatar_url').in('id', playerIds);
  const avatar = Object.fromEntries((profiles ?? []).map(p => [p.id, p.avatar_url ?? null]));
  const gameById = Object.fromEntries(((games ?? []) as any[]).map(g => [g.id, g]));
  const byGame: Record<string, { player_id: string; player_name: string; team: string }[]> = {};
  for (const p of players ?? []) (byGame[p.game_id] ??= []).push(p);

  return results.map(r => {
    const roster = byGame[r.game_id] ?? [];
    const person = (p: { player_id: string; player_name: string }) => ({ id: p.player_id, name: p.player_name, avatarUrl: avatar[p.player_id] ?? null });
    const winners: string[] = r.winner_ids ?? [];
    const teamA = roster.filter(p => p.team === 'a').map(person);
    const teamB = roster.filter(p => p.team === 'b').map(person);
    const game = gameById[r.game_id];
    return {
      id: r.id,
      gameId: r.game_id,
      date: game?.scheduled_at ?? null,
      venueName: game?.courts?.venues?.name ?? game?.courts?.name ?? '',
      sets: r.sets ?? [],
      teamA,
      teamB,
      winningTeam: !winners.length ? null : teamA.some(p => winners.includes(p.id)) ? 'a' : 'b',
    };
  });
}
