import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Users, LayoutGrid } from 'lucide-react';

/**
 * Day view of the whole venue: one column per court, bookings drawn as
 * blocks spanning their real duration, per-court occupancy, and a "now"
 * line when looking at today. Times are read as raw wall-clock text
 * (substring(11,16)), same convention as the rest of the gestor calendar.
 */

export interface ArenaSlot {
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

interface Props {
  courts: { id: string; name: string }[];
  slots: ArenaSlot[];
  schedules: Record<string, Record<number, { open_time: string; close_time: string }>>;
  date: Date;
  dateStr: string;
  isToday: boolean;
  netCourtPrice: (cp: number | null | undefined, total: number | undefined) => number;
  onEmptyCellClick: (courtId: string, hour: string) => void;
  onSlotClick: (slot: ArenaSlot) => void;
}

const ROW_PX = 28;        // height of a 30-minute row
const STEP_MIN = 30;

type BlockKind = 'booking' | 'open_game' | 'blocked';
type BookingState = 'pending' | 'done' | 'live' | 'scheduled';

interface Block {
  key: string;
  kind: BlockKind;
  start: number;          // minutes since midnight
  end: number;
  slot: ArenaSlot;
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMin(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** End minute of a slot, preferring the game's real end (bookings longer than one slot). */
function slotEnd(slot: ArenaSlot) {
  const start = toMin(slot.start_time.substring(11, 16));
  const real = slot.booking?.scheduled_end_at ?? slot.game?.scheduled_end_at ?? null;
  let end = toMin((real ?? slot.end_time).substring(11, 16));
  if (end <= start) end += 1440; // crosses midnight
  return end;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const STATE_STYLE: Record<BookingState, { label: string; card: string; pill: string }> = {
  pending:   { label: 'Pag. pendente', card: 'bg-orange-50 border-l-orange-500',  pill: 'bg-orange-100 text-orange-700' },
  done:      { label: 'Concluído',     card: 'bg-green-50 border-l-green-500',    pill: 'bg-green-100 text-green-700' },
  live:      { label: 'Em quadra',     card: 'bg-purple-100 border-l-purple-700', pill: 'bg-purple-600 text-white' },
  scheduled: { label: 'Agendado',      card: 'bg-purple-50 border-l-purple-500',  pill: 'bg-purple-100 text-purple-700' },
};

export function ArenaDayView({ courts, slots, schedules, date, dateStr, isToday, netCourtPrice, onEmptyCellClick, onSlotClick }: Props) {
  const [now, setNow] = useState(nowMinutes);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(t);
  }, [isToday]);

  const dow = date.getDay();
  const daySlots = useMemo(() => slots.filter(s => s.start_time?.startsWith(dateStr)), [slots, dateStr]);

  // ── Blocks per court: bookings/open games span their real duration; blocked
  // slots inside a booking's range are the consecutive-slot lock, so they're absorbed.
  const blocksByCourt = useMemo(() => {
    const map: Record<string, Block[]> = {};
    for (const court of courts) {
      const courtSlots = daySlots.filter(s => s.court_id === court.id);
      const main: Block[] = courtSlots
        .filter(s => s.booking || s.game)
        .map(s => ({
          key: s.id,
          kind: s.booking ? 'booking' : 'open_game',
          start: toMin(s.start_time.substring(11, 16)),
          end: slotEnd(s),
          slot: s,
        }));
      const covered = (min: number) => main.some(b => min >= b.start && min < b.end);

      const blocked: Block[] = [];
      for (const s of courtSlots.filter(s => !s.booking && !s.game && !s.is_available)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))) {
        const start = toMin(s.start_time.substring(11, 16));
        if (covered(start)) continue;
        const end = slotEnd(s);
        const last = blocked[blocked.length - 1];
        if (last && last.end === start) last.end = end; // merge consecutive blocked slots
        else blocked.push({ key: s.id, kind: 'blocked', start, end, slot: s });
      }
      map[court.id] = [...main, ...blocked].sort((a, b) => a.start - b.start);
    }
    return map;
  }, [courts, daySlots]);

