/**
 * "Minhas Reservas", ported from MyBookings.tsx (web). The web screen also
 * writes retroactive status fixes from the client — not ported (backend's job);
 * the same corrections are applied to the displayed status only.
 */
import { supabase } from '@/lib/supabase';
import { getMinPlayersForSport, PLAYER_CANCEL_CUTOFF_HOURS } from '@/lib/shared';

export type BookingType = 'slot' | 'game_organizer' | 'game_player';

export interface BookingItem {
  id: string;
  type: BookingType;
  courtName: string;
  venueName: string;
  startTime: string;
  createdAt: string;
  endTime: string | null;
  price: number;
  paymentStatus: string;
  status: string;
  currentPlayers?: number;
  maxPlayers?: number;
  withinCancelCutoff: boolean;
}

const cutoff = (iso: string | null) => (iso ? new Date(iso).getTime() - Date.now() : Infinity) < PLAYER_CANCEL_CUTOFF_HOURS * 3_600_000;
const unique = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];

async function namesFor(courtIds: string[]) {
  const { data: courts } = courtIds.length ? await supabase.from('courts').select('id, name, venue_id, sport_type').in('id', courtIds) : { data: [] };
  const venueIds = unique((courts ?? []).map(c => c.venue_id));
  const { data: venues } = venueIds.length ? await supabase.from('venues').select('id, name').in('id', venueIds) : { data: [] };
  return {
    court: Object.fromEntries((courts ?? []).map(c => [c.id, c])) as Record<string, any>,
    venue: Object.fromEntries((venues ?? []).map(v => [v.id, v])) as Record<string, any>,
  };
}

async function slotBookings(userId: string): Promise<BookingItem[]> {
  const { data: raw } = await supabase.from('bookings').select('id, slot_id, total_price, payment_status, status, created_at').eq('created_by', userId).not('slot_id', 'is', null);
  if (!raw?.length) return [];
  const { data: priv } = await supabase.from('games').select('booking_id').in('booking_id', raw.map(b => b.id)).not('booking_id', 'is', null);
  const privSet = new Set((priv ?? []).map(g => g.booking_id));
  const bookings = raw.filter(b => !privSet.has(b.id));
  if (!bookings.length) return [];
  const { data: slots } = await supabase.from('slots').select('id, start_time, end_time, court_id').in('id', bookings.map(b => b.slot_id));
  const slot = Object.fromEntries((slots ?? []).map(s => [s.id, s]));
  const { court, venue } = await namesFor(unique((slots ?? []).map(s => s.court_id)));
  return bookings
    .filter(b => slot[b.slot_id])
    .map(b => {
      const s = slot[b.slot_id];
      const c = court[s.court_id];
      return {
        id: b.id,
        type: 'slot' as const,
        courtName: c?.name ?? 'Quadra',
        venueName: venue[c?.venue_id]?.name ?? '',
        startTime: s.start_time,
        createdAt: b.created_at ?? s.start_time,
        endTime: s.end_time ?? null,
        price: b.total_price ?? 0,
        paymentStatus: b.payment_status ?? 'pending',
        status: b.status,
        withinCancelCutoff: cutoff(s.start_time),
      };
    });
}

async function gameItems(userId: string): Promise<BookingItem[]> {
  const fields = 'id, court_id, scheduled_at, price_per_player, court_price, max_players, current_players, is_open, status, sport_type, booking_id, created_at';
  const [{ data: org }, { data: asPlayer }] = await Promise.all([
    supabase.from('games').select(fields).eq('organizer_id', userId),
    supabase.from('game_players').select('game_id, paid').eq('player_id', userId),
  ]);
  const orgIds = new Set((org ?? []).map(g => g.id));
  const playerIds = (asPlayer ?? []).map(p => p.game_id).filter(id => !orgIds.has(id));
  const { data: played } = playerIds.length ? await supabase.from('games').select(fields).in('id', playerIds) : { data: [] };
  const all = [...(org ?? []).map(g => ({ ...g, _role: 'organizer' })), ...(played ?? []).map(g => ({ ...g, _role: 'player' }))];
  if (!all.length) return [];
  const { court, venue } = await namesFor(unique(all.map(g => g.court_id)));
  const paid = Object.fromEntries((asPlayer ?? []).map(p => [p.game_id, p.paid]));

  return all.map(g => {
    const c = court[g.court_id];
    const sport = c?.sport_type ?? g.sport_type ?? '';
    let status: string = g.status ?? 'scheduled';
    const isPrivate = !g.is_open && !!g.booking_id;
    if (status === 'scheduled') {
      if (!g.is_open && !isPrivate) status = 'expired';
      else if ((g.current_players ?? 1) >= getMinPlayersForSport(sport)) status = 'confirmed_booking';
    }
    return {
      id: g.id,
      type: (g._role === 'organizer' ? 'game_organizer' : 'game_player') as BookingType,
      courtName: c?.name ?? 'Quadra',
      venueName: venue[c?.venue_id]?.name ?? '',
      startTime: g.scheduled_at,
      createdAt: g.created_at ?? g.scheduled_at,
      endTime: null,
      price: g._role === 'organizer' && !g.is_open && !(g.price_per_player > 0) ? (g.court_price ?? 0) : (g.price_per_player ?? 0),
      paymentStatus: g._role === 'organizer' || paid[g.id] ? 'paid' : 'pending',
      status,
      currentPlayers: g.current_players,
      maxPlayers: g.max_players,
      withinCancelCutoff: cutoff(g.scheduled_at),
    };
  });
}

export async function fetchMyBookings(userId: string): Promise<BookingItem[]> {
  const [slots, games] = await Promise.all([slotBookings(userId), gameItems(userId)]);
  return [...slots, ...games].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
