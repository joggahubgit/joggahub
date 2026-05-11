import { useState, useEffect } from 'react';
import {
  X, Trash2, AlertTriangle, Loader2, Check,
  CalendarIcon, Users, CreditCard, Bell,
  ChevronRight, XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface Props {
  onClose: () => void;
  onSaved?: () => void;
  venueId: string | null;
}

const weekDays = [
  { id: 'seg', label: 'Seg', js: 1 },
  { id: 'ter', label: 'Ter', js: 2 },
  { id: 'qua', label: 'Qua', js: 3 },
  { id: 'qui', label: 'Qui', js: 4 },
  { id: 'sex', label: 'Sex', js: 5 },
  { id: 'sab', label: 'Sáb', js: 6 },
  { id: 'dom', label: 'Dom', js: 0 },
];

const quickHours = [
  '00:00','06:00','07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00',
  '19:00','20:00','21:00','22:00','23:00','23:59',
];

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isoOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface Preview {
  total: number;
  withPendingBookings: number;
  withPaidBookings: number;
  withGames: number;
  freeSlots: number;   // no booking, no game
}

type Step = 'filter' | 'preview' | 'executing' | 'done';

interface ExecutionResult {
  deletedSlots: number;
  cancelledBookings: number;
  cancelledPaidBookings: number;
  cancelledGames: number;
  errors: string[];
}

export function RemoveSlots({ onClose, onSaved, venueId }: Props) {
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string>('all');
  const [startDate, setStartDate] = useState(isoOffset(-180));
  const [endDate, setEndDate] = useState(isoOffset(365));
  const [selectedDays, setSelectedDays] = useState<string[]>(weekDays.map(d => d.id));
  const [timeFrom, setTimeFrom] = useState('00:00');
  const [timeTo, setTimeTo] = useState('23:59');

  // What to cancel
  const [cancelPendingBookings, setCancelPendingBookings] = useState(false);
  const [cancelPaidBookings, setCancelPaidBookings] = useState(false);
  const [cancelGames, setCancelGames] = useState(false);

  const [step, setStep] = useState<Step>('filter');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState('');

  // Cached slot/booking/game data for execution
  const [cachedSlots, setCachedSlots] = useState<any[]>([]);
  const [cachedBookings, setCachedBookings] = useState<any[]>([]);
  const [cachedGames, setCachedGames] = useState<any[]>([]);

  useEffect(() => {
    if (!venueId) return;
    supabase.from('courts').select('id, name').eq('venue_id', venueId).neq('is_active', false).then(({ data }) => {
      if (data?.length) { setCourts(data); }
    });
  }, [venueId]);

  function getAffectedDates(): string[] {
    const dates: string[] = [];
    const from = new Date(startDate + 'T00:00:00');
    const to = new Date(endDate + 'T00:00:00');
    from.setHours(0, 0, 0, 0); to.setHours(0, 0, 0, 0);
    if (to < from) return dates;
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dayId = weekDays.find(w => w.js === d.getDay())?.id;
      if (dayId && selectedDays.includes(dayId)) dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }

  async function loadPreview() {
    if (selectedDays.length === 0) return;
    setLoadingPreview(true); setError('');

    const dates = getAffectedDates();
    if (!dates.length) { setLoadingPreview(false); return; }

    const courtIds = selectedCourtId === 'all' ? courts.map(c => c.id) : [selectedCourtId];

    const { data: slotRows } = await supabase
      .from('slots').select('id, is_available, start_time')
      .in('court_id', courtIds)
      .gte('start_time', `${startDate}T${timeFrom}:00`)
      .lte('start_time', `${endDate}T${timeTo}:59`);

    const inDates = (slotRows ?? []).filter(s => dates.includes(s.start_time?.substring(0, 10)));
    if (!inDates.length) {
      setPreview({ total: 0, withPendingBookings: 0, withPaidBookings: 0, withGames: 0, freeSlots: 0 });
      setLoadingPreview(false); return;
    }

    const slotIds = inDates.map(s => s.id);

    const [{ data: bookingRows }, { data: gameRows }] = await Promise.all([
      supabase.from('bookings').select('slot_id, payment_status').in('slot_id', slotIds).neq('status', 'cancelled'),
      supabase.from('games').select('slot_id, id').in('slot_id', slotIds),
    ]);

    // Cache for execution
    setCachedSlots(inDates);
    setCachedBookings(bookingRows ?? []);
    setCachedGames((gameRows ?? []).filter(g => g !== null));

    const bookedBySlot: Record<string, { payment_status: string }> = {};
    (bookingRows ?? []).forEach(b => { bookedBySlot[b.slot_id] = b; });

    const gameSlotIds = new Set((gameRows ?? []).map(g => g.slot_id));

    const withPendingBookings = inDates.filter(s => bookedBySlot[s.id]?.payment_status !== 'paid' && bookedBySlot[s.id]).length;
    const withPaidBookings = inDates.filter(s => bookedBySlot[s.id]?.payment_status === 'paid').length;
    const withGames = inDates.filter(s => !bookedBySlot[s.id] && gameSlotIds.has(s.id)).length;
    const freeSlots = inDates.filter(s => !bookedBySlot[s.id] && !gameSlotIds.has(s.id)).length;

    setPreview({ total: inDates.length, withPendingBookings, withPaidBookings, withGames, freeSlots });
    setLoadingPreview(false);
    setStep('preview');
  }

  function getDeletableCount(): number {
    if (!preview) return 0;
    let count = preview.freeSlots;
    if (cancelPendingBookings) count += preview.withPendingBookings;
    if (cancelPaidBookings) count += preview.withPaidBookings;
    if (cancelGames) count += preview.withGames;
    return count;
  }

  async function handleExecute() {
    if (!confirmed || !preview) return;
    setStep('executing');
    setError('');

    const errors: string[] = [];
    let cancelledBookings = 0;
    let cancelledPaidBookings = 0;
    let cancelledGames = 0;
    let deletedSlots = 0;

    const bookedBySlot: Record<string, string> = {}; // slotId → bookingId (need booking ids)
    // Re-fetch full booking data with IDs for cancellation
    const { data: fullBookings } = await supabase
      .from('bookings')
      .select('id, slot_id, payment_status')
      .in('slot_id', cachedSlots.map(s => s.id))
      .neq('status', 'cancelled');

    (fullBookings ?? []).forEach(b => { bookedBySlot[b.slot_id] = b.id; });

    const gamesBySlot: Record<string, string> = {};
    cachedGames.forEach(g => { gamesBySlot[g.slot_id] = g.id; });

    const toDelete: string[] = [];

    for (const slot of cachedSlots) {
      const bookingId = bookedBySlot[slot.id];
      const gameId = gamesBySlot[slot.id];
      const isPaid = (fullBookings ?? []).find(b => b.slot_id === slot.id)?.payment_status === 'paid';

      if (bookingId) {
        if ((isPaid && cancelPaidBookings) || (!isPaid && cancelPendingBookings)) {
          // Cancel this booking via edge function
          const { error: fnErr } = await supabase.functions.invoke('cancel-booking', {
            body: { bookingId },
          });
          if (fnErr) {
            const body = await (fnErr as any).context?.json?.().catch(() => null);
            errors.push(body?.error ?? fnErr.message ?? `Erro ao cancelar reserva ${bookingId}`);
          } else {
            cancelledBookings++;
            if (isPaid) cancelledPaidBookings++;
            toDelete.push(slot.id);
          }
        }
        // else: skip this booked slot (keep it)
      } else if (gameId) {
        if (cancelGames) {
          const { error: fnErr } = await supabase.functions.invoke('cancel-game', {
            body: { gameId },
          });
          if (fnErr) {
            const body = await (fnErr as any).context?.json?.().catch(() => null);
            errors.push(body?.error ?? fnErr.message ?? `Erro ao cancelar partida ${gameId}`);
          } else {
            cancelledGames++;
            toDelete.push(slot.id);
          }
        }
        // else: skip
      } else {
        // Free slot — always delete
        toDelete.push(slot.id);
      }
    }

    // Unlink draft games before deletion
    if (toDelete.length > 0) {
      await supabase.from('games').update({ slot_id: null }).in('slot_id', toDelete).eq('is_open', false);
    }

    // Delete slots in batches
    for (let i = 0; i < toDelete.length; i += 100) {
      const batch = toDelete.slice(i, i + 100);
      const { error: delErr } = await supabase.from('slots').delete().in('id', batch);
      if (delErr) {
        errors.push(delErr.message);
      } else {
        deletedSlots += batch.length;
      }
    }

    setResult({ deletedSlots, cancelledBookings, cancelledPaidBookings, cancelledGames, errors });
    setStep('done');
    onSaved ? onSaved() : undefined;
  }

  const deletable = getDeletableCount();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Cancelamento em Bloco</h3>
            <p className="text-sm text-gray-500 mt-0.5">Cancele reservas e remova horários em lote</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">

          {/* ── STEP: FILTER ── */}
          {(step === 'filter' || step === 'preview') && (
            <>
              {/* Quadra */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Quadra</label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setSelectedCourtId('all'); setStep('filter'); setPreview(null); setConfirmed(false); }}
                    className={`px-4 py-2 rounded-xl font-semibold text-sm border-2 transition-colors ${
                      selectedCourtId === 'all' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-200 hover:border-red-300'
                    }`}>
                    Todas
                  </button>
                  {courts.map(c => (
                    <button key={c.id} onClick={() => { setSelectedCourtId(c.id); setStep('filter'); setPreview(null); setConfirmed(false); }}
                      className={`px-4 py-2 rounded-xl font-semibold text-sm border-2 transition-colors ${
                        selectedCourtId === c.id ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-200 hover:border-red-300'
                      }`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Período */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Data inicial</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="date" value={startDate}
                      onChange={e => { setStartDate(e.target.value); setStep('filter'); setPreview(null); }}
                      className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-red-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Data final</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="date" value={endDate} min={startDate}
                      onChange={e => { setEndDate(e.target.value); setStep('filter'); setPreview(null); }}
                      className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-red-400" />
                  </div>
                </div>
              </div>

              {/* Dias */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">Dias da semana</label>
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => { setSelectedDays(weekDays.map(d => d.id)); setStep('filter'); setPreview(null); }} className="text-red-600 font-semibold">Todos</button>
                    <button onClick={() => { setSelectedDays([]); setStep('filter'); setPreview(null); }} className="text-gray-400 font-semibold">Nenhum</button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {weekDays.map(day => (
                    <button key={day.id}
                      onClick={() => {
                        setSelectedDays(prev => prev.includes(day.id) ? prev.filter(d => d !== day.id) : [...prev, day.id]);
                        setStep('filter'); setPreview(null);
                      }}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                        selectedDays.includes(day.id) ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horário */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Das</label>
                  <select value={timeFrom} onChange={e => { setTimeFrom(e.target.value); setStep('filter'); setPreview(null); }}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-red-400">
                    {quickHours.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Até</label>
                  <select value={timeTo} onChange={e => { setTimeTo(e.target.value); setStep('filter'); setPreview(null); }}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-red-400">
                    {quickHours.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              {/* Buscar */}
              <button onClick={loadPreview} disabled={loadingPreview || selectedDays.length === 0 || courts.length === 0}
                className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {loadingPreview
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Buscando horários...</>
                  : <><ChevronRight className="w-4 h-4" /> Ver horários afetados</>}
              </button>

              {/* ── PREVIEW ── */}
              {step === 'preview' && preview && (
                <div className="space-y-4">
                  <div className="border-t border-gray-100 pt-5">
                    <p className="text-sm font-bold text-gray-900 mb-3">
                      {preview.total} horário{preview.total !== 1 ? 's' : ''} encontrado{preview.total !== 1 ? 's' : ''}
                    </p>

                    {/* Breakdown cards */}
                    <div className="space-y-2.5">

                      {/* Free slots — always deleted */}
                      {preview.freeSlots > 0 && (
                        <div className="flex items-center gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                          <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Trash2 className="w-4 h-4 text-gray-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-700">Horários livres / bloqueados</p>
                            <p className="text-xs text-gray-500">Serão removidos automaticamente</p>
                          </div>
                          <span className="text-sm font-bold text-gray-700 bg-gray-200 px-2.5 py-1 rounded-full">
                            {preview.freeSlots}
                          </span>
                        </div>
                      )}

                      {/* Pending bookings */}
                      {preview.withPendingBookings > 0 && (
                        <div className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-colors cursor-pointer ${
                          cancelPendingBookings ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-200 hover:border-orange-200'
                        }`} onClick={() => setCancelPendingBookings(v => !v)}>
                          <input type="checkbox" checked={cancelPendingBookings}
                            onChange={e => setCancelPendingBookings(e.target.checked)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 mt-0.5 accent-orange-600 flex-shrink-0" />
                          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">Reservas com pagamento pendente</p>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                              <Bell className="w-3 h-3" /> Jogadores serão notificados
                            </p>
                          </div>
                          <span className="text-sm font-bold text-orange-600 bg-orange-100 px-2.5 py-1 rounded-full flex-shrink-0">
                            {preview.withPendingBookings}
                          </span>
                        </div>
                      )}

                      {/* Paid bookings */}
                      {preview.withPaidBookings > 0 && (
                        <div className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-colors cursor-pointer ${
                          cancelPaidBookings ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200 hover:border-red-200'
                        }`} onClick={() => setCancelPaidBookings(v => !v)}>
                          <input type="checkbox" checked={cancelPaidBookings}
                            onChange={e => setCancelPaidBookings(e.target.checked)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 mt-0.5 accent-red-600 flex-shrink-0" />
                          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <CreditCard className="w-4 h-4 text-red-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">Reservas pagas</p>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                              <Bell className="w-3 h-3" /> Notificados · Reembolso manual necessário
                            </p>
                          </div>
                          <span className="text-sm font-bold text-red-600 bg-red-100 px-2.5 py-1 rounded-full flex-shrink-0">
                            {preview.withPaidBookings}
                          </span>
                        </div>
                      )}

                      {/* Games */}
                      {preview.withGames > 0 && (
                        <div className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-colors cursor-pointer ${
                          cancelGames ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:border-blue-200'
                        }`} onClick={() => setCancelGames(v => !v)}>
                          <input type="checkbox" checked={cancelGames}
                            onChange={e => setCancelGames(e.target.checked)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 mt-0.5 accent-blue-600 flex-shrink-0" />
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4 text-blue-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">Partidas abertas</p>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                              <Bell className="w-3 h-3" /> Jogadores notificados · Reembolso Stripe automático
                            </p>
                          </div>
                          <span className="text-sm font-bold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full flex-shrink-0">
                            {preview.withGames}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Total to delete */}
                    <div className="mt-4 flex items-center justify-between p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                      <span className="font-bold text-red-800">Serão removidos</span>
                      <span className="text-2xl font-black text-red-600">{deletable}</span>
                    </div>

                    {deletable === 0 && preview.total > 0 && (
                      <p className="text-sm text-gray-500 text-center mt-2">
                        Marque as opções acima para incluir horários com reservas ou partidas.
                      </p>
                    )}

                    {deletable > 0 && (
                      <>
                        {cancelPaidBookings && (
                          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800">
                              <strong>{preview.withPaidBookings} reserva{preview.withPaidBookings > 1 ? 's pagas' : ' paga'}</strong> {preview.withPaidBookings > 1 ? 'precisam' : 'precisa'} de reembolso manual após o cancelamento.
                            </p>
                          </div>
                        )}

                        <label className="flex items-start gap-3 cursor-pointer select-none mt-3 bg-white rounded-xl p-3.5 border-2 border-red-200">
                          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                            className="w-4 h-4 mt-0.5 accent-red-600 flex-shrink-0" />
                          <span className="text-sm font-semibold text-red-800">
                            Confirmo a remoção de {deletable} horário{deletable > 1 ? 's' : ''}
                            {(cancelPendingBookings && preview.withPendingBookings > 0) || (cancelPaidBookings && preview.withPaidBookings > 0)
                              ? ` e cancelamento de ${(cancelPendingBookings ? preview.withPendingBookings : 0) + (cancelPaidBookings ? preview.withPaidBookings : 0)} reserva${((cancelPendingBookings ? preview.withPendingBookings : 0) + (cancelPaidBookings ? preview.withPaidBookings : 0)) > 1 ? 's' : ''}`
                              : ''}
                            {cancelGames && preview.withGames > 0
                              ? ` e ${preview.withGames} partida${preview.withGames > 1 ? 's' : ''}`
                              : ''}
                          </span>
                        </label>

                        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2">{error}</p>}

                        <div className="flex gap-3 mt-4">
                          <button onClick={onClose}
                            className="flex-1 py-3 rounded-xl border-2 border-gray-200 font-semibold text-gray-700 hover:bg-gray-50 transition-colors text-sm">
                            Cancelar
                          </button>
                          <button onClick={handleExecute} disabled={!confirmed || deletable === 0}
                            className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                            <XCircle className="w-4 h-4" />
                            Executar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP: EXECUTING ── */}
          {step === 'executing' && (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-red-500" />
              <p className="text-base font-bold text-gray-800">Processando cancelamentos...</p>
              <p className="text-sm text-gray-500 text-center">
                Notificando jogadores e liberando horários.
              </p>
            </div>
          )}

          {/* ── STEP: DONE ── */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="bg-green-50 rounded-2xl p-6 border border-green-100 text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-lg font-bold text-green-800">Concluído!</p>
              </div>

              <div className="space-y-2">
                {result.deletedSlots > 0 && (
                  <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2.5">
                      <Trash2 className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Horários removidos</span>
                    </div>
                    <span className="font-bold text-gray-900">{result.deletedSlots}</span>
                  </div>
                )}
                {result.cancelledBookings > 0 && (
                  <div className="flex items-center justify-between p-3.5 bg-orange-50 rounded-xl border border-orange-100">
                    <div className="flex items-center gap-2.5">
                      <XCircle className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-orange-800">Reservas canceladas</span>
                    </div>
                    <span className="font-bold text-orange-700">{result.cancelledBookings}</span>
                  </div>
                )}
                {result.cancelledGames > 0 && (
                  <div className="flex items-center justify-between p-3.5 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-blue-800">Partidas canceladas</span>
                    </div>
                    <span className="font-bold text-blue-700">{result.cancelledGames}</span>
                  </div>
                )}
                {result.cancelledPaidBookings > 0 && (
                  <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">
                      Lembre-se de processar os reembolsos manualmente para as reservas pagas canceladas.
                    </p>
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div className="p-3.5 bg-red-50 rounded-xl border border-red-200">
                    <p className="text-sm font-semibold text-red-800 mb-1">Alguns erros ocorreram:</p>
                    {result.errors.slice(0, 3).map((e, i) => (
                      <p key={i} className="text-xs text-red-600">{e}</p>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={() => { onSaved ? onSaved() : onClose(); }}
                className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors">
                Fechar
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
