import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ban, Users } from 'lucide-react';

/**
 * Shared time grid for the gestor agenda. Each column is one court on one
 * day (arena view: columns = courts; week view: columns = days of one court).
 * Everything is absolutely positioned from a single time axis, so the hour
 * ruler, free cells and bookings always line up, and a booking is one block
 * spanning its real duration. Times are raw wall-clock text
 * (substring(11,16)), same convention as the rest of the app.
 */

export interface GridSlot {
  id: string;
  court_id: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  booking?: {
    id: string;
    payment_status: string;
    total_price: number;
    court_price: number | null;
    scheduled_end_at?: string | null;
    profiles: { name: string; phone: string } | null;
  } | null;
  game?: {
    id: string;
    current_players: number;
    max_players: number;
    scheduled_end_at?: string | null;
  } | null;
}

export interface GridSchedule { open_time: string; close_time: string }

export interface GridColumn {
  key: string;
  courtId: string;
  date: Date;
  dateStr: string;         // YYYY-MM-DD (local)
  slots: GridSlot[];       // this court's slots on this day
  schedule?: GridSchedule; // opening hours for that weekday, if configured
  isToday: boolean;
  header: ReactNode;
}

export type GridFilter = 'all' | 'available' | 'booked' | 'blocked';
type BlockKind = 'booking' | 'open_game' | 'blocked';
export type BookingState = 'pending' | 'done' | 'live' | 'scheduled';

export interface Block {
  key: string;
  kind: BlockKind;
  start: number;           // minutes since midnight
  end: number;
  slot: GridSlot;
}

export const ROW_PX = 28;  // height of a 30-minute row
const STEP_MIN = 30;
const DEFAULT_RANGE: [number, number] = [7 * 60, 23 * 60];

