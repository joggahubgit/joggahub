/**
 * Read-only game queries, ported from the web screens (Home, FindGames,
 * OpenGamePage). The web screens also write "retroactive" status fixes from
 * the client — those are intentionally NOT ported: status changes belong to
 * the backend (cron / edge functions).
 */
import { supabase } from '@/lib/supabase';
import { CAPTURE_CUTOFF_HOURS, getMinPlayersForSport, PLAYER_CANCEL_CUTOFF_HOURS } from '@/lib/shared';

const ACTIVE = ['scheduled', 'confirmed_booking'];

type Row = Record<string, any>;
const byId = <T extends Row>(rows: T[] | null | undefined) =>
  Object.fromEntries((rows ?? []).map(r => [r.id, r])) as Record<string, T>;
const unique = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];

async function courtsAndVenues(courtIds: string[]) {
  if (!courtIds.length) return { courts: {} as Record<string, Row>, venues: {} as Record<string, Row> };
  const { data: courts, error } = await supabase
    .from('courts')
    .select('id, name, sport_type, venue_id')
    .in('id', courtIds);
  if (error) throw error;
  const venueIds = unique((courts ?? []).map(c => c.venue_id));
  let venues: Row[] = [];
  if (venueIds.length) {
    const { data, error: vErr } = await supabase.from('venues').select('id, name, address, city').in('id', venueIds);
    if (vErr) throw vErr;
    venues = data ?? [];
  }
  return { courts: byId(courts), venues: byId(venues) };
}

export type GameStatusKind = 'pending_payment' | 'confirmed' | 'waiting' | 'scheduled';

export interface UpcomingGame {
  id: string;
  courtName: string;
  venueName: string;
  sport: string;
  scheduledAt: string;
  endAt: string | null;
  currentPlayers: number;
  maxPlayers: number;
  isOrganizer: boolean;
  isOpen: boolean;
  statusKind: GameStatusKind;
}

/** Games the user organizes or plays in, starting from now (mirrors Home.fetchUpcomingGames). */
export async function fetchUpcomingGames(userId: string): Promise<UpcomingGame[]> {
  const now = new Date().toISOString();
  const cols = 'id, court_id, scheduled_at, scheduled_end_at, current_players, max_players, organizer_id, is_open, booking_id, status';

  const [org, mine] = await Promise.all([
    supabase.from('games').select(cols).eq('organizer_id', userId).in('status', ACTIVE).gte('scheduled_at', now),
    supabase.from('game_players').select('game_id').eq('player_id', userId),
  ]);
  if (org.error) throw org.error;
  if (mine.error) throw mine.error;

  const playerGameIds = unique((mine.data ?? []).map(p => p.game_id));
  let played: Row[] = [];
  if (playerGameIds.length) {
    const { data, error } = await supabase
      .from('games')
      .select(cols)
      .in('id', playerGameIds)
      .in('status', ACTIVE)
      .gte('scheduled_at', now);
    if (error) throw error;
    played = data ?? [];
  }

  const games = Object.values(byId([...(org.data ?? []), ...played])).sort((a, b) =>
    String(a.scheduled_at).localeCompare(String(b.scheduled_at)),
  );
  if (!games.length) return [];

  const { courts, venues } = await courtsAndVenues(unique(games.map(g => g.court_id)));

  // Organizer's paid flag drives the "Pagamento pendente" badge on private bookings.
  const { data: orgRows, error: pErr } = await supabase
    .from('game_players')
    .select('game_id, player_id, paid')
    .in('game_id', games.map(g => g.id))
    .eq('player_id', userId);
  if (pErr) throw pErr;
  const myPaid = Object.fromEntries((orgRows ?? []).map(r => [r.game_id, r.paid as boolean]));

  return games.map(g => {
    const court = courts[g.court_id];
    const isOrganizer = g.organizer_id === userId;
    const isPrivate = !g.is_open && !!g.booking_id;
    const organizerPaid = myPaid[g.id] ?? true;
    const statusKind: GameStatusKind =
      isPrivate && isOrganizer && !organizerPaid
        ? 'pending_payment'
        : g.status === 'confirmed_booking'
          ? 'confirmed'
          : g.is_open
            ? 'waiting'
            : 'scheduled';
    return {
      id: g.id,
      courtName: court?.name ?? 'Quadra',
      venueName: venues[court?.venue_id]?.name ?? '',
      sport: court?.sport_type ?? '',
      scheduledAt: g.scheduled_at,
      endAt: g.scheduled_end_at ?? null,
      currentPlayers: g.current_players ?? 0,
      maxPlayers: g.max_players ?? 0,
      isOrganizer,
      isOpen: !!g.is_open,
      statusKind,
    };
  });
}

export interface OpenGame {
  id: string;
  courtName: string;
  venueName: string;
  venueAddress: string;
  sport: string;
  scheduledAt: string;
  currentPlayers: number;
  maxPlayers: number;
  pricePerPlayer: number;
  skillLevel: string | null;
}

