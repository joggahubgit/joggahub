import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Filter, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { CreateSchedule } from './CreateSchedule';
import { RemoveSlots } from './RemoveSlots';
import { SlotModal } from './SlotModal';
import { OpenGameModal } from './OpenGameModal';
import { DynamicSlotModal } from './DynamicSlotModal';
import { GestorBookingDetail } from './GestorBookingDetail';
import { ArenaDayView, AgendaLegend } from './ArenaDayView';
import { ScheduleGrid, freeMinutesFrom, type GridColumn } from './ScheduleGrid';

interface Props {
  venueId: string;
  onNavigate?: (tab: string) => void;
}

interface Court { id: string; name: string; }
interface Slot {
  id: string;
  court_id: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  price_override: number | null;
  booking?: {
    id: string;
    payment_status: string;
    total_price: number;
    court_price: number | null;
    status: string;
    scheduled_end_at?: string | null;
    profiles: { name: string; phone: string } | null;
  } | null;
  game?: {
    id: string;
    is_open: boolean;
    current_players: number;
    max_players: number;
    scheduled_end_at?: string | null;
  } | null;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday wraps to previous Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function formatDayName(date: Date) {
  return date.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase();
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Local calendar date (YYYY-MM-DD). Not toISOString(): that's UTC, which in
 *  Brazil flips to the next day from 21:00 on and showed tomorrow's agenda. */
function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sameDay(a: Date, b: Date) {
  return isoDate(a) === isoDate(b);
}

type ViewMode = 'week' | 'day';

interface CourtScheduleEntry { open_time: string; close_time: string; price: number; }
type CourtScheduleMap = Record<string, Record<number, CourtScheduleEntry>>;

export function SmartBookingCalendar({ venueId, onNavigate }: Props) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [courtSchedules, setCourtSchedules] = useState<CourtScheduleMap>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [focusedDate, setFocusedDate] = useState(() => new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedGameSlot, setSelectedGameSlot] = useState<Slot | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'booked' | 'blocked'>('all');
  const [selectedCourtId, setSelectedCourtId] = useState<string>('all');
  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [showRemoveSlots, setShowRemoveSlots] = useState(false);
  const [selectedDynamic, setSelectedDynamic] = useState<{
    courtId: string; courtName: string; date: Date; hour: string; pricePerHour: number;
    slotTotalPrice?: number;
    existingSlotId?: string; existingEndHour?: string;
    maxMinutes?: number;
  } | null>(null);
  const [collapsedCourts, setCollapsedCourts] = useState<Set<string>>(new Set());

  function toggleCourt(courtId: string) {
    setCollapsedCourts(prev => {
      const next = new Set(prev);
      if (next.has(courtId)) next.delete(courtId); else next.add(courtId);
      return next;
    });
  }

  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const displayDays = viewMode === 'week' ? weekDays : [focusedDate];
  const displayCourts = selectedCourtId === 'all' ? courts : courts.filter(c => c.id === selectedCourtId);

  function getFetchRange(): { fromDate: string; toDate: string } {
    if (viewMode === 'day') {
      const d = isoDate(focusedDate);
      return { fromDate: d, toDate: d };
    }
    return { fromDate: isoDate(weekStart), toDate: isoDate(addDays(weekStart, 6)) };
  }

  const fetchAll = useCallback(async (silent = false) => {
    if (!venueId) return;
    if (!silent) setLoading(true);
    try {
      const { fromDate, toDate } = getFetchRange();

      const { data: courtRows, error: courtError } = await supabase
        .from('courts').select('id, name').eq('venue_id', venueId).neq('is_active', false);
      if (courtError) console.error('[Calendar] courts error', courtError);

      const validCourts = courtRows ?? [];
      setCourts(validCourts);

      if (!validCourts.length) { setSlots([]); setCourtSchedules({}); return; }

      const { data: scheduleRows } = await supabase
        .from('court_schedules')
        .select('court_id, day_of_week, open_time, close_time, price')
        .in('court_id', validCourts.map(c => c.id));

      const schedMap: CourtScheduleMap = {};
      (scheduleRows ?? []).forEach(s => {
        if (!schedMap[s.court_id]) schedMap[s.court_id] = {};
        schedMap[s.court_id][s.day_of_week] = { open_time: s.open_time, close_time: s.close_time, price: s.price ?? 0 };
      });
      setCourtSchedules(schedMap);

      const { data: slotRows, error: slotError } = await supabase
        .from('slots')
        .select('id, court_id, start_time, end_time, is_available, price_override')
        .in('court_id', validCourts.map(c => c.id))
        .gte('start_time', `${fromDate}T00:00:00`)
        .lte('start_time', `${toDate}T23:59:59`)
        .order('start_time', { ascending: true });
      if (slotError) console.error('[Calendar] slots error', slotError);

      if (!slotRows?.length) { setSlots([]); return; }

      const allSlotIds = slotRows.map(s => s.id);
      let bookingBySlot: Record<string, any> = {};
      let gameBySlot: Record<string, any> = {};

      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('id, slot_id, created_by, payment_status, total_price, status')
        .in('slot_id', allSlotIds)
        .neq('status', 'cancelled');

      const userIds = [...new Set((bookingRows ?? []).map(b => b.created_by).filter(Boolean))];
      const profileMap: Record<string, { name: string; phone: string }> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, name, phone').in('id', userIds);
        (profiles ?? []).forEach(p => { profileMap[p.id] = p; });
      }

      const bookingIds = (bookingRows ?? []).map(b => b.id);
      const courtPriceByBooking: Record<string, number | null> = {};
      const endByBooking: Record<string, string | null> = {};
      if (bookingIds.length) {
        const { data: linkedGames } = await supabase
          .from('games')
          .select('booking_id, court_price, scheduled_end_at')
          .in('booking_id', bookingIds);
        (linkedGames ?? []).forEach(g => {
          if (!g.booking_id) return;
          courtPriceByBooking[g.booking_id] = g.court_price ?? null;
          endByBooking[g.booking_id] = g.scheduled_end_at ?? null;
        });
      }

      (bookingRows ?? []).forEach(b => {
        bookingBySlot[b.slot_id] = {
          ...b,
          profiles: profileMap[b.created_by] ?? null,
          court_price: courtPriceByBooking[b.id] ?? null,
          scheduled_end_at: endByBooking[b.id] ?? null,
        };
      });

      const { data: gameRows } = await supabase
        .from('games')
        .select('id, slot_id, is_open, current_players, max_players, scheduled_end_at')
        .in('slot_id', allSlotIds);
      (gameRows ?? []).filter(g => g.is_open === true).forEach(g => { gameBySlot[g.slot_id] = g; });

      setSlots(slotRows.map(s => ({
        ...s,
        booking: bookingBySlot[s.id] ?? null,
        game: gameBySlot[s.id] ?? null,
      })));
    } catch (e) {
      console.error('[Calendar] fetchAll error', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [venueId, viewMode, focusedDate, weekStart]);

  // Always keep a current reference to fetchAll so callbacks (realtime, timers)
  // never use a stale closure.
  const fetchAllRef = useRef<(silent?: boolean) => Promise<void>>(fetchAll);
  fetchAllRef.current = fetchAll;

  useEffect(() => {
    if (!venueId) return;
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!venueId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const poll = setInterval(() => fetchAllRef.current(true), 15_000);

    // Ensure JWT is on the realtime connection before subscribing so RLS has auth.uid()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`gestor-slots-${venueId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' },          () => fetchAllRef.current(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' },       () => fetchAllRef.current(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' },          () => fetchAllRef.current(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'court_schedules' },() => fetchAllRef.current(true))
        .subscribe();
    });

    return () => { if (channel) supabase.removeChannel(channel); clearInterval(poll); };
  }, [venueId]);

  useEffect(() => {
    setSelectedCourtId('all');
  }, [courts.length]);

  function switchView(mode: ViewMode) {
    if (mode === 'week') setWeekStart(startOfWeek(focusedDate));
    setViewMode(mode);
  }

  function navigatePrev() {
    if (viewMode === 'week') setWeekStart(prev => addDays(prev, -7));
    else setFocusedDate(prev => addDays(prev, -1));
  }

  function navigateNext() {
    if (viewMode === 'week') setWeekStart(prev => addDays(prev, 7));
    else setFocusedDate(prev => addDays(prev, 1));
  }

  function goToday() {
    const now = new Date();
    setFocusedDate(now);
    setWeekStart(startOfWeek(now));
  }

  function navigateLabel() {
    if (viewMode === 'week') return `${formatShortDate(weekDays[0])} – ${formatShortDate(weekDays[6])}`;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return cap(formatLongDate(focusedDate));
  }

  function getSlot(courtId: string, date: Date, hour: string): Slot | undefined {
    const dateStr = isoDate(date);
    return slots.find(s =>
      s.court_id === courtId &&
      s.start_time?.startsWith(dateStr) &&
      s.start_time?.substring(11, 16) === hour
    );
  }

  // ── Stats for visible period ──
  const statsSlots = selectedCourtId === 'all' ? slots : slots.filter(s => s.court_id === selectedCourtId);
  const bookedSlots = statsSlots.filter(s => s.booking).length;
  const pendingSlots = statsSlots.filter(s => s.booking?.payment_status === 'pending').length;
  const netCourtPrice = (cp: number | null | undefined, total: number | undefined) =>
    cp != null ? cp : Math.round(((total ?? 0) - 2.50) / 1.08 * 100) / 100;
  const paidRevenue = statsSlots
    .filter(s => s.booking?.payment_status === 'paid')
    .reduce((sum, s) => sum + netCourtPrice(s.booking?.court_price, s.booking?.total_price), 0);
  const hasSchedule = Object.keys(courtSchedules).length > 0 || slots.length > 0;

  /** Free cell clicked (inside opening hours or an available slot): open the booking/block modal. */
  function openEmptyCell(court: Court, day: Date, hour: string) {
    const slot = getSlot(court.id, day, hour);
    const sched = courtSchedules[court.id]?.[day.getDay()];
    const slotEndHour = slot?.end_time?.substring(11, 16);
    const slotDurationMin = slot && slotEndHour
      ? (() => {
          const [eh, em] = slotEndHour.split(':').map(Number);
          const [sh, sm] = hour.split(':').map(Number);
          return (eh * 60 + em) - (sh * 60 + sm);
        })()
      : 0;
    // CreateAvailability slots (duration > 30 min): price_override is the per-session total
    // CreateSchedule slots (duration = 30 min): price_override is per-hour; don't lock duration
    const isSessionSlot = slotDurationMin > 30;
    const dateStr = isoDate(day);
    const courtDaySlots = slots.filter(s => s.court_id === court.id && s.start_time?.startsWith(dateStr));
    const [h, m] = hour.split(':').map(Number);
    setSelectedDynamic({
      courtId: court.id,
      courtName: court.name,
      date: day,
      hour,
      maxMinutes: freeMinutesFrom(courtDaySlots, sched, h * 60 + m),
      pricePerHour: isSessionSlot ? 0 : (slot?.price_override ?? sched?.price ?? 0),
      slotTotalPrice: isSessionSlot && slot?.price_override != null ? slot.price_override : undefined,
      // Only lock to existing slot when it has a fixed session duration (> 30 min)
      ...(isSessionSlot && slot ? { existingSlotId: slot.id, existingEndHour: slotEndHour } : {}),
    });
  }

  function handleEmptyCellClick(courtId: string, day: Date, hour: string) {
    const court = courts.find(c => c.id === courtId);
    if (court) openEmptyCell(court, day, hour);
  }

  /** Booked / open game / blocked slot clicked: open its detail modal. */
  function openSlot(slot: Slot) {
    if (slot.game) setSelectedGameSlot(slot);
    else if (slot.booking) setSelectedBookingId(slot.booking.id);
    else setSelectedSlot(slot);
  }

  const isShowingToday = viewMode === 'day' && sameDay(focusedDate, today);
  const statsLabel = isShowingToday ? 'Hoje' : viewMode === 'day' ? formatShortDate(focusedDate) : 'Semana';

  return (
    <div className="space-y-4">

      {/* ── Metrics strip ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-400 font-medium">Receita · {statsLabel}</p>
          <p className="text-2xl font-bold text-purple-600 leading-tight mt-0.5">
            R$ {paidRevenue.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-400 font-medium">Reservas · {statsLabel}</p>
          <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{bookedSlots}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-400 font-medium">Pendentes · {statsLabel}</p>
          <p className={`text-2xl font-bold leading-tight mt-0.5 ${pendingSlots > 0 ? 'text-orange-500' : 'text-gray-900'}`}>
            {pendingSlots}
          </p>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

        {/* Row 1: navegação + quadra + ações */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">

          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
            {(['day', 'week'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => switchView(mode)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                  viewMode === mode ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}>
                {mode === 'week' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>

          {/* Date navigator */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
            <button onClick={navigatePrev} className="p-1.5 hover:bg-white rounded-md transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="px-3 text-sm font-semibold text-gray-800 whitespace-nowrap capitalize min-w-[160px] text-center">
              {navigateLabel()}
            </span>
            <button onClick={navigateNext} className="p-1.5 hover:bg-white rounded-md transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* Hoje button */}
          {!isShowingToday && (
            <button onClick={goToday}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-600 transition-all flex-shrink-0">
              Hoje
            </button>
          )}

          {/* Divider */}
          <div className="h-6 w-px bg-gray-200 flex-shrink-0 hidden sm:block" />

          {/* Court pills */}
          {courts.length > 1 && (
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => setSelectedCourtId('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  selectedCourtId === 'all'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}>
                Todas
              </button>
              {courts.map(c => (
                <button key={c.id}
                  onClick={() => setSelectedCourtId(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    selectedCourtId === c.id
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}>
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowCreateSlot(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Horários</span>
            </button>
            <button onClick={() => setShowRemoveSlots(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-red-500 text-sm font-semibold border border-red-200 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Remover</span>
            </button>
          </div>
        </div>

        {/* Row 2: filtros de status (week view only — the arena view has its own legend) */}
        {viewMode === 'week' && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 bg-gray-50">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs text-gray-400 font-medium">Mostrar:</span>
          </div>
          <div className="flex gap-1.5">
            {([
              { value: 'all', label: 'Todos' },
              { value: 'available', label: 'Livres', dot: 'bg-green-500' },
              { value: 'booked', label: 'Reservados', dot: 'bg-purple-600' },
              { value: 'blocked', label: 'Bloqueados', dot: 'bg-gray-400' },
            ] as const).map(f => (
              <button key={f.value} onClick={() => setFilterStatus(f.value)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  filterStatus === f.value
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-200'
                }`}>
                {'dot' in f && f.dot && filterStatus !== f.value && (
                  <div className={`w-2 h-2 rounded-full ${f.dot}`} />
                )}
                {f.label}
              </button>
            ))}
          </div>

          <AgendaLegend />
        </div>}
      </div>

      {/* ── Calendar grid ── */}
      {loading ? (
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center text-gray-400">
          Carregando agenda...
        </div>
      ) : courts.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center">
          <p className="text-gray-500 font-semibold mb-1">Nenhuma quadra cadastrada</p>
          <p className="text-sm text-gray-400">Adicione quadras em <button onClick={() => onNavigate?.('settings')} className="text-purple-600 underline">Configurações</button>.</p>
        </div>
      ) : !hasSchedule ? (
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center">
          <p className="text-gray-500 font-semibold mb-1">Nenhum horário configurado</p>
          <p className="text-sm text-gray-400 mb-4">Configure os horários de funcionamento para que jogadores possam reservar.</p>
          <button
            onClick={() => setShowCreateSlot(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors">
            <Plus className="w-4 h-4" />
            Configurar horários
          </button>
        </div>
      ) : viewMode === 'day' ? (
        <ArenaDayView
          courts={displayCourts}
          slots={slots}
          schedules={courtSchedules}
          date={focusedDate}
          dateStr={isoDate(focusedDate)}
          isToday={isShowingToday}
          netCourtPrice={netCourtPrice}
          onEmptyCellClick={handleEmptyCellClick}
          onSlotClick={slot => openSlot(slot as Slot)}
        />
      ) : (
        <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm">
          {displayCourts.map(court => {
            const isCollapsed = selectedCourtId === 'all' && collapsedCourts.has(court.id);
            const courtBooked = slots.filter(s => s.court_id === court.id && s.booking).length;
            const columns: GridColumn[] = displayDays.map(day => {
              const dateStr = isoDate(day);
              const isToday = sameDay(day, today);
              return {
                key: dateStr,
                courtId: court.id,
                date: day,
                dateStr,
                slots: slots.filter(s => s.court_id === court.id && s.start_time?.startsWith(dateStr)),
                schedule: courtSchedules[court.id]?.[day.getDay()],
                isToday,
                header: (
                  <div className={`h-full flex flex-col items-center justify-center ${isToday ? 'bg-purple-50' : 'bg-gray-50'}`}>
                    <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{formatDayName(day)}</div>
                    {isToday
                      ? <div className="w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center mt-0.5">
                          <span className="text-sm font-bold text-white">{day.getDate()}</span>
                        </div>
                      : <div className="text-sm font-bold text-gray-900">{formatShortDate(day)}</div>}
                  </div>
                ),
              };
            });
            return (
            <div key={court.id} className="border-b-2 border-gray-200 last:border-0">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-bold text-base text-gray-900">{court.name}</h3>
                <div className="flex items-center gap-3">
                  {courtBooked > 0 && (
                    <span className="text-xs text-gray-400">{courtBooked} reserva{courtBooked !== 1 ? 's' : ''}</span>
                  )}
                  {selectedCourtId === 'all' && (
                    <button
                      onClick={() => toggleCourt(court.id)}
                      className="p-1 rounded-lg hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
                      title={isCollapsed ? 'Expandir' : 'Minimizar'}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                    </button>
                  )}
                </div>
              </div>

              {!isCollapsed && (
                <ScheduleGrid
                  columns={columns}
                  columnWidth={150}
                  headerHeight={56}
                  filter={filterStatus}
                  maxHeight="70vh"
                  scrollKey={`${isoDate(weekStart)}|${court.id}`}
                  netCourtPrice={netCourtPrice}
                  onEmptyCellClick={handleEmptyCellClick}
                  onSlotClick={slot => openSlot(slot as Slot)}
                />
              )}
            </div>
          );
          })}
        </div>
      )}

      {/* ── Modals ── */}
      {showRemoveSlots && (
        <RemoveSlots
          venueId={venueId}
          onClose={() => setShowRemoveSlots(false)}
          onSaved={() => { setShowRemoveSlots(false); fetchAll(); }}
        />
      )}

      {showCreateSlot && (
        <CreateSchedule
          venueId={venueId}
          onClose={() => setShowCreateSlot(false)}
          onSaved={({ startDate }) => {
            const d = new Date(startDate + 'T12:00:00');
            setFocusedDate(d);
            setWeekStart(startOfWeek(d));
            setViewMode('week');
            setShowCreateSlot(false);
            // Force refetch after React re-renders with the new state.
            // Needed when weekStart didn't change (same week), so useEffect([fetchAll]) won't fire.
            requestAnimationFrame(() => fetchAllRef.current());
          }}
        />
      )}

      {selectedBookingId && (
        <GestorBookingDetail
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onChanged={() => { fetchAll(); setSelectedBookingId(null); }}
        />
      )}

      {selectedSlot && (
        <SlotModal
          slot={selectedSlot}
          courtName={courts.find(c => c.id === selectedSlot.court_id)?.name ?? 'Quadra'}
          onClose={() => setSelectedSlot(null)}
          onRefresh={() => { fetchAll(); setSelectedSlot(null); }}
        />
      )}

      {selectedDynamic && (
        <DynamicSlotModal
          courtId={selectedDynamic.courtId}
          courtName={selectedDynamic.courtName}
          date={selectedDynamic.date}
          hour={selectedDynamic.hour}
          pricePerHour={selectedDynamic.pricePerHour}
          slotTotalPrice={selectedDynamic.slotTotalPrice}
          existingSlotId={selectedDynamic.existingSlotId}
          existingEndHour={selectedDynamic.existingEndHour}
          maxMinutes={selectedDynamic.maxMinutes}
          onClose={() => setSelectedDynamic(null)}
          onRefresh={() => { fetchAll(); setSelectedDynamic(null); }}
        />
      )}

      {selectedGameSlot?.game && (
        <OpenGameModal
          gameId={selectedGameSlot.game.id}
          slotId={selectedGameSlot.id}
          courtName={courts.find(c => c.id === selectedGameSlot.court_id)?.name ?? 'Quadra'}
          onClose={() => setSelectedGameSlot(null)}
          onRefresh={() => { fetchAll(); setSelectedGameSlot(null); }}
        />
      )}
    </div>
  );
}
