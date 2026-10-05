import { useMemo } from 'react';
import { LayoutGrid } from 'lucide-react';
import {
  ScheduleGrid, GridColumn, GridSlot, GridSchedule, BookingState,
  STATE_STYLE, buildBlocks, columnStats, useNowMinutes,
} from './ScheduleGrid';

/**
 * Day view of the whole venue: one column per court, venue summary on top
 * (quadras, reservas, ocupação, livres agora). The grid itself is the shared
 * ScheduleGrid, same engine as the week view.
 */

interface Props {
  courts: { id: string; name: string }[];
  slots: GridSlot[];
  schedules: Record<string, Record<number, GridSchedule>>;
  date: Date;
  dateStr: string;
  isToday: boolean;
  netCourtPrice: (cp: number | null | undefined, total: number | undefined) => number;
  onEmptyCellClick: (courtId: string, date: Date, hour: string) => void;
  onSlotClick: (slot: GridSlot) => void;
}

export function ArenaDayView({ courts, slots, schedules, date, dateStr, isToday, netCourtPrice, onEmptyCellClick, onSlotClick }: Props) {
  const now = useNowMinutes();
  const dow = date.getDay();

  const base = useMemo(() => courts.map(c => {
    const colSlots = slots.filter(s => s.court_id === c.id && s.start_time?.startsWith(dateStr));
    return { court: c, colSlots, schedule: schedules[c.id]?.[dow] };
  }), [courts, slots, schedules, dateStr, dow]);

  const stats = base.map(b => columnStats({ slots: b.colSlots, schedule: b.schedule }, buildBlocks(b.colSlots), isToday ? now : null));

  const columns: GridColumn[] = base.map((b, i) => {
    const s = stats[i];
    return {
      key: b.court.id,
      courtId: b.court.id,
      date,
      dateStr,
      slots: b.colSlots,
      schedule: b.schedule,
      isToday,
      header: (
        <div className="px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-bold text-sm text-gray-900 truncate">{b.court.name}</h3>
            {s.closeLabel && <span className="text-[11px] text-gray-400 whitespace-nowrap">até {s.closeLabel}</span>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${s.pct >= 70 ? 'bg-green-500' : s.pct >= 30 ? 'bg-purple-500' : 'bg-gray-300'}`} style={{ width: `${s.pct}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-gray-600 tabular-nums">{s.pct}%</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{s.bookings} {s.bookings === 1 ? 'reserva' : 'reservas'}</p>
        </div>
      ),
    };
  });

  const totalBookings = stats.reduce((sum, s) => sum + s.bookings, 0);
  const totalCapacity = stats.reduce((sum, s) => sum + s.capacity, 0);
  const totalPct = totalCapacity > 0 ? Math.round((stats.reduce((sum, s) => sum + s.busyMin, 0) / totalCapacity) * 100) : 0;
  const freeNow = stats.filter(s => s.freeNow).length;

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm overflow-hidden">
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
        <AgendaLegend />
      </div>

      <ScheduleGrid
        columns={columns}
        columnWidth={220}
        headerHeight={68}
        maxHeight="calc(100vh - 260px)"
        scrollKey={dateStr}
        netCourtPrice={netCourtPrice}
        onEmptyCellClick={onEmptyCellClick}
        onSlotClick={onSlotClick}
      />
    </div>
  );
}

export function AgendaLegend() {
  return (
    <div className="ml-auto hidden lg:flex items-center gap-3 text-[11px] text-gray-500">
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-50 border border-green-200" />Livre</span>
      {(['scheduled', 'live', 'done', 'pending'] as BookingState[]).map(s => (
        <span key={s} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm border-l-2 ${STATE_STYLE[s].card}`} />{STATE_STYLE[s].label}</span>
      ))}
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border-l-2 bg-sky-50 border-l-sky-500" />Partida aberta</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border-l-2 bg-gray-100 border-l-gray-300" />Bloqueado</span>
    </div>
  );
}
