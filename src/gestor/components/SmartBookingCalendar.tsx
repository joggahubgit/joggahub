import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Ban, Filter, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { CreateSchedule } from './CreateSchedule';
import { RemoveSlots } from './RemoveSlots';
import { SlotModal } from './SlotModal';
import { OpenGameModal } from './OpenGameModal';
import { DynamicSlotModal } from './DynamicSlotModal';
import { GestorBookingDetail } from './GestorBookingDetail';

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
    profiles: { name: string; phone: string } | null;
  } | null;
  game?: {
    id: string;
    is_open: boolean;
    current_players: number;
    max_players: number;
  } | null;
}

const HOURS = Array.from({ length: 33 }, (_, i) => {
  const totalMins = 420 + i * 30; // 07:00 → 23:00
  return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
});

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

function isoDate(date: Date) {
  return date.toISOString().split('T')[0];
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
  const [viewMode, setViewMode] = useState<ViewMode>('week');
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
    existingSlotId?: string; existingEndHour?: string;
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

  const fetchAll = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
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
      if (bookingIds.length) {
        const { data: linkedGames } = await supabase
          .from('games')
          .select('booking_id, court_price')
          .in('booking_id', bookingIds);
        (linkedGames ?? []).forEach(g => {
          if (g.booking_id) courtPriceByBooking[g.booking_id] = g.court_price ?? null;
        });
      }

      (bookingRows ?? []).forEach(b => {
        bookingBySlot[b.slot_id] = {
          ...b,
          profiles: profileMap[b.created_by] ?? null,
          court_price: courtPriceByBooking[b.id] ?? null,
        };
      });

      const { data: gameRows } = await supabase
        .from('games')
        .select('id, slot_id, is_open, current_players, max_players')
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
      setLoading(false);
    }
  }, [venueId, viewMode, focusedDate, weekStart]);

  // Always keep a current reference to fetchAll so callbacks (realtime, timers)
  // never use a stale closure.
  const fetchAllRef = useRef(fetchAll);
  fetchAllRef.current = fetchAll;

  useEffect(() => {
    if (!venueId) return;
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!venueId) return;
    const channel = supabase
      .channel(`gestor-slots-${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => fetchAllRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchAllRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'court_schedules' }, () => fetchAllRef.current())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  function isWithinSchedule(courtId: string, date: Date, hour: string): boolean {
    const dow = date.getDay();
    const sched = courtSchedules[courtId]?.[dow];
    if (!sched) return false;
    // Normalize to "HH:MM" — Postgres time columns come back as "HH:MM:SS"
    const open = sched.open_time.substring(0, 5);
    const close = sched.close_time.substring(0, 5);
    return hour >= open && hour < close;
  }

  function getSlot(courtId: string, date: Date, hour: string): Slot | undefined {
    const dateStr = isoDate(date);
    return slots.find(s =>
      s.court_id === courtId &&
      s.start_time?.startsWith(dateStr) &&
      s.start_time?.substring(11, 16) === hour
    );
  }

  function getSlotStatus(slot: Slot | undefined): 'available' | 'booked' | 'blocked' | 'open_game' | 'empty' {
    if (!slot) return 'empty';
    if (slot.booking) return 'booked';
    if (slot.game) return 'open_game';
    if (!slot.is_available) return 'blocked';
    return 'available';
  }

  function shouldShow(slot: Slot | undefined) {
    if (filterStatus === 'all') return true;
    return getSlotStatus(slot) === filterStatus;
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

        {/* Row 2: filtros de status */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 bg-gray-50">
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

          {/* Color legend */}
          <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-400 hidden sm:flex">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border-l-2 border-green-300 inline-block" />Disponível</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-600 inline-block" />Pago</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />Pendente</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border-l-2 border-blue-400 inline-block" />Aberto</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-200 inline-block" />Bloqueado</span>
          </div>
        </div>
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
      ) : (
        <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm">
          {displayCourts.map(court => {
            const isCollapsed = selectedCourtId === 'all' && collapsedCourts.has(court.id);
            return (
            <div key={court.id} className="border-b-2 border-gray-200 last:border-0">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-bold text-base text-gray-900">{court.name}</h3>
                <div className="flex items-center gap-3">
                  {/* per-court booked count for this period */}
                  {(() => {
                    const courtBooked = slots.filter(s => s.court_id === court.id && s.booking).length;
                    return courtBooked > 0 ? (
                      <span className="text-xs text-gray-400">{courtBooked} reserva{courtBooked !== 1 ? 's' : ''}</span>
                    ) : null;
                  })()}
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

              {!isCollapsed && <div className="flex">
                {/* TIME COLUMN */}
                <div className="w-14 flex-shrink-0 bg-white border-r border-gray-200 z-10">
                  <div className="h-12 border-b-2 border-gray-200" />
                  {HOURS.map((hour, i) => (
                    <div key={hour} className="relative h-10 border-b border-gray-100">
                      <span className={`absolute right-2 text-[10px] font-medium text-gray-400 tabular-nums leading-none ${i === 0 ? 'top-1' : '-top-[0.5em]'}`}>
                        {hour}
                      </span>
                    </div>
                  ))}
                </div>

                {/* DAY COLUMNS */}
                <div className="flex-1 overflow-x-auto">
                  <div className="inline-flex min-w-full">
                    {displayDays.map((day, dayIdx) => (
                      <div key={dayIdx} className={`flex-1 min-w-[140px] border-r border-gray-200 last:border-0 ${sameDay(day, today) ? 'bg-blue-50/30' : ''}`}>
                        <div className={`h-12 border-b-2 border-gray-200 flex items-center justify-center ${sameDay(day, today) ? 'bg-blue-50' : 'bg-gray-50'}`}>
                          <div className="text-center">
                            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{formatDayName(day)}</div>
                            {sameDay(day, today)
                              ? <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center mx-auto mt-0.5">
                                  <span className="text-sm font-bold text-white">{day.getDate()}</span>
                                </div>
                              : <div className="text-sm font-bold text-gray-900">{formatShortDate(day)}</div>
                            }
                          </div>
                        </div>

                        {HOURS.map((hour) => {
                          const slot = getSlot(court.id, day, hour);
                          const status = getSlotStatus(slot);
                          // available slots (e.g. after booking cancellation) are always interactive;
                          // empty cells within schedule hours are also interactive
                          const scheduled = status === 'available' || (status === 'empty' && isWithinSchedule(court.id, day, hour));
                          const borderClass = 'border-b border-gray-100';

                          if (!scheduled && !shouldShow(slot)) return (
                            <div key={hour} className={`h-10 ${borderClass} bg-transparent`} />
                          );

                          if (scheduled) {
                            const sched = courtSchedules[court.id]?.[day.getDay()];
                            return (
                              <button
                                key={hour}
                                onClick={() => setSelectedDynamic({
                                  courtId: court.id,
                                  courtName: court.name,
                                  date: day,
                                  hour,
                                  pricePerHour: slot?.price_override ?? sched?.price ?? 0,
                                  ...(slot ? {
                                    existingSlotId: slot.id,
                                    existingEndHour: slot.end_time?.substring(11, 16),
                                  } : {}),
                                })}
                                className={`w-full h-10 ${borderClass} bg-green-50/60 border-l-[2px] border-l-green-200 flex items-center hover:bg-green-100/70 transition-colors group`}
                              >
                                <span className="text-[9px] text-green-400 ml-2 tabular-nums leading-none group-hover:text-green-600">{hour}</span>
                              </button>
                            );
                          }

                          return (
                            <button
                              key={hour}
                              onClick={() => {
                                if (!slot) return;
                                if (slot.game) setSelectedGameSlot(slot);
                                else if (slot.booking) setSelectedBookingId(slot.booking.id);
                                else setSelectedSlot(slot);
                              }}
                              disabled={!slot}
                              className={`w-full h-10 ${borderClass} text-xs transition-all ${
                                status === 'open_game'
                                  ? 'bg-blue-50 hover:bg-blue-100 border-l-[3px] border-l-blue-500'
                                  : status === 'booked'
                                  ? slot?.booking?.payment_status === 'paid'
                                    ? 'bg-purple-600 hover:bg-purple-700 text-white border-l-[3px] border-l-purple-800'
                                    : 'bg-orange-500 hover:bg-orange-600 text-white border-l-[3px] border-l-orange-700'
                                  : status === 'blocked'
                                  ? 'bg-gray-100 hover:bg-gray-200 border-l-[3px] border-l-gray-300'
                                  : 'bg-white cursor-default'
                              }`}
                            >
                              {status === 'booked' && slot?.booking && (
                                <div className="px-2 pt-1.5 h-full flex flex-col justify-start items-start overflow-hidden gap-0.5">
                                  <div className="text-[9px] opacity-75 leading-none tabular-nums">
                                    {slot.start_time.substring(11,16)} – {slot.end_time.substring(11,16)}
                                  </div>
                                  <div className="font-bold truncate w-full text-left text-[11px] leading-tight">
                                    {slot.booking.profiles?.name?.split(' ')[0] ?? 'Jogador'}
                                  </div>
                                  <div className="opacity-90 flex items-center gap-0.5 text-[10px]">
                                    {slot.booking.payment_status === 'paid'
                                      ? <CheckCircle className="w-2.5 h-2.5 flex-shrink-0" />
                                      : <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />}
                                    R$ {netCourtPrice(slot.booking.court_price, slot.booking.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                              )}
                              {status === 'open_game' && slot?.game && (
                                <div className="px-2 pt-1.5 h-full flex flex-col justify-start overflow-hidden gap-0.5">
                                  <div className="text-[9px] text-blue-400 leading-none tabular-nums">
                                    {slot.start_time.substring(11,16)} – {slot.end_time.substring(11,16)}
                                  </div>
                                  <div className="font-bold text-blue-700 text-[11px] leading-tight truncate">Partida Aberta</div>
                                  <div className="text-[10px] text-blue-500">
                                    {slot.game.current_players}/{slot.game.max_players} jogadores
                                  </div>
                                </div>
                              )}
                              {status === 'blocked' && (
                                <div className="px-2 pt-1.5 h-full flex flex-col justify-start overflow-hidden gap-0.5">
                                  <div className="text-[9px] text-gray-400 leading-none tabular-nums">
                                    {slot!.start_time.substring(11,16)} – {slot!.end_time.substring(11,16)}
                                  </div>
                                  <div className="flex items-center gap-1 mt-1">
                                    <Ban className="w-3 h-3 text-gray-400" />
                                    <span className="text-[10px] text-gray-400">Bloqueado</span>
                                  </div>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>}
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
          existingSlotId={selectedDynamic.existingSlotId}
          existingEndHour={selectedDynamic.existingEndHour}
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
