import { useState, useEffect } from 'react';
import { X, Trash2, CheckCircle, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const TIME_OPTIONS = Array.from({ length: 37 }, (_, i) => {
  const totalMins = 360 + i * 30; // 06:00 → 00:00
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

const TEMPLATES = [
  { label: '1 faixa',       desc: '08–22',            bands: [{ start: '08:00', end: '22:00', price: 150 }] },
  { label: 'Off-peak+Peak', desc: '08–13 / 13–22',    bands: [{ start: '08:00', end: '13:00', price: 80 }, { start: '13:00', end: '22:00', price: 150 }] },
  { label: '3 períodos',    desc: 'Manhã/Tarde/Noite', bands: [{ start: '06:00', end: '12:00', price: 80 }, { start: '12:00', end: '18:00', price: 150 }, { start: '18:00', end: '23:00', price: 120 }] },
];

const BAND_COLORS = ['bg-purple-500', 'bg-blue-500', 'bg-emerald-500', 'bg-orange-400', 'bg-pink-500'];

const TIMELINE_START = 360;  // 06:00 in minutes
const TIMELINE_RANGE = 1020; // 06:00–23:00

interface Band   { id: number; start: string; end: string; price: number; }
interface Court  { id: string; name: string; }
interface Props  { venueId: string; onClose: () => void; onSaved: (info: { startDate: string }) => void; }

let _uid = 1;
const uid = () => _uid++;

function toMins(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function slotCount(start: string, end: string) {
  const diff = toMins(end) - toMins(start);
  return diff > 0 ? Math.floor(diff / 30) : 0;
}

function countDays(from: string, to: string, dows: number[]) {
  if (!from || !to || !dows.length || from > to) return 0;
  const d = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  let n = 0;
  while (d <= end) { if (dows.includes(d.getDay())) n++; d.setDate(d.getDate() + 1); }
  return n;
}

function localIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDate(iso: string) {
  if (!iso) return '';
  const [, m, day] = iso.split('-');
  return `${day}/${m}`;
}

function timelineLeft(start: string) {
  return `${Math.max(0, (toMins(start) - TIMELINE_START) / TIMELINE_RANGE * 100)}%`;
}

function timelineWidth(start: string, end: string) {
  return `${Math.max(0, (toMins(end) - toMins(start)) / TIMELINE_RANGE * 100)}%`;
}

export function CreateSchedule({ venueId, onClose, onSaved }: Props) {
  const [courts, setCourts]       = useState<Court[]>([]);
  const [courtId, setCourtId]     = useState('');
  const [days, setDays]           = useState<number[]>([]);
  const [startDate, setStartDate] = useState(localIso(1));
  const [endDate, setEndDate]     = useState(localIso(8));
  const [bands, setBands]         = useState<Band[]>([{ id: uid(), start: '08:00', end: '22:00', price: 150 }]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    supabase.from('courts').select('id, name').eq('venue_id', venueId).neq('is_active', false).order('name')
      .then(({ data }) => { setCourts(data ?? []); if (data?.length) setCourtId(data[0].id); setLoading(false); });
  }, [venueId]);

  function toggleDay(day: number) {
    setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b));
  }

  function applyTemplate(t: typeof TEMPLATES[0]) {
    setBands(t.bands.map(b => ({ ...b, id: uid() })));
  }

  function addBand() {
    const last = bands[bands.length - 1];
    setBands(prev => [...prev, { id: uid(), start: last?.end ?? '08:00', end: '22:00', price: last?.price ?? 150 }]);
  }

  function updateBand(id: number, field: keyof Omit<Band,'id'>, value: string | number) {
    setBands(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  }

  function removeBand(id: number) {
    setBands(prev => prev.filter(b => b.id !== id));
  }

  // Validation
  const bandErrors: Record<number, string> = {};
  for (const b of bands) {
    if (b.end <= b.start) bandErrors[b.id] = 'Fim deve ser após o início';
    else if (b.price < 1) bandErrors[b.id] = 'Preço mínimo R$1';
  }
  const hasErrors   = Object.keys(bandErrors).length > 0;
  const numDays     = countDays(startDate, endDate, days);
  const slotsPerDay = bands.reduce((s, b) => s + slotCount(b.start, b.end), 0);
  const totalSlots  = numDays * slotsPerDay;
  const canSave     = !saving && days.length > 0 && bands.length > 0 && !hasErrors && !!startDate && !!endDate && startDate <= endDate;

  async function save() {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      // 1. Build the date range
      const rangeStart = new Date(startDate + 'T12:00:00');
      const rangeEnd   = new Date(endDate   + 'T12:00:00');

      // Collect all (date, band) pairs to insert
      const toInsert: {
        court_id: string;
        start_time: string;
        end_time: string;
        is_available: boolean;
        price_override: number;
      }[] = [];

      const d = new Date(rangeStart);
      while (d <= rangeEnd) {
        if (days.includes(d.getDay())) {
          const yyyy = d.getFullYear();
          const mm   = String(d.getMonth() + 1).padStart(2, '0');
          const dd   = String(d.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;

          for (const band of bands) {
            // Generate 30-min slots within the band
            let slotMins = toMins(band.start);
            const endMins = toMins(band.end);
            while (slotMins < endMins) {
              const nextMins = slotMins + 30;
              const hS = String(Math.floor(slotMins / 60)).padStart(2, '0');
              const mS = String(slotMins % 60).padStart(2, '0');
              const hE = String(Math.floor(nextMins / 60)).padStart(2, '0');
              const mE = String(nextMins % 60).padStart(2, '0');
              toInsert.push({
                court_id: courtId,
                start_time: `${dateStr}T${hS}:${mS}:00`,
                end_time:   `${dateStr}T${hE}:${mE}:00`,
                is_available: true,
                price_override: band.price,
              });
              slotMins = nextMins;
            }
          }
        }
        d.setDate(d.getDate() + 1);
      }

      if (toInsert.length === 0) {
        throw new Error('Nenhum slot a gerar com os parâmetros informados.');
      }

      // 2. Fetch ALL existing slots in the range (available + occupied)
      const { data: existingSlots } = await supabase
        .from('slots')
        .select('id, is_available, start_time')
        .eq('court_id', courtId)
        .gte('start_time', `${startDate}T00:00:00`)
        .lte('start_time', `${endDate}T23:59:59`);

      const allExisting = existingSlots ?? [];
      const availableSlots = allExisting.filter(s => s.is_available);
      // Occupied slots (booked/blocked) — must not be overwritten
      const occupiedTimes = new Set(allExisting.filter(s => !s.is_available).map(s => s.start_time.substring(0, 19)));

      if (availableSlots.length > 0) {
        const availableIds = availableSlots.map(s => s.id);

        const { data: bookedSlots } = await supabase
          .from('bookings')
          .select('slot_id')
          .in('slot_id', availableIds)
          .neq('status', 'cancelled');
        const bookedSlotIds = new Set((bookedSlots ?? []).map(b => b.slot_id));

        const { data: gameSlots } = await supabase
          .from('games')
          .select('slot_id')
          .in('slot_id', availableIds)
          .eq('is_open', true);
        const gameSlotIds = new Set((gameSlots ?? []).map(g => g.slot_id));

        const safeToDelete = availableIds.filter(id => !bookedSlotIds.has(id) && !gameSlotIds.has(id));
        if (safeToDelete.length > 0) {
          const { error: delError } = await supabase
            .from('slots')
            .delete()
            .in('id', safeToDelete);
          if (delError) throw new Error(`Erro ao limpar slots existentes: ${delError.message}`);
        }
      }

      // 3. Skip slots that would conflict with occupied (booked/blocked) existing slots
      const filteredInsert = toInsert.filter(s => !occupiedTimes.has(s.start_time.substring(0, 19)));

      if (filteredInsert.length === 0) {
        throw new Error('Todos os horários neste período já estão reservados ou bloqueados.');
      }

      // 4. Insert in batches of 100
      const BATCH = 100;
      for (let i = 0; i < filteredInsert.length; i += BATCH) {
        const batch = filteredInsert.slice(i, i + BATCH);
        const { error: insError } = await supabase.from('slots').insert(batch);
        if (insError) throw new Error(`Erro ao inserir slots: ${insError.message}`);
      }

      setSaved(true);
      setTimeout(() => onSaved({ startDate }), 1800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (saved) return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-10 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-9 h-9 text-green-500" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-xl">Horários gerados!</p>
          <p className="text-sm text-gray-500 mt-1">{totalSlots} horários criados</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Criar horários</h2>
            <p className="text-xs text-gray-400 mt-0.5">Slots de 30 min · duração escolhida pelo jogador</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? <p className="text-gray-400 text-sm text-center py-8">Carregando...</p> : (<>

            {/* Court */}
            {courts.length > 1 && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Quadra</label>
                <select value={courtId} onChange={e => setCourtId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {/* Date range */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Período</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">De</p>
                  <input type="date" value={startDate}
                    onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Até</p>
                  <input type="date" value={endDate} min={startDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              </div>
            </div>

            {/* Days */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dias da semana</label>
                <div className="flex gap-2 text-[11px] font-semibold">
                  <button onClick={() => setDays([...WEEKDAYS])} className="text-purple-600 hover:underline">Dias úteis</button>
                  <span className="text-gray-300">·</span>
                  <button onClick={() => setDays([...ALL_DAYS])} className="text-purple-600 hover:underline">Todos</button>
                  {days.length > 0 && <><span className="text-gray-300">·</span>
                  <button onClick={() => setDays([])} className="text-gray-400 hover:underline">Limpar</button></>}
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES.map((name, i) => (
                  <button key={i} onClick={() => toggleDay(i)}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      days.includes(i) ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    {name.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Time bands */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Faixas de horário e preço</label>
              </div>

              {/* Templates */}
              <div className="flex gap-2 flex-wrap mb-3">
                {TEMPLATES.map(t => (
                  <button key={t.label} onClick={() => applyTemplate(t)}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-purple-50 hover:text-purple-700 border border-transparent hover:border-purple-200 transition-all">
                    {t.label} <span className="text-gray-400 font-normal ml-1">{t.desc}</span>
                  </button>
                ))}
              </div>

              {/* Band table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_80px_40px] gap-2 bg-gray-50 border-b border-gray-200 px-3 py-2">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Início</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Fim</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">R$/hora</span>
                  <span />
                </div>

                {bands.map((b, idx) => (
                  <div key={b.id} className={`border-b border-gray-100 last:border-0 ${idx % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'} ${bandErrors[b.id] ? '!bg-red-50' : ''}`}>
                    <div className="grid grid-cols-[1fr_1fr_80px_40px] gap-2 items-center px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${BAND_COLORS[idx % BAND_COLORS.length]}`} />
                        <select value={b.start} onChange={e => updateBand(b.id, 'start', e.target.value)}
                          className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 w-full ${bandErrors[b.id] ? 'border-red-400' : 'border-gray-200'}`}>
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <select value={b.end} onChange={e => updateBand(b.id, 'end', e.target.value)}
                        className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 w-full ${bandErrors[b.id] ? 'border-red-400' : 'border-gray-200'}`}>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input type="number" value={b.price} min={1} step={10}
                        onChange={e => updateBand(b.id, 'price', Number(e.target.value))}
                        className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 w-full
                          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                          ${bandErrors[b.id] ? 'border-red-400' : 'border-gray-200'}`} />
                      <button onClick={() => removeBand(b.id)} disabled={bands.length === 1}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {bandErrors[b.id] && <p className="px-3 pb-2 text-xs text-red-600">{bandErrors[b.id]}</p>}
                  </div>
                ))}

                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                  <button onClick={addBand}
                    className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:text-purple-800 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Adicionar faixa
                  </button>
                </div>
              </div>

              {/* Timeline */}
              {!hasErrors && bands.some(b => b.end > b.start) && (
                <div className="mt-3">
                  <div className="flex justify-between text-[9px] text-gray-400 mb-1 px-0.5">
                    {['06h', '09h', '12h', '15h', '18h', '21h', '23h'].map(h => <span key={h}>{h}</span>)}
                  </div>
                  <div className="relative h-6 bg-gray-100 rounded-lg overflow-hidden">
                    {bands.map((b, i) => b.end > b.start && (
                      <div key={b.id}
                        className={`absolute top-0 bottom-0 flex items-center justify-center ${BAND_COLORS[i % BAND_COLORS.length]}`}
                        style={{ left: timelineLeft(b.start), width: timelineWidth(b.start, b.end) }}>
                        <span className="text-[9px] text-white font-bold truncate px-1">R${b.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            {days.length > 0 && bands.length > 0 && !hasErrors && numDays > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {fmtDate(startDate)} → {fmtDate(endDate)} · {numDays} dia{numDays !== 1 ? 's' : ''} · {days.map(d => DAY_NAMES[d].slice(0, 3)).join(', ')}
                </p>
                <div className="space-y-1">
                  {bands.map((b, i) => {
                    const s = slotCount(b.start, b.end);
                    if (!s) return null;
                    return (
                      <div key={b.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${BAND_COLORS[i % BAND_COLORS.length]}`} />
                          <span className="text-gray-600">{b.start}–{b.end}</span>
                          <span className="text-gray-400">· R${b.price}/h</span>
                        </div>
                        <span className="text-gray-500">
                          {s} slots × {numDays} dias = <strong className="text-gray-700">{s * numDays}</strong>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                  <span className="text-xs text-gray-500">Total a gerar</span>
                  <span className="text-sm font-bold text-purple-700">{totalSlots} horário{totalSlots !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

          </>)}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={!canSave}
            className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Gerando...' : canSave ? `Gerar ${totalSlots} horários` : 'Gerar horários'}
          </button>
        </div>

      </div>
    </div>
  );
}
