import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Ban, Filter, Clock, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { CreateAvailability } from './CreateAvailability';
import { RemoveSlots } from './RemoveSlots';
import { SlotModal } from './SlotModal';
import { OpenGameModal } from './OpenGameModal';

interface Props { venueId: string; }

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
    profiles: { name: string; phone: string } | null;
  } | null;
  game?: {
    id: string;
    is_open: boolean;
    current_players: number;
    max_players: number;
  } | null;
}

const HOURS = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'];
const DAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function formatDayName(date: Date) {
  return date.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase();
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function isoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function sameDay(a: Date, b: Date) {
  return isoDate(a) === isoDate(b);
}

type ViewMode = 'week' | 'day' | 'month';

export function SmartBookingCalendar({ venueId }: Props) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedGameSlot, setSelectedGameSlot] = useState<Slot | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'booked' | 'blocked'>('all');
  const [selectedCourtId, setSelectedCourtId] = useState<string>('all');

  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [showRemoveSlots, setShowRemoveSlots] = useState(false);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const displayDays = viewMode === 'week' ? weekDays : [weekDays[selectedDay]];
  const displayCourts = selectedCourtId === 'all' ? courts : courts.filter(c => c.id === selectedCourtId);

  // Build the month grid: all days from start-of-week of month's first day
  const monthGridDays = (() => {
    const firstDayOfMonth = monthStart;
    const gridStart = startOfWeek(firstDayOfMonth);
    const lastDayOfMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const gridEnd = addDays(startOfWeek(lastDayOfMonth), 6);
    const days: Date[] = [];
    let cur = gridStart;
    while (cur <= gridEnd) {
      days.push(new Date(cur));
      cur = addDays(cur, 1);
    }
    return days;
  })();

  function getFetchRange(): { fromDate: string; toDate: string } {
    if (viewMode === 'month') {
      const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      return { fromDate: isoDate(monthStart), toDate: isoDate(lastDay) };
    }
    return { fromDate: isoDate(weekStart), toDate: isoDate(addDays(weekStart, 6)) };
  }

  useEffect(() => {
    if (!venueId) return;
    fetchAll();
  }, [venueId, weekStart, monthStart, viewMode]);

  // Realtime: re-fetch whenever any slot changes
  useEffect(() => {
    if (!venueId) return;
    const channel = supabase
      .channel(`gestor-slots-${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => {
        fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchAll();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [venueId]);

  useEffect(() => {
    setSelectedCourtId('all');
  }, [courts.length]);

  async function fetchAll() {
    setLoading(true);
    try {
      const { fromDate, toDate } = getFetchRange();

      const { data: courtRows, error: courtError } = await supabase
        .from('courts').select('id, name').eq('venue_id', venueId).neq('is_active', false);

      if (courtError) console.error('[Calendar] courts error', courtError);

      const validCourts = courtRows ?? [];
      setCourts(validCourts);

      if (!validCourts.length) { setSlots([]); return; }

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
      const bookedSlotIds = slotRows.filter(s => !s.is_available).map(s => s.id);
      let bookingBySlot: Record<string, any> = {};
      let gameBySlot: Record<string, any> = {};

      // Fetch bookings for unavailable slots
      if (bookedSlotIds.length) {
        const { data: bookingRows } = await supabase
          .from('bookings')
          .select('id, slot_id, created_by, payment_status, total_price')
          .in('slot_id', bookedSlotIds)
          .neq('status', 'cancelled');

        const userIds = [...new Set((bookingRows ?? []).map(b => b.created_by).filter(Boolean))];
        const profileMap: Record<string, { name: string; phone: string }> = {};
        if (userIds.length) {
          const { data: profiles } = await supabase
            .from('profiles').select('id, name, phone').in('id', userIds);
          (profiles ?? []).forEach(p => { profileMap[p.id] = p; });
        }
        (bookingRows ?? []).forEach(b => {
          bookingBySlot[b.slot_id] = { ...b, profiles: profileMap[b.created_by] ?? null };
        });
      }

      // Fetch games for all slots, keep only active ones
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
  }

  function fetchSlots() { fetchAll(); }

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
    if (slot.game) return 'open_game';   // must come before is_available check — games set slot to unavailable
    if (!slot.is_available) return 'blocked';
    return 'available';
  }

  function shouldShow(slot: Slot | undefined) {
    if (filterStatus === 'all') return true;
    return getSlotStatus(slot) === filterStatus;
  }

  function getSlotsForDay(date: Date) {
    const dateStr = isoDate(date);
    return statsSlots.filter(s => s.start_time?.startsWith(dateStr));
  }

  function navigatePrev() {
    if (viewMode === 'week') setWeekStart(addDays(weekStart, -7));
    else if (viewMode === 'day') setSelectedDay(prev => Math.max(0, prev - 1));
    else setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1));
  }

  function navigateNext() {
    if (viewMode === 'week') setWeekStart(addDays(weekStart, 7));
    else if (viewMode === 'day') setSelectedDay(prev => Math.min(6, prev + 1));
    else setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1));
  }

  function navigateLabel() {
    if (viewMode === 'week') return `${formatShortDate(weekDays[0])} – ${formatShortDate(weekDays[6])}`;
    if (viewMode === 'day') return formatShortDate(weekDays[selectedDay]);
    return formatMonthYear(monthStart);
  }

  function openDayFromMonth(date: Date) {
    const ws = startOfWeek(date);
    setWeekStart(ws);
    setSelectedDay(date.getDay());
    setViewMode('day');
  }

  const statsSlots = selectedCourtId === 'all' ? slots : slots.filter(s => s.court_id === selectedCourtId);
  const totalSlots = statsSlots.length;
  const bookedSlots = statsSlots.filter(s => s.booking).length;
  const availableSlots = statsSlots.filter(s => !s.booking && s.is_available).length;

  const today = new Date();

  return (
    <div className="space-y-4">
      {/* ── Header: título + stats ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestão de Agenda</h2>
          <p className="text-sm text-gray-500 mt-0.5">Visualize e gerencie todos os horários</p>
        </div>

        {/* Stats strip */}
        <div className="flex gap-3">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm text-center min-w-[72px]">
            <p className="text-xs text-gray-400 font-medium">Ocupação</p>
            <p className="text-xl font-bold text-purple-600 leading-tight">
              {totalSlots > 0 ? `${Math.round((bookedSlots / totalSlots) * 100)}%` : '—'}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm text-center min-w-[72px]">
            <p className="text-xs text-gray-400 font-medium">Livres</p>
            <p className="text-xl font-bold text-green-600 leading-tight">{availableSlots}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm text-center min-w-[72px]">
            <p className="text-xs text-gray-400 font-medium">Reservas</p>
            <p className="text-xl font-bold text-gray-900 leading-tight">{bookedSlots}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm text-center min-w-[72px]">
            <p className="text-xs text-gray-400 font-medium">Total</p>
            <p className="text-xl font-bold text-gray-900 leading-tight">{totalSlots}</p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

        {/* Row 1: navegação + quadra + ações */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">

          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
            {(['month', 'week', 'day'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                  viewMode === mode ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}>
                {mode === 'month' ? 'Mês' : mode === 'week' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>

          {/* Date navigator */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
            <button onClick={navigatePrev} className="p-1.5 hover:bg-white rounded-md transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="px-3 text-sm font-semibold text-gray-800 whitespace-nowrap capitalize min-w-[140px] text-center">
              {navigateLabel()}
            </span>
            <button onClick={navigateNext} className="p-1.5 hover:bg-white rounded-md transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

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
              <span className="hidden sm:inline">Criar horários</span>
            </button>
            <button onClick={() => setShowRemoveSlots(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-red-500 text-sm font-semibold border border-red-200 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Remover</span>
            </button>
          </div>
        </div>

        {/* Row 2: filtros de status + legenda (só semana/dia) */}
        {viewMode !== 'month' && (
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
          </div>
        )}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center text-gray-400">Carregando agenda...</div>
      ) : courts.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center text-gray-400">
          Nenhuma quadra cadastrada. Adicione quadras nas Configurações.
        </div>
      ) : viewMode === 'month' ? (
        /* ── Month View ── */
        <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b-2 border-gray-200">
            {DAY_NAMES_SHORT.map(d => (
              <div key={d} className="py-3 text-center text-xs font-bold text-gray-500 uppercase">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {monthGridDays.map((day, idx) => {
              const inMonth = day.getMonth() === monthStart.getMonth();
              const isToday = sameDay(day, today);
              const daySlots = getSlotsForDay(day);
              const booked = daySlots.filter(s => s.booking).length;
              const available = daySlots.filter(s => !s.booking && s.is_available).length;
              const blocked = daySlots.filter(s => !s.is_available && !s.booking).length;
              const hasAny = daySlots.length > 0;
              const isLastRow = idx >= monthGridDays.length - 7;
              const isLastCol = (idx + 1) % 7 === 0;

              return (
                <button
                  key={idx}
                  onClick={() => inMonth && openDayFromMonth(day)}
                  disabled={!inMonth}
                  className={`
                    min-h-[80px] md:min-h-[100px] p-2 text-left border-b border-r border-gray-100 transition-colors
                    ${isLastRow ? 'border-b-0' : ''}
                    ${isLastCol ? 'border-r-0' : ''}
                    ${!inMonth ? 'bg-gray-50 cursor-default' : 'hover:bg-purple-50 cursor-pointer'}
                  `}
                >
                  <div className={`
                    w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold mb-1
                    ${isToday ? 'bg-purple-600 text-white' : inMonth ? 'text-gray-900' : 'text-gray-300'}
                  `}>
                    {day.getDate()}
                  </div>

                  {inMonth && hasAny && (
                    <div className="space-y-1">
                      {booked > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-purple-600 flex-shrink-0" />
                          <span className="text-xs text-purple-700 font-medium">{booked} res.</span>
                        </div>
                      )}
                      {available > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                          <span className="text-xs text-green-700 font-medium">{available} livres</span>
                        </div>
                      )}
                      {blocked > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-500 font-medium">{blocked} bloq.</span>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Week / Day View ── */
        <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm">
          {displayCourts.map(court => (
            <div key={court.id} className="border-b-2 border-gray-200 last:border-0">
              <div className="bg-gray-100 px-6 py-4 border-b-2 border-gray-200">
                <h3 className="font-bold text-lg text-gray-900">{court.name}</h3>
              </div>

              <div className="flex">
                {/* TIME COLUMN — outside scroll so labels never get clipped */}
                <div className="w-14 flex-shrink-0 bg-white border-r border-gray-200 z-10">
                  <div className="h-12 border-b-2 border-gray-200" />
                  {HOURS.map((hour, i) => (
                    <div key={hour} className="relative h-16 border-b border-gray-100">
                      <span className={`absolute right-2 text-[11px] font-medium text-gray-400 tabular-nums leading-none ${i === 0 ? 'top-1' : '-top-[0.55em]'}`}>
                        {hour}
                      </span>
                    </div>
                  ))}
                </div>

                {/* DAY COLUMNS — horizontally scrollable */}
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

                      {HOURS.map((hour, i) => {
                        const slot = getSlot(court.id, day, hour);
                        const status = getSlotStatus(slot);
                        const borderClass = 'border-b border-gray-100';

                        if (!shouldShow(slot)) return (
                          <div key={hour} className={`h-16 ${borderClass} bg-transparent`} />
                        );

                        return (
                          <button
                            key={hour}
                            onClick={() => {
                              if (!slot) return;
                              if (slot.game) setSelectedGameSlot(slot);
                              else setSelectedSlot(slot);
                            }}
                            disabled={!slot}
                            className={`w-full h-16 ${borderClass} text-xs transition-all ${
                              status === 'available'
                                ? 'bg-green-50 hover:bg-green-100 border-l-[3px] border-l-green-500'
                                : status === 'open_game'
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
                                  R$ {slot.booking.total_price}
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
                            {status === 'available' && (
                              <div className="px-2 pt-1.5 h-full flex flex-col justify-start overflow-hidden gap-0.5">
                                <div className="text-[9px] text-green-500 leading-none tabular-nums">
                                  {slot!.start_time.substring(11,16)} – {slot!.end_time.substring(11,16)}
                                </div>
                                <div className="font-bold text-green-700 text-[11px] leading-tight">Livre</div>
                                <div className="text-[10px] text-green-600">R$ {slot?.price_override ?? '—'}</div>
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
                </div>{/* end overflow-x-auto */}
                </div>{/* end flex */}
            </div>
          ))}
        </div>
      )}

      {/* Remove slots modal */}
      {showRemoveSlots && (
        <RemoveSlots
          venueId={venueId}
          onClose={() => setShowRemoveSlots(false)}
          onSaved={() => { setShowRemoveSlots(false); fetchSlots(); }}
        />
      )}

      {/* Create slot modal */}
      {showCreateSlot && (
        <CreateAvailability
          venueId={venueId}
          onClose={() => setShowCreateSlot(false)}
          onSaved={() => { setShowCreateSlot(false); fetchSlots(); }}
          prefill={{
            courtId: selectedCourtId !== 'all' ? selectedCourtId : undefined,
            date: isoDate(viewMode === 'day' ? weekDays[selectedDay] : new Date()),
          }}
        />
      )}

      {/* Slot detail modal */}
      {selectedSlot && (
        <SlotModal
          slot={selectedSlot}
          courtName={courts.find(c => c.id === selectedSlot.court_id)?.name ?? 'Quadra'}
          onClose={() => setSelectedSlot(null)}
          onRefresh={() => { fetchSlots(); setSelectedSlot(null); }}
        />
      )}

      {selectedGameSlot?.game && (
        <OpenGameModal
          gameId={selectedGameSlot.game.id}
          slotId={selectedGameSlot.id}
          courtName={courts.find(c => c.id === selectedGameSlot.court_id)?.name ?? 'Quadra'}
          onClose={() => setSelectedGameSlot(null)}
          onRefresh={() => { fetchSlots(); setSelectedGameSlot(null); }}
        />
      )}
    </div>
  );
}