export function toMin(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function slotStart(slot: GridSlot) {
  return toMin(slot.start_time.substring(11, 16));
}

/** End minute of a slot, preferring the game's real end (bookings longer than one slot). */
function slotEnd(slot: GridSlot) {
  const start = slotStart(slot);
  const real = slot.booking?.scheduled_end_at ?? slot.game?.scheduled_end_at ?? null;
  let end = toMin((real ?? slot.end_time).substring(11, 16));
  if (end <= start) end += 1440; // crosses midnight
  return end;
}

function scheduleWindow(schedule?: GridSchedule): [number, number] | null {
  if (!schedule) return null;
  let close = toMin(schedule.close_time.substring(0, 5));
  if (close === 0) close = 1440;
  return [toMin(schedule.open_time.substring(0, 5)), close];
}

/**
 * Bookings/open games span their real duration; blocked slots inside a
 * booking's range are the consecutive-slot lock, so they're absorbed.
 * Remaining blocked slots are merged into continuous ranges.
 */
export function buildBlocks(slots: GridSlot[]): Block[] {
  const main: Block[] = slots
    .filter(s => s.booking || s.game)
    .map(s => ({ key: s.id, kind: s.booking ? 'booking' : 'open_game', start: slotStart(s), end: slotEnd(s), slot: s }));
  const covered = (min: number) => main.some(b => min >= b.start && min < b.end);

  const blocked: Block[] = [];
  for (const s of slots.filter(s => !s.booking && !s.game && !s.is_available)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    const start = slotStart(s);
    if (covered(start)) continue;
    const end = slotEnd(s);
    const last = blocked[blocked.length - 1];
    if (last && last.end === start) last.end = end;
    else blocked.push({ key: s.id, kind: 'blocked', start, end, slot: s });
  }
  return [...main, ...blocked].sort((a, b) => a.start - b.start);
}

/**
 * Occupancy of one court on one day. Capacity is the opening hours when
 * configured, otherwise the time covered by the slots the club created.
 */
export function columnStats(col: Pick<GridColumn, 'slots' | 'schedule'>, blocks: Block[], now: number | null) {
  const busy = blocks.filter(b => b.kind !== 'blocked');
  const win = scheduleWindow(col.schedule);
  let capacity: number;
  let clip = (b: Block) => b.end - b.start;
  if (win) {
    capacity = win[1] - win[0];
    clip = b => Math.max(0, Math.min(b.end, win[1]) - Math.max(b.start, win[0]));
  } else {
    // Raw slot length — slotEnd() would stretch the booking's own slot over the
    // consecutive slots it locked and count that time twice
    capacity = col.slots.reduce((sum, s) => {
      let end = toMin(s.end_time.substring(11, 16));
      if (end <= slotStart(s)) end += 1440;
      return sum + (end - slotStart(s));
    }, 0);
  }
  const busyMin = busy.reduce((sum, b) => sum + clip(b), 0);
  const lastEnd = win ? win[1] : col.slots.reduce((m, s) => Math.max(m, slotEnd(s)), 0);
  const firstStart = win ? win[0] : col.slots.reduce((m, s) => Math.min(m, slotStart(s)), Infinity);
  const busyNow = now != null && blocks.some(b => now >= b.start && now < b.end);
  const openNow = now != null && now >= firstStart && now < lastEnd;
  return {
    bookings: busy.length,
    busyMin,
    capacity,
    pct: capacity > 0 ? Math.min(100, Math.round((busyMin / capacity) * 100)) : 0,
    closeLabel: lastEnd > 0 ? fromMin(lastEnd) : null,
    freeNow: openNow && !busyNow,
  };
}

export const STATE_STYLE: Record<BookingState, { label: string; card: string; pill: string; dot: string }> = {
  pending:   { label: 'Pag. pendente', card: 'bg-orange-50 border-l-orange-500',  pill: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  done:      { label: 'Concluído',     card: 'bg-green-50 border-l-green-500',    pill: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  live:      { label: 'Em quadra',     card: 'bg-purple-100 border-l-purple-700', pill: 'bg-purple-600 text-white',      dot: 'bg-purple-700' },
  scheduled: { label: 'Agendado',      card: 'bg-purple-50 border-l-purple-500',  pill: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
};

/** Ticking "minutes since midnight", refreshed every minute. */
export function useNowMinutes() {
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

interface Props {
  columns: GridColumn[];
  columnWidth: number;     // minimum width; columns stretch to fill the available space
  headerHeight: number;
  filter?: GridFilter;
  maxHeight?: string;
  scrollKey: string;       // re-scroll to "now"/first booking when this changes
  netCourtPrice: (cp: number | null | undefined, total: number | undefined) => number;
  onEmptyCellClick: (courtId: string, date: Date, hour: string) => void;
  onSlotClick: (slot: GridSlot) => void;
}

export function ScheduleGrid({ columns, columnWidth, headerHeight, filter = 'all', maxHeight, scrollKey, netCourtPrice, onEmptyCellClick, onSlotClick }: Props) {
  const now = useNowMinutes();
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayStr = localDateStr(new Date());

  const blocks = useMemo(() => columns.map(c => buildBlocks(c.slots)), [columns]);

  // ── One time axis for every column: union of opening hours, all slots
  // (free ones included) and bookings; 07–23 when the period is empty.
  const [rangeStart, rangeEnd] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    columns.forEach((c, i) => {
      const win = scheduleWindow(c.schedule);
      if (win) { lo = Math.min(lo, win[0]); hi = Math.max(hi, win[1]); }
      for (const s of c.slots) { lo = Math.min(lo, slotStart(s)); hi = Math.max(hi, slotEnd(s)); }
      for (const b of blocks[i]) { lo = Math.min(lo, b.start); hi = Math.max(hi, b.end); }
    });
    if (!Number.isFinite(lo)) return DEFAULT_RANGE;
    return [Math.floor(lo / 60) * 60, Math.min(Math.ceil(hi / 60) * 60, 1440)];
  }, [columns, blocks]);

  const rows = Array.from({ length: Math.max(1, (rangeEnd - rangeStart) / STEP_MIN) }, (_, i) => rangeStart + i * STEP_MIN);
  const bodyHeight = rows.length * ROW_PX;
  const top = (min: number) => ((min - rangeStart) / STEP_MIN) * ROW_PX;
  const anyToday = columns.some(c => c.isToday);
  const showNow = anyToday && now >= rangeStart && now <= rangeEnd;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstBooking = Math.min(...blocks.flat().filter(b => b.kind !== 'blocked').map(b => b.start));
    const target = anyToday ? now - 60 : Number.isFinite(firstBooking) ? firstBooking - 30 : rangeStart;
    el.scrollTop = Math.max(0, top(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey, rangeStart]);

  function bookingState(b: Block, dateStr: string): BookingState {
    if (b.slot.booking?.payment_status === 'pending') return 'pending';
    if (dateStr < todayStr || (dateStr === todayStr && now >= b.end)) return 'done';
    if (dateStr === todayStr && now >= b.start) return 'live';
    return 'scheduled';
  }

  const showFree = filter === 'all' || filter === 'available';
  const showKind = (k: BlockKind) =>
    filter === 'all' || (filter === 'booked' && (k === 'booking' || k === 'open_game')) || (filter === 'blocked' && k === 'blocked');

  return (
    <div ref={scrollRef} className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      {/* w-max + min-w-full: columns grow to fill the card, and scroll sideways
          only when they'd go below columnWidth */}
      <div className="flex w-max min-w-full">
        {/* Hour ruler */}
        <div className="w-14 flex-shrink-0 sticky left-0 z-30 bg-white border-r border-gray-200">
          <div className="sticky top-0 z-10 bg-white border-b-2 border-gray-200" style={{ height: headerHeight }} />
          <div className="relative" style={{ height: bodyHeight }}>
            {rows.filter(m => m % 60 === 0 && m !== rangeStart).map(m => (
              <span key={m} className="absolute right-2 text-[11px] font-medium text-gray-400 tabular-nums -translate-y-1/2" style={{ top: top(m) }}>
                {fromMin(m)}
              </span>
            ))}
            {showNow && (
              <span className="absolute right-0.5 z-10 -translate-y-1/2 px-1 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold tabular-nums shadow"
                style={{ top: top(now) }}>
                {fromMin(now)}
              </span>
            )}
          </div>
        </div>

        {columns.map((col, ci) => {
          const win = scheduleWindow(col.schedule);
          const freeStarts = new Set(col.slots.filter(s => s.is_available && !s.booking && !s.game).map(slotStart));
          const isOpen = (m: number) => (win ? m >= win[0] && m < win[1] : false) || freeStarts.has(m);
          const colBlocks = blocks[ci];
          const occupied = (m: number) => colBlocks.some(b => m >= b.start && m < b.end);

          return (
            <div key={col.key} className={`border-r border-gray-100 last:border-r-0 ${col.isToday ? 'bg-purple-50/20' : ''}`} style={{ flex: '1 0 0%', minWidth: columnWidth }}>
              <div className="sticky top-0 z-20 bg-white border-b-2 border-gray-200 overflow-hidden" style={{ height: headerHeight }}>
                {col.header}
              </div>

              <div className="relative" style={{ height: bodyHeight }}>
                {rows.map(m => {
                  const line = m % 60 === 0 ? 'border-t border-gray-200' : 'border-t border-dashed border-gray-100';
                  const free = isOpen(m) && !occupied(m);
                  if (free && showFree) {
                    return (
                      <button key={m} onClick={() => onEmptyCellClick(col.courtId, col.date, fromMin(m))}
                        className={`absolute inset-x-0 ${line} bg-green-50/50 hover:bg-green-100 group transition-colors text-left`}
                        style={{ top: top(m), height: ROW_PX }}>
                        <span className="text-[10px] text-green-500/70 font-medium pl-2 tabular-nums group-hover:text-green-700">
                          <span className="group-hover:hidden">{fromMin(m)}</span>
                          <span className="hidden group-hover:inline">+ {fromMin(m)}</span>
                        </span>
                      </button>
                    );
                  }
                  return (
                    <div key={m} className={`absolute inset-x-0 ${line} ${isOpen(m) ? '' : 'bg-gray-50/80'}`} style={{ top: top(m), height: ROW_PX }} />
                  );
                })}

                {col.isToday && showNow && (
                  <div className="absolute inset-x-0 z-20 h-0.5 bg-red-500/80 pointer-events-none" style={{ top: top(now) }} />
                )}

                {colBlocks.filter(b => showKind(b.kind)).map(b => {
                  const height = Math.max(((b.end - b.start) / STEP_MIN) * ROW_PX - 4, 22);
                  const compact = height < 50;
                  const range = `${fromMin(b.start)}–${fromMin(b.end)}`;
                  const pos = { top: top(b.start) + 2, height };

                  if (b.kind === 'blocked') {
                    return (
                      <button key={b.key} onClick={() => onSlotClick(b.slot)}
                        className="absolute left-1.5 right-1.5 z-10 rounded-lg bg-gray-100 border-l-4 border-l-gray-300 text-left px-2 py-1 overflow-hidden hover:bg-gray-200 transition-colors"
                        style={{ ...pos, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,0.03) 6px 12px)' }}>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500"><Ban className="w-3 h-3 flex-shrink-0" />Bloqueado</span>
                        {!compact && <span className="text-[10px] text-gray-400 tabular-nums">{range}</span>}
                      </button>
                    );
                  }

                  if (b.kind === 'open_game') {
                    const g = b.slot.game!;
                    return (
                      <button key={b.key} onClick={() => onSlotClick(b.slot)}
                        className="absolute left-1.5 right-1.5 z-10 rounded-lg bg-sky-50 border-l-4 border-l-sky-500 text-left px-2.5 py-1.5 overflow-hidden shadow-sm hover:shadow-md hover:brightness-[0.98] transition-all"
                        style={pos}>
                        <div className="flex items-center gap-1 text-xs font-bold text-sky-800 truncate"><Users className="w-3.5 h-3.5 flex-shrink-0" />Partida aberta</div>
                        <div className="text-[11px] text-sky-600 tabular-nums truncate">{range}{compact ? '' : ` · ${g.current_players}/${g.max_players}`}</div>
                      </button>
                    );
                  }

                  const state = bookingState(b, col.dateStr);
                  const style = STATE_STYLE[state];
                  const bk = b.slot.booking!;
                  const price = netCourtPrice(bk.court_price, bk.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  return (
                    <button key={b.key} onClick={() => onSlotClick(b.slot)}
                      className={`absolute left-1.5 right-1.5 z-10 rounded-lg border-l-4 ${style.card} text-left px-2.5 py-1.5 overflow-hidden shadow-sm hover:shadow-md hover:brightness-[0.98] transition-all ${state === 'live' ? 'ring-2 ring-purple-300' : ''}`}
                      style={pos}>
                      <div className="text-xs font-bold text-gray-900 truncate pr-3">{bk.profiles?.name ?? 'Jogador'}</div>
                      <div className="text-[11px] text-gray-500 tabular-nums truncate">{range}{compact ? '' : ` · R$ ${price}`}</div>
                      {height >= 64 && (
                        <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.pill}`}>{style.label}</span>
                      )}
                      {height < 64 && <span className={`absolute right-2 top-2 w-2 h-2 rounded-full ${style.dot}`} title={style.label} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
