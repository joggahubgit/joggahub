/** Home-screen queries not covered by games/api.ts, ported from Home.tsx (web). */
import { supabase } from '@/lib/supabase';

export interface UpcomingBooking {
  id: string;
  courtName: string;
  venueName: string;
  startTime: string;
  endTime: string | null;
  totalPrice: number;
  paymentStatus: string;
}

/** Plain slot bookings (no private game attached), mirrors Home.fetchUpcomingBookings. */
export async function fetchUpcomingBookings(userId: string): Promise<UpcomingBooking[]> {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('bookings')
    .select('id, slot_id, total_price, payment_status')
    .eq('created_by', userId)
    .eq('status', 'confirmed')
    .not('slot_id', 'is', null);
  if (error) throw error;
  if (!rows?.length) return [];

  // Bookings that belong to a private game are shown as a game card instead.
  const { data: privateGames } = await supabase
    .from('games')
    .select('booking_id')
    .in('booking_id', rows.map(b => b.id))
    .not('booking_id', 'is', null);
  const privateSet = new Set((privateGames ?? []).map(g => g.booking_id));
  const seenSlots = new Set<string>();
  const bookings = rows.filter(b => {
    if (privateSet.has(b.id) || seenSlots.has(b.slot_id)) return false;
    seenSlots.add(b.slot_id);
    return true;
  });
  if (!bookings.length) return [];

  const { data: slots } = await supabase
    .from('slots')
    .select('id, start_time, end_time, court_id')
    .in('id', bookings.map(b => b.slot_id))
    .gte('start_time', now);
  if (!slots?.length) return [];

  const { data: courts } = await supabase.from('courts').select('id, name, venue_id').in('id', [...new Set(slots.map(s => s.court_id))]);
  const venueIds = [...new Set((courts ?? []).map(c => c.venue_id).filter(Boolean))];
  const { data: venues } = venueIds.length ? await supabase.from('venues').select('id, name').in('id', venueIds) : { data: [] };

  const slotById = Object.fromEntries(slots.map(s => [s.id, s]));
  const courtById = Object.fromEntries((courts ?? []).map(c => [c.id, c]));
  const venueById = Object.fromEntries((venues ?? []).map(v => [v.id, v]));

  return bookings
    .filter(b => slotById[b.slot_id])
    .map(b => {
      const slot = slotById[b.slot_id];
      const court = courtById[slot.court_id];
      return {
        id: b.id,
        courtName: court?.name ?? 'Quadra',
        venueName: venueById[court?.venue_id]?.name ?? '',
        startTime: slot.start_time,
        endTime: slot.end_time ?? null,
        totalPrice: b.total_price ?? 0,
        paymentStatus: b.payment_status ?? 'pending',
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 5);
}

export interface VenueCard {
  id: string;
  name: string;
  city: string;
  address: string;
  image: string;
  firstCourtId: string | null;
  courtCount: number;
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1624880357913-a8539238245b?w=400&q=80';

/** Clubs with at least one active court (mirrors Home.fetchVenues). */
export async function fetchVenueCards(): Promise<VenueCard[]> {
  const { data: venues, error } = await supabase.from('venues').select('id, name, city, address');
  if (error) throw error;
  if (!venues?.length) return [];
  const { data: courts } = await supabase
    .from('courts')
    .select('id, venue_id, images')
    .in('venue_id', venues.map(v => v.id))
    .neq('is_active', false);
  const byVenue: Record<string, { id: string; images: string[] | null }[]> = {};
  for (const c of courts ?? []) (byVenue[c.venue_id] ??= []).push(c);
  return venues
    .filter(v => byVenue[v.id]?.length)
    .map(v => {
      const list = byVenue[v.id];
      return {
        id: v.id,
        name: v.name,
        city: v.city ?? '',
        address: v.address ?? '',
        image: list.find(c => c.images?.length)?.images?.[0] ?? FALLBACK_IMAGE,
        firstCourtId: list[0]?.id ?? null,
        courtCount: list.length,
      };
    });
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
  return count ?? 0;
}
