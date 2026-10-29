/** Read-only court/venue queries, ported from FindCourts, Home and CourtDetails (web). */
import { supabase } from '@/lib/supabase';
import { buildSlotGrid, type RawSlot, type SlotItem } from './schedule';

export interface CourtListItem {
  id: string;
  name: string;
  sport: string;
  surface: string | null;
  pricePerHour: number;
  minSlotPrice: number | null;
  image: string | null;
  venueId: string;
  venueName: string;
  venueCity: string;
  venueAddress: string;
}

/** Active courts with their club and cheapest open slot in the next 14 days (mirrors FindCourts). */
export async function fetchCourts(): Promise<CourtListItem[]> {
  const { data: courts, error } = await supabase
    .from('courts')
    .select('id, name, venue_id, images, price_per_hour, sport_type, surface')
    .neq('is_active', false);
  if (error) throw error;
  if (!courts?.length) return [];

  const venueIds = [...new Set(courts.map(c => c.venue_id).filter(Boolean))];
  const { data: venues, error: vErr } = await supabase.from('venues').select('id, name, address, city').in('id', venueIds);
  if (vErr) throw vErr;
  const venueById = Object.fromEntries((venues ?? []).map(v => [v.id, v]));

  const today = new Date().toISOString().substring(0, 10);
  const until = new Date(Date.now() + 14 * 86_400_000).toISOString().substring(0, 10);
  const { data: slots } = await supabase
    .from('slots')
    .select('court_id, price_override')
    .in('court_id', courts.map(c => c.id))
    .gte('start_time', `${today}T00:00:00`)
    .lte('start_time', `${until}T23:59:59`)
    .eq('is_available', true);
  const minPrice: Record<string, number> = {};
  for (const s of slots ?? []) {
    if (s.price_override == null) continue;
    if (minPrice[s.court_id] == null || s.price_override < minPrice[s.court_id]) minPrice[s.court_id] = s.price_override;
  }

  return courts
    .map(c => {
      const v = venueById[c.venue_id];
      return {
        id: c.id,
        name: c.name,
        sport: c.sport_type ?? '',
        surface: c.surface ?? null,
        pricePerHour: c.price_per_hour ?? 0,
        minSlotPrice: minPrice[c.id] ?? null,
        image: c.images?.[0] ?? null,
        venueId: c.venue_id,
        venueName: v?.name ?? '',
        venueCity: v?.city ?? '',
        venueAddress: v?.address ?? '',
      };
    })
    .sort((a, b) => a.venueName.localeCompare(b.venueName) || a.name.localeCompare(b.name));
}

export interface VenueCourt {
  id: string;
  name: string;
  sport: string;
  pricePerHour: number;
}

export interface CourtPage {
  courtId: string;
  images: string[];
  amenities: string[];
  venue: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    description: string | null;
    openingHours: string | null;
  } | null;
  /** All active courts of the club — the booking grid shows them side by side, like the web. */
  courts: VenueCourt[];
}

export async function fetchCourtPage(courtId: string): Promise<CourtPage | null> {
  const { data: court, error } = await supabase.from('courts').select('*').eq('id', courtId).maybeSingle();
  if (error) throw error;
  if (!court) return null;

  let venue: CourtPage['venue'] = null;
  let courts: VenueCourt[] = [{ id: court.id, name: court.name, sport: court.sport_type ?? '', pricePerHour: court.price_per_hour ?? 0 }];
  if (court.venue_id) {
    const [{ data: v }, { data: siblings }] = await Promise.all([
      supabase.from('venues').select('id, name, address, city, phone, description, opening_hours').eq('id', court.venue_id).maybeSingle(),
      supabase.from('courts').select('id, name, sport_type, price_per_hour').eq('venue_id', court.venue_id).neq('is_active', false).order('name'),
    ]);
    if (v) {
      venue = {
        id: v.id,
        name: v.name,
        address: v.address,
        city: v.city,
        phone: v.phone,
        description: v.description,
        openingHours: v.opening_hours,
      };
    }
    if (siblings?.length) {
      courts = siblings.map(s => ({ id: s.id, name: s.name, sport: s.sport_type ?? '', pricePerHour: s.price_per_hour ?? 0 }));
    }
  }

  return { courtId: court.id, images: court.images ?? [], amenities: court.amenities ?? [], venue, courts };
}

/** Slot grid per court for one date (mirrors CourtDetails.fetchSlots). */
export async function fetchSlotGrid(courts: VenueCourt[], date: string): Promise<Record<string, SlotItem[]>> {
  if (!courts.length) return {};
  const ids = courts.map(c => c.id);
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();

  const [schedules, slots] = await Promise.all([
    supabase.from('court_schedules').select('court_id, open_time, close_time, price').in('court_id', ids).eq('day_of_week', dayOfWeek),
    supabase
      .from('slots')
      .select('id, court_id, start_time, end_time, is_available, price_override')
      .in('court_id', ids)
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`),
  ]);
  if (schedules.error) throw schedules.error;
  if (slots.error) throw slots.error;

  const slotIds = (slots.data ?? []).map(s => s.id);
  const gameBySlotId: Record<string, string> = {};
  if (slotIds.length) {
    const { data: games, error } = await supabase
      .from('games')
      .select('id, slot_id')
      .in('slot_id', slotIds)
      .not('status', 'in', '("expired","cancelled")')
      .eq('is_open', true);
    if (error) throw error;
    for (const g of games ?? []) if (g.slot_id) gameBySlotId[g.slot_id] = g.id;
  }

  const scheduleByCourt = Object.fromEntries((schedules.data ?? []).map(s => [s.court_id, s]));
  return Object.fromEntries(
    courts.map(c => {
      const schedule = scheduleByCourt[c.id];
      return [
        c.id,
        buildSlotGrid({
          slots: (slots.data ?? []).filter(s => s.court_id === c.id) as RawSlot[],
          closeTime: schedule?.close_time ?? null,
          schedulePrice: schedule?.price ?? null,
          fallbackPrice: c.pricePerHour,
          gameBySlotId,
        }),
      ];
    }),
  );
}