  // ── Visible time range: union of today's opening hours and anything booked
  const [rangeStart, rangeEnd] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of courts) {
      const sched = schedules[c.id]?.[dow];
      if (sched) {
        lo = Math.min(lo, toMin(sched.open_time.substring(0, 5)));
        let close = toMin(sched.close_time.substring(0, 5));
        if (close === 0) close = 1440;
        hi = Math.max(hi, close);
      }
      for (const b of blocksByCourt[c.id] ?? []) {
        lo = Math.min(lo, b.start);
        hi = Math.max(hi, b.end);
      }
    }
    if (!Number.isFinite(lo)) return [7 * 60, 23 * 60];
    return [Math.floor(lo / 60) * 60, Math.min(Math.ceil(hi / 60) * 60, 1440)];
  }, [courts, schedules, dow, blocksByCourt]);

  const rows = Array.from({ length: Math.max(1, (rangeEnd - rangeStart) / STEP_MIN) }, (_, i) => rangeStart + i * STEP_MIN);
  const top = (min: number) => ((min - rangeStart) / STEP_MIN) * ROW_PX;

  // Scroll to "now" (or the first booking) when the day loads
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstBooking = Math.min(...Object.values(blocksByCourt).flat().filter(b => b.kind !== 'blocked').map(b => b.start));
    const target = isToday ? now - 60 : Number.isFinite(firstBooking) ? firstBooking - 30 : rangeStart;
    el.scrollTop = Math.max(0, top(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, rangeStart]);

  // Free slots created outside the regular opening hours are bookable too
  const availableStarts = useMemo(() => new Set(
    daySlots.filter(s => s.is_available && !s.booking && !s.game)
      .map(s => `${s.court_id}|${toMin(s.start_time.substring(11, 16))}`),
  ), [daySlots]);

  function isOpen(courtId: string, min: number) {
    const sched = schedules[courtId]?.[dow];
    if (!sched) return false;
    let close = toMin(sched.close_time.substring(0, 5));
    if (close === 0) close = 1440;
    return min >= toMin(sched.open_time.substring(0, 5)) && min < close;
  }

  function bookingState(b: Block): BookingState {
    if (b.slot.booking?.payment_status === 'pending') return 'pending';
    const t = new Date();
    const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    if (dateStr < todayStr || (dateStr === todayStr && now >= b.end)) return 'done';
    if (dateStr === todayStr && now >= b.start) return 'live';
    return 'scheduled';
  }

  // ── Per-court and venue-wide stats
  const courtStats = courts.map(c => {
    const sched = schedules[c.id]?.[dow];
    const open = sched ? toMin(sched.open_time.substring(0, 5)) : null;
    let close = sched ? toMin(sched.close_time.substring(0, 5)) : null;
    if (close === 0) close = 1440;
    const busy = (blocksByCourt[c.id] ?? []).filter(b => b.kind !== 'blocked');
    const busyMin = busy.reduce((sum, b) => {
      const s = open != null ? Math.max(b.start, open) : b.start;
      const e = close != null ? Math.min(b.end, close) : b.end;
      return sum + Math.max(0, e - s);
    }, 0);
    const openMin = open != null && close != null ? close - open : 0;
    const busyNow = isToday && (blocksByCourt[c.id] ?? []).some(b => now >= b.start && now < b.end);
    return {
      id: c.id,
      closeLabel: close != null ? fromMin(close) : null,
      bookings: busy.length,
      busyMin,
      openMin,
      pct: openMin > 0 ? Math.min(100, Math.round((busyMin / openMin) * 100)) : 0,
      freeNow: isToday && isOpen(c.id, now) && !busyNow,
    };
  });
  const totalBookings = courtStats.reduce((s, c) => s + c.bookings, 0);
  const totalOpen = courtStats.reduce((s, c) => s + c.openMin, 0);
  const totalPct = totalOpen > 0 ? Math.round((courtStats.reduce((s, c) => s + c.busyMin, 0) / totalOpen) * 100) : 0;
  const freeNow = courtStats.filter(c => c.freeNow).length;

  const showNow = isToday && now >= rangeStart && now <= rangeEnd;

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm overflow-hidden">
      {/* Venue summary */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 border-b border-gray-100 text-sm">
        <span className="flex items-center gap-2 font-bold text-gray-900"><LayoutGrid className="w-4 h-4 text-purple-600" />Visão da arena</span>
        <span className="text-gray-600"><b className="text-gray-900">{courts.length}</b> {courts.length === 1 ? 'quadra' : 'quadras'}</span>
        <span className="text-gray-600"><b className="text-gray-900">{totalBookings}</b> {totalBookings === 1 ? 'reserva' : 'reservas'}{isToday ? ' hoje' : ''}</span>
        <span className="flex items-center gap-2 text-gray-600">
          <span className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><span className="block h-full bg-purple-600 rounded-full" style={{ width: `${totalPct}%` }} /></span>
          <b className="text-gray-900">{totalPct}%</b> ocupação
        </span>
        {isToday && (
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className={`w-2 h-2 rounded-full ${freeNow > 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
            <b className="text-gray-900">{freeNow}</b> {freeNow === 1 ? 'livre' : 'livres'} agora
          </span>
        )}
        <div className="ml-auto hidden lg:flex items-center gap-3 text-[11px] text-gray-500">
          {(['scheduled', 'live', 'done', 'pending'] as BookingState[]).map(s => (
            <span key={s} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm border-l-2 ${STATE_STYLE[s].card}`} />{STATE_STYLE[s].label}</span>
          ))}
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border-l-2 bg-sky-50 border-l-sky-500" />Partida aberta</span>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-auto max-h-[calc(100vh-260px)] min-h-[420px]">
        <div className="flex min-w-max">
          {/* Time column */}
          <div className="w-14 flex-shrink-0 sticky left-0 z-30 bg-white border-r border-gray-200">
            <div className="h-[68px] sticky top-0 z-10 bg-white border-b-2 border-gray-200" />
            <div className="relative" style={{ height: rows.length * ROW_PX }}>
              {rows.filter(m => m % 60 === 0).map(m => (
                <span key={m} className="absolute right-2 text-[11px] font-medium text-gray-400 tabular-nums -translate-y-1/2" style={{ top: top(m) }}>
                  {m === rangeStart ? '' : fromMin(m)}
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

          {/* Court columns */}
          {courts.map((court, ci) => {
            const stats = courtStats[ci];
            return (
              <div key={court.id} className="w-[220px] flex-shrink-0 border-r border-gray-100 last:border-r-0">
                <div className="h-[68px] sticky top-0 z-20 bg-white border-b-2 border-gray-200 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-bold text-sm text-gray-900 truncate">{court.name}</h3>
                    {stats.closeLabel && <span className="text-[11px] text-gray-400 whitespace-nowrap">até {stats.closeLabel}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${stats.pct >= 70 ? 'bg-green-500' : stats.pct >= 30 ? 'bg-purple-500' : 'bg-gray-300'}`} style={{ width: `${stats.pct}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold text-gray-600 tabular-nums">{stats.pct}%</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{stats.bookings} {stats.bookings === 1 ? 'reserva' : 'reservas'}</p>
                </div>

                <div className="relative" style={{ height: rows.length * ROW_PX }}>
                  {/* Background cells: open hours are clickable to create a booking/block */}
                  {rows.map(m => {
                    const open = isOpen(court.id, m) || availableStarts.has(`${court.id}|${m}`);
                    const hourLine = m % 60 === 0 ? 'border-t border-gray-200' : 'border-t border-dashed border-gray-100';
                    return open ? (
                      <button key={m} onClick={() => onEmptyCellClick(court.id, fromMin(m))}
                        className={`absolute inset-x-0 ${hourLine} hover:bg-green-50 group transition-colors`}
                        style={{ top: top(m), height: ROW_PX }}>
                        <span className="hidden group-hover:block text-[10px] text-green-600 font-semibold pl-2 text-left">+ {fromMin(m)}</span>
                      </button>
                    ) : (
                      <div key={m} className={`absolute inset-x-0 ${hourLine} bg-gray-50/80`} style={{ top: top(m), height: ROW_PX }} />
                    );
                  })}

                  {showNow && (
                    <div className="absolute inset-x-0 z-20 h-0.5 bg-red-500/80 pointer-events-none" style={{ top: top(now) }} />
                  )}

                  {/* Bookings, open games, blocked ranges */}
                  {(blocksByCourt[court.id] ?? []).map(b => {
                    const height = Math.max(((b.end - b.start) / STEP_MIN) * ROW_PX - 4, 22);
                    const compact = height < 50;
                    const range = `${fromMin(b.start)}–${fromMin(b.end)}`;

                    if (b.kind === 'blocked') {
                      return (
                        <button key={b.key} onClick={() => onSlotClick(b.slot)}
                          className="absolute left-1.5 right-1.5 z-10 rounded-lg bg-gray-100 border-l-4 border-l-gray-300 text-left px-2 py-1 overflow-hidden hover:bg-gray-200 transition-colors"
                          style={{ top: top(b.start) + 2, height, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,0.03) 6px 12px)' }}>
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500"><Ban className="w-3 h-3" />Bloqueado</span>
                          {!compact && <span className="text-[10px] text-gray-400 tabular-nums">{range}</span>}
                        </button>
                      );
                    }

                    if (b.kind === 'open_game') {
                      const g = b.slot.game!;
                      return (
                        <button key={b.key} onClick={() => onSlotClick(b.slot)}
                          className="absolute left-1.5 right-1.5 z-10 rounded-lg bg-sky-50 border-l-4 border-l-sky-500 text-left px-2.5 py-1.5 overflow-hidden shadow-sm hover:shadow-md hover:brightness-[0.98] transition-all"
                          style={{ top: top(b.start) + 2, height }}>
                          <div className="flex items-center gap-1 text-xs font-bold text-sky-800 truncate"><Users className="w-3.5 h-3.5 flex-shrink-0" />Partida aberta</div>
                          {!compact && <div className="text-[11px] text-sky-600 tabular-nums">{range}</div>}
                          {!compact && (
                            <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
                              {g.current_players}/{g.max_players} jogadores
                            </span>
                          )}
                        </button>
                      );
                    }

                    const state = bookingState(b);
                    const style = STATE_STYLE[state];
                    const bk = b.slot.booking!;
                    return (
                      <button key={b.key} onClick={() => onSlotClick(b.slot)}
                        className={`absolute left-1.5 right-1.5 z-10 rounded-lg border-l-4 ${style.card} text-left px-2.5 py-1.5 overflow-hidden shadow-sm hover:shadow-md hover:brightness-[0.98] transition-all ${state === 'live' ? 'ring-2 ring-purple-300' : ''}`}
                        style={{ top: top(b.start) + 2, height }}>
                        <div className="text-xs font-bold text-gray-900 truncate">{bk.profiles?.name ?? 'Jogador'}</div>
                        {!compact && (
                          <div className="text-[11px] text-gray-500 tabular-nums">
                            {range} · R$ {netCourtPrice(bk.court_price, bk.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                        {height >= 64 && (
                          <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.pill}`}>{style.label}</span>
                        )}
                        {compact && <span className={`absolute right-2 top-1.5 w-2 h-2 rounded-full ${style.pill.split(' ')[0]}`} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