/** Open games with free spots, starting from now (mirrors FindGames). */
export async function fetchOpenGames(limit?: number): Promise<OpenGame[]> {
  let q = supabase
    .from('games')
    .select('id, court_id, scheduled_at, current_players, max_players, price_per_player, skill_level')
    .eq('is_open', true)
    .in('status', ACTIVE)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });
  // Fetch extra: full games are filtered client-side (PostgREST can't compare two columns).
  if (limit) q = q.limit(limit * 3);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []).filter(g => (g.current_players ?? 0) < (g.max_players ?? 0));
  const sliced = limit ? rows.slice(0, limit) : rows;
  const { courts, venues } = await courtsAndVenues(unique(sliced.map(g => g.court_id)));

  return sliced.map(g => {
    const court = courts[g.court_id];
    const venue = venues[court?.venue_id];
    return {
      id: g.id,
      courtName: court?.name ?? 'Quadra',
      venueName: venue?.name ?? '',
      venueAddress: venue?.address ?? '',
      sport: court?.sport_type ?? '',
      scheduledAt: g.scheduled_at,
      currentPlayers: g.current_players ?? 0,
      maxPlayers: g.max_players ?? 0,
      pricePerPlayer: g.price_per_player ?? 0,
      skillLevel: g.skill_level ?? null,
    };
  });
}

export interface GamePlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  paid: boolean;
  team: 'a' | 'b' | null;
  isOrganizer: boolean;
}

export interface GameDetail {
  id: string;
  status: string;
  unavailable: 'cancelled' | 'inactive' | null;
  isOpen: boolean;
  isPrivate: boolean;
  payMode: 'split' | 'full';
  sport: string;
  courtName: string;
  venueName: string;
  venueAddress: string;
  scheduledAt: string | null;
  endAt: string | null;
  currentPlayers: number;
  maxPlayers: number;
  minPlayers: number;
  pricePerPlayer: number;
  organizerId: string;
  organizerPaid: boolean;
  courtPrice: number;
  /** slots.start_time — the instant the web compares cutoffs against. */
  startTime: string | null;
  /** Evaluated when the game is loaded, like the web (refetch to re-evaluate). */
  withinCancelCutoff: boolean;
  withinJoinCutoff: boolean;
  players: GamePlayer[];
}

/** Everything the game screen shows (mirrors OpenGamePage.load, read-only). */
export async function fetchGameDetail(id: string): Promise<GameDetail | null> {
  const { data: game, error } = await supabase.from('games').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!game) return null;

  const { courts, venues } = await courtsAndVenues(game.court_id ? [game.court_id] : []);
  const court = courts[game.court_id];
  const venue = venues[court?.venue_id];
  // Court sport is authoritative (games.sport_type may hold the 'football' default).
  const sport = court?.sport_type ?? game.sport_type ?? '';

  const { data: gp, error: gpErr } = await supabase
    .from('game_players')
    .select('player_id, player_name, paid, team')
    .eq('game_id', id)
    .order('id');
  if (gpErr) throw gpErr;

  const rosterIds = unique([game.organizer_id, ...(gp ?? []).map(p => p.player_id)]);
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', rosterIds);
  const prof = byId(profiles);

  const orgEntry = (gp ?? []).find(p => p.player_id === game.organizer_id);
  const players: GamePlayer[] = [
    {
      id: game.organizer_id,
      name: prof[game.organizer_id]?.name ?? 'Organizador',
      avatarUrl: prof[game.organizer_id]?.avatar_url ?? null,
      paid: orgEntry?.paid ?? true,
      team: (orgEntry?.team as 'a' | 'b') ?? (sport === 'futevolei' ? 'a' : null),
      isOrganizer: true,
    },
    ...(gp ?? [])
      .filter(p => p.player_id !== game.organizer_id)
      .map(p => ({
        id: p.player_id,
        name: p.player_name ?? prof[p.player_id]?.name ?? 'Jogador',
        avatarUrl: prof[p.player_id]?.avatar_url ?? null,
        paid: !!p.paid,
        team: (p.team as 'a' | 'b') ?? null,
        isOrganizer: false,
      })),
  ];

  // Slot gives the cutoff reference (start) and the end for older games without scheduled_end_at.
  let endAt: string | null = game.scheduled_end_at ?? null;
  let startTime: string | null = null;
  if (game.slot_id) {
    const { data: slot } = await supabase.from('slots').select('start_time, end_time').eq('id', game.slot_id).maybeSingle();
    startTime = slot?.start_time ?? null;
    endAt = endAt ?? slot?.end_time ?? null;
  }

  const msUntilStart = startTime ? new Date(startTime).getTime() - Date.now() : Infinity;

  const unavailable =
    game.status === 'cancelled' ? 'cancelled' : game.status === 'expired' || (game.current_players ?? 0) === 0 ? 'inactive' : null;

  return {
    id: game.id,
    status: game.status,
    unavailable,
    isOpen: !!game.is_open,
    isPrivate: !game.is_open && !!game.booking_id,
    payMode: game.pay_mode === 'full' ? 'full' : 'split',
    sport,
    courtName: court?.name ?? 'Quadra',
    venueName: venue?.name ?? '',
    venueAddress: venue?.address ?? '',
    scheduledAt: game.scheduled_at ?? null,
    endAt,
    currentPlayers: game.current_players ?? players.length,
    maxPlayers: game.max_players ?? 0,
    minPlayers: getMinPlayersForSport(sport),
    pricePerPlayer: game.price_per_player ?? 0,
    organizerId: game.organizer_id,
    organizerPaid: orgEntry?.paid ?? true,
    courtPrice: game.court_price ?? (game.price_per_player ?? 0) * 18,
    startTime,
    withinCancelCutoff: msUntilStart < PLAYER_CANCEL_CUTOFF_HOURS * 3_600_000,
    withinJoinCutoff: msUntilStart < CAPTURE_CUTOFF_HOURS * 3_600_000,
    players,
  };
}
