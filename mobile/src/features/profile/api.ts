/** Profile/stats queries ported from Profile.tsx, PublicProfile.tsx and PlayerStatsSection.tsx (web). */
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

export interface ProfileCounts {
  asOrganizer: number;
  asPlayer: number;
  followers: number;
  following: number;
}

export async function fetchProfileCounts(userId: string): Promise<ProfileCounts> {
  const [org, player, followers, following] = await Promise.all([
    supabase.from('games').select('id', { count: 'exact', head: true }).eq('organizer_id', userId),
    supabase.from('game_players').select('id', { count: 'exact', head: true }).eq('player_id', userId),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  return { asOrganizer: org.count ?? 0, asPlayer: player.count ?? 0, followers: followers.count ?? 0, following: following.count ?? 0 };
}

export interface RatingRow {
  rating: number;
  matches_played: number;
}

export async function fetchFutevoleiRating(userId: string): Promise<RatingRow | null> {
  const { data, error } = await supabase
    .from('player_ratings')
    .select('rating, matches_played')
    .eq('player_id', userId)
    .eq('sport_type', 'futevolei')
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** One-time self-declared level — the RPC writes the baseline history point and enforces the rules. */
export async function declareInitialRating(rating: number) {
  const { error } = await supabase.rpc('declare_initial_rating', { p_sport: 'futevolei', p_rating: rating });
  if (error) throw error;
}

/** Lowering only; raising happens through matches (enforced by the DB function). */
export async function lowerMyRating(rating: number) {
  const { error } = await supabase.rpc('lower_my_rating', { p_sport: 'futevolei', p_rating: rating });
  if (error) throw error;
}

export interface PickedImage {
  uri: string;
  mime: string;
}

/** Opens the photo library (square crop). Returns null if the user cancelled. */
export async function pickAvatar(): Promise<PickedImage | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
  if (picked.canceled || !picked.assets?.[0]) return null;
  return { uri: picked.assets[0].uri, mime: picked.assets[0].mimeType ?? 'image/jpeg' };
}

/** Uploads to `avatars/{userId}/avatar.{ext}` (same path/policies as the web) and returns a cache-busted public URL. */
export async function uploadAvatar(userId: string, image: PickedImage): Promise<string> {
  const ext = image.mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${userId}/avatar.${ext}`;
  const body = await (await fetch(image.uri)).arrayBuffer();
  const { error } = await supabase.storage.from('avatars').upload(path, body, { upsert: true, contentType: image.mime });
  if (error) throw new Error('Não foi possível enviar a foto. Tente novamente.');
  return `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

/** Profile screen's camera button: pick, upload and save in one go. Null if cancelled. */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const image = await pickAvatar();
  if (!image) return null;
  const publicUrl = await uploadAvatar(userId, image);
  const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
  if (error) throw new Error('Foto enviada, mas não foi possível salvar no seu perfil.');
  return publicUrl;
}

/** Saves profile fields; checks a row was actually updated (RLS can silently match 0 rows). */
export async function updateProfile(userId: string, fields: Record<string, unknown>) {
  const { data, error } = await supabase.from('profiles').update(fields).eq('id', userId).select('id');
  if (error || !data?.length) throw new Error('Não foi possível salvar. Tente novamente.');
}

// ── Player stats (PlayerStatsSection) ─────────────────────────────────────────

export interface PersonRef {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number | null;
}

export type ResultStatus = 'pending' | 'confirmed' | 'disputed' | 'invalid' | 'draw';

export interface MatchSummary {
  gameId: string;
  date: string | null;
  venueName: string;
  status: ResultStatus;
  won: boolean | null;
  teammate: PersonRef | null;
  opponents: PersonRef[];
  ratingAfter: number | null;
  ratingDelta: number | null;
}

export interface PlayerStats {
  rating: RatingRow | null;
  history: { rating: number; createdAt: string }[];
  matches: MatchSummary[];
}

export async function fetchPlayerStats(userId: string): Promise<PlayerStats> {
  const [{ data: ratingRow }, { data: historyRows }, { data: myRows }] = await Promise.all([
    supabase.from('player_ratings').select('rating, matches_played').eq('player_id', userId).eq('sport_type', 'futevolei').maybeSingle(),
    supabase.from('player_rating_history').select('rating, created_at').eq('player_id', userId).eq('sport_type', 'futevolei').order('created_at', { ascending: true }),
    supabase.from('game_players').select('game_id, team').eq('player_id', userId),
  ]);
  const history = (historyRows ?? []).map(h => ({ rating: h.rating as number, createdAt: h.created_at as string }));
  const base = { rating: ratingRow ?? null, history };

  const gameIds = (myRows ?? []).map(r => r.game_id);
  if (!gameIds.length) return { ...base, matches: [] };
  const myTeamByGame: Record<string, string> = Object.fromEntries((myRows ?? []).map(r => [r.game_id, r.team]));

  const { data: results } = await supabase.from('game_results').select('game_id, sets, status, winner_ids').in('game_id', gameIds);
  if (!results?.length) return { ...base, matches: [] };
  const resultGameIds = results.map(r => r.game_id);

  const [{ data: gamesRows }, { data: allPlayers }, { data: historyForGames }] = await Promise.all([
    supabase.from('games').select('id, scheduled_at, court_id, courts(name, venue_id, venues(name))').in('id', resultGameIds),
    supabase.from('game_players').select('game_id, player_id, player_name, team').in('game_id', resultGameIds),
    supabase.from('player_rating_history').select('game_id, rating').eq('player_id', userId).in('game_id', resultGameIds),
  ]);

  const playerIds = [...new Set((allPlayers ?? []).map(p => p.player_id))];
  const [{ data: profiles }, { data: ratings }] = await Promise.all([
    supabase.from('profiles').select('id, avatar_url').in('id', playerIds),
    supabase.from('player_ratings').select('player_id, rating').eq('sport_type', 'futevolei').in('player_id', playerIds),
  ]);
  const avatar = Object.fromEntries((profiles ?? []).map(p => [p.id, p.avatar_url ?? null]));
  const ratingOf = Object.fromEntries((ratings ?? []).map(r => [r.player_id, r.rating as number]));
  const gameById = Object.fromEntries((gamesRows ?? []).map(g => [g.id, g as any]));
  const rosterByGame: Record<string, { player_id: string; player_name: string; team: string }[]> = {};
  for (const p of allPlayers ?? []) (rosterByGame[p.game_id] ??= []).push(p);
  const ratingAfterByGame: Record<string, number> = {};
  for (const h of historyForGames ?? []) if (h.game_id) ratingAfterByGame[h.game_id] = h.rating;

  const toPerson = (p: { player_id: string; player_name: string }): PersonRef => ({
    id: p.player_id,
    name: p.player_name,
    avatarUrl: avatar[p.player_id] ?? null,
    rating: ratingOf[p.player_id] ?? null,
  });

  const matches: MatchSummary[] = results
    .map(r => {
      const myTeam = myTeamByGame[r.game_id] ?? 'a';
      const roster = rosterByGame[r.game_id] ?? [];
      const teammate = roster.find(p => p.team === myTeam && p.player_id !== userId);
      const game = gameById[r.game_id];
      return {
        gameId: r.game_id,
        date: game?.scheduled_at ?? null,
        venueName: game?.courts?.venues?.name ?? game?.courts?.name ?? '',
        status: r.status as ResultStatus,
        won: r.status === 'confirmed' ? (r.winner_ids ?? []).includes(userId) : null,
        teammate: teammate ? toPerson(teammate) : null,
        opponents: roster.filter(p => p.team !== myTeam).map(toPerson),
        ratingAfter: ratingAfterByGame[r.game_id] ?? null,
        ratingDelta: null,
      };
    })
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  // Deltas: walk history in chronological order (RATING_DEFAULT 1.5 mirrors submit-game-result).
  let prev = historyRows?.[0]?.rating ?? ratingRow?.rating ?? 1.5;
  const delta: Record<string, number> = {};
  for (const m of [...matches].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))) {
    if (m.ratingAfter != null) {
      delta[m.gameId] = m.ratingAfter - prev;
      prev = m.ratingAfter;
    }
  }
  for (const m of matches) m.ratingDelta = delta[m.gameId] ?? null;

  return { ...base, matches };
}
