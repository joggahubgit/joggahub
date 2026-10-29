/**
 * Slot grid rules, ported from CourtDetails.generateFromPreCreatedSlots (web).
 * Pre-created slots are the single source of truth: a start time is offered
 * only if the club created a slot for it, and is unavailable for a duration
 * when any booked (is_available=false) slot overlaps that window.
 *
 * Times are wall-clock "HH:MM" read straight from the stored text — never
 * converted through the device timezone (see wallClock.ts).
 */
export interface RawSlot {
  id: string;
  start_time: string;
  end_time: string | null;
  is_available: boolean;
  price_override: number | null;
}

export interface SlotItem {
  id: string;
  time: string;
  endTime90: string;
  endTime120: string;
  available90: boolean;
  available120: boolean;
  pricePerHour: number;
  gameId: string | null;
}

export const DURATIONS = [90, 120] as const;
export type Duration = (typeof DURATIONS)[number];

export const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const toHHMM = (mins: number) =>
  `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export function buildSlotGrid(opts: {
  slots: RawSlot[];
  /** court_schedules.close_time for the day, if the club set opening hours */
  closeTime: string | null;
  schedulePrice: number | null;
  fallbackPrice: number;
  gameBySlotId: Record<string, string>;
  now?: Date;
}): SlotItem[] {
  const now = opts.now ?? new Date();
  // Same "future" test as the web, so both apps list identical slots.
  const future = opts.slots.filter(s => new Date(s.start_time) > now);

  const booked = opts.slots
    .filter(s => !s.is_available)
    .map(s => {
      const start = toMins(s.start_time.substring(11, 16));
      return { start, end: s.end_time ? toMins(s.end_time.substring(11, 16)) : start + 30 };
    });

  const closeMins = opts.closeTime ? toMins(opts.closeTime) : 24 * 60;

  return future
    .map(slot => {
      const time = slot.start_time.substring(11, 16);
      const start = toMins(time);
      const overlaps = (end: number) => booked.some(b => b.start < end && b.end > start);
      const sameTime = opts.slots.find(s => s.start_time.substring(11, 16) === time);
      return {
        id: slot.id,
        time,
        endTime90: toHHMM(start + 90),
        endTime120: toHHMM(start + 120),
        available90: !overlaps(start + 90),
        available120: start + 120 <= closeMins && !overlaps(start + 120),
        pricePerHour: slot.price_override ?? opts.schedulePrice ?? opts.fallbackPrice,
        gameId: sameTime ? (opts.gameBySlotId[sameTime.id] ?? null) : null,
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Next 14 calendar days in the device's local calendar, as YYYY-MM-DD (like the web). */
export function nextDays(count = 14, from = new Date()) {
  // Same labels as the web's buildWeekDays.
  const DAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { date, dayLabel: DAYS[d.getDay()], dayNum: String(d.getDate()).padStart(2, '0'), monthLabel: MONTHS[d.getMonth()] };
  });
}
