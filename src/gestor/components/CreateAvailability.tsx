import { useState, useEffect } from 'react';
import { X, Check, Loader2, ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface CreateAvailabilityProps {
  onClose: () => void;
  onSaved?: () => void;
  venueId: string | null;
  prefill?: { courtId?: string; date?: string; startTime?: string };
}

const WEEK_DAYS = [
  { id: 'seg', label: 'Seg', js: 1 },
  { id: 'ter', label: 'Ter', js: 2 },
  { id: 'qua', label: 'Qua', js: 3 },
  { id: 'qui', label: 'Qui', js: 4 },
  { id: 'sex', label: 'Sex', js: 5 },
  { id: 'sab', label: 'Sáb', js: 6 },
  { id: 'dom', label: 'Dom', js: 0 },
];

const HOURS = [
  '06:00','07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00',
  '19:00','20:00','21:00','22:00','23:00',
];

function isoToday() {
  return new Date().toISOString().split('T')[0];
}

function addMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function slotsInRange(start: string, end: string, duration: number): string[] {
  const starts: string[] = [];
  let cur = start;
  while (true) {
    const next = addMinutes(cur, duration);
    if (next > end) break;
    starts.push(cur);
    cur = next;
  }
  return starts;
}

function getDatesForDays(from: string, weeks: number, dayIds: string[]): string[] {
  const dates: string[] = [];
  const now = new Date();
  const start = new Date(from + 'T00:00:00');
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const id = WEEK_DAYS.find(w => w.js === d.getDay())?.id;
    if (id && dayIds.includes(id)) dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function CreateAvailability({ onClose, onSaved, venueId, prefill }: CreateAvailabilityProps) {
  const [mode, setMode] = useState<'pick' | 'block' | 'single'>('pick');
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);

  // shared
  const [courtId, setCourtId] = useState(prefill?.courtId ?? '');
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // block mode
  const [days, setDays] = useState<string[]>(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
  const [timeStart, setTimeStart] = useState('08:00');
  const [timeEnd, setTimeEnd] = useState('22:00');
  const [startDate, setStartDate] = useState(isoToday());
  const [weeks, setWeeks] = useState(4);

  // single mode
  const [singleDate, setSingleDate] = useState(prefill?.date ?? isoToday());
  const [singleStart, setSingleStart] = useState(prefill?.startTime ?? '08:00');

  useEffect(() => {
    if (!venueId) return;
    supabase.from('courts').select('id, name').eq('venue_id', venueId).neq('is_active', false).then(({ data }) => {
      if (data?.length) {
        setCourts(data);
        if (!courtId) setCourtId(prefill?.courtId ?? data[0].id);
      }
    });
  }, [venueId]);

  const toggleDay = (id: string) =>
    setDays(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  // preview counts
  const blockSlotCount = (() => {
    if (!days.length) return 0;
    const perDay = slotsInRange(timeStart, timeEnd, duration).length;
    return perDay * getDatesForDays(startDate, weeks, days).length;
  })();

  async function saveBlock() {
    if (!courtId) { setError('Selecione uma quadra.'); return; }
    if (!days.length) { setError('Selecione pelo menos um dia.'); return; }
    if (timeStart >= timeEnd) { setError('Horário de início deve ser antes do fim.'); return; }

    setSaving(true);
    setError('');
    const now = new Date();
    const dates = getDatesForDays(startDate, weeks, days);
    const rows: object[] = [];

    for (const date of dates) {
      for (const start of slotsInRange(timeStart, timeEnd, duration)) {
        const startDT = new Date(`${date}T${start}:00`);
        if (startDT <= now) continue;
        rows.push({
          court_id: courtId,
          start_time: `${date}T${start}:00`,
          end_time: `${date}T${addMinutes(start, duration)}:00`,
          price_override: price ? parseFloat(price) : null,
          is_available: true,
        });
      }
    }

    if (!rows.length) { setError('Nenhum slot futuro para criar com esses parâmetros.'); setSaving(false); return; }

    // remove existing non-protected slots; collect protected time ranges to skip
    const uniqueDates = [...new Set(dates)];
    const protectedRanges: { start: string; end: string }[] = [];

    for (const date of uniqueDates) {
      const { data: existing } = await supabase.from('slots').select('id, start_time, end_time')
        .eq('court_id', courtId)
        .gte('start_time', `${date}T00:00:00`)
        .lte('start_time', `${date}T23:59:59`);
      const slots = existing ?? [];
      if (!slots.length) continue;
      const ids = slots.map(s => s.id);
      const { data: booked } = await supabase.from('bookings').select('slot_id').in('slot_id', ids).neq('status', 'cancelled');
      const { data: games } = await supabase.from('games').select('slot_id').in('slot_id', ids);
      const protectedIds = new Set([...(booked ?? []).map(b => b.slot_id), ...(games ?? []).map(g => g.slot_id)]);
      const toDelete = ids.filter(id => !protectedIds.has(id));
      if (toDelete.length) await supabase.from('slots').delete().in('id', toDelete);
      // track protected ranges so we don't insert overlapping slots
      slots.filter(s => protectedIds.has(s.id)).forEach(s => protectedRanges.push({ start: s.start_time, end: s.end_time }));
    }

    // filter out rows that overlap with protected slots
    const filteredRows = rows.filter((r: any) => {
      return !protectedRanges.some(p => r.start_time < p.end && r.end_time > p.start);
    });

    if (!filteredRows.length) { setError('Nenhum slot disponível para criar — todos os horários estão ocupados por reservas ou partidas ativas.'); setSaving(false); return; }

    for (let i = 0; i < filteredRows.length; i += 50) {
      const { error: err } = await supabase.from('slots').insert(filteredRows.slice(i, i + 50));
      if (err) { setError(err.message); setSaving(false); return; }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => { onSaved ? onSaved() : onClose(); }, 1000);
  }

  async function saveSingle() {
    if (!courtId || !singleDate || !singleStart) { setError('Preencha todos os campos.'); return; }
    const startISO = `${singleDate}T${singleStart}:00`;
    if (new Date(startISO) <= new Date()) { setError('Não é possível criar um horário no passado.'); return; }

    setSaving(true);
    setError('');
    const endISO = `${singleDate}T${addMinutes(singleStart, duration)}:00`;

    // Check for overlap with any existing slot on this day (never delete existing slots in single mode)
    const { data: existing } = await supabase.from('slots').select('id, start_time, end_time')
      .eq('court_id', courtId)
      .gte('start_time', `${singleDate}T00:00:00`)
      .lte('start_time', `${singleDate}T23:59:59`);
    const existingSlots = existing ?? [];
    const overlaps = existingSlots.some(s => startISO < s.end_time && endISO > s.start_time);
    if (overlaps) { setError('Já existe um slot nesse horário. Escolha outro horário ou remova o existente primeiro.'); setSaving(false); return; }

    const { error: err } = await supabase.from('slots').insert({
      court_id: courtId,
      start_time: startISO,
      end_time: endISO,
      price_override: price ? parseFloat(price) : null,
      is_available: true,
    });

    setSaving(false);
    if (err) {
      setError(err.code === '23P01' ? 'Existe uma reserva ativa nesse horário.' : err.message);
      return;
    }
    setSaved(true);
    setTimeout(() => { onSaved ? onSaved() : onClose(); }, 1000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {mode !== 'pick' && (
              <button onClick={() => { setMode('pick'); setError(''); setSaved(false); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <h3 className="text-lg font-bold text-gray-900">
              {mode === 'pick' ? 'Criar Horários' : mode === 'block' ? 'Criar em bloco' : 'Horário avulso'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">

          {/* ── Mode picker ── */}
          {mode === 'pick' && (
            <div className="space-y-3">
              <button onClick={() => setMode('block')}
                className="w-full p-5 border-2 border-gray-200 rounded-2xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-900 text-base">Em bloco</p>
                    <p className="text-sm text-gray-500 mt-0.5">Cria vários slots de uma vez para dias e semanas</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-100 group-hover:bg-purple-600 flex items-center justify-center transition-colors flex-shrink-0">
                    <span className="text-purple-600 group-hover:text-white font-bold text-lg">▦</span>
                  </div>
                </div>
              </button>

              <button onClick={() => setMode('single')}
                className="w-full p-5 border-2 border-gray-200 rounded-2xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-900 text-base">Horário avulso</p>
                    <p className="text-sm text-gray-500 mt-0.5">Cria um único slot em data e hora específica</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-100 group-hover:bg-purple-600 flex items-center justify-center transition-colors flex-shrink-0">
                    <span className="text-purple-600 group-hover:text-white font-bold text-lg">▢</span>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* ── Shared: Court selector ── */}
          {mode !== 'pick' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Quadra</label>
              <div className="flex flex-wrap gap-2">
                {courts.map(c => (
                  <button key={c.id} onClick={() => setCourtId(c.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      courtId === c.id ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200 hover:border-purple-400'
                    }`}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Block mode ── */}
          {mode === 'block' && (
            <>
              {/* Days */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">Dias da semana</label>
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => setDays(WEEK_DAYS.map(d => d.id))} className="text-purple-600 font-semibold">Todos</button>
                    <button onClick={() => setDays([])} className="text-gray-400 font-semibold">Nenhum</button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEK_DAYS.map(d => (
                    <button key={d.id} onClick={() => toggleDay(d.id)}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                        days.includes(d.id) ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time range */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Faixa de horário</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Das</p>
                    <select value={timeStart} onChange={e => setTimeStart(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-500">
                      {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Até</p>
                    <select value={timeEnd} onChange={e => setTimeEnd(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-500">
                      {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Duração de cada slot</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{ label: '1 hora', value: 60 }, { label: '2 horas', value: 120 }].map(opt => (
                    <button key={opt.value} onClick={() => setDuration(opt.value)}
                      className={`py-3 rounded-xl font-bold text-sm border-2 transition-colors ${
                        duration === opt.value ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200 hover:border-purple-400'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start date + weeks */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">A partir de</label>
                  <input type="date" value={startDate} min={isoToday()} onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Semanas</label>
                  <input type="number" min={1} max={52} value={weeks} onChange={e => setWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-500" />
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Preço por slot (R$) <span className="font-normal text-gray-400">— opcional</span></label>
                <input type="number" min={0} step={10} placeholder="Ex: 80" value={price} onChange={e => setPrice(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-500" />
              </div>

              {/* Summary pill */}
              {blockSlotCount > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-purple-700">Slots a criar</span>
                  <span className="text-lg font-bold text-purple-700">{blockSlotCount}</span>
                </div>
              )}
            </>
          )}

          {/* ── Single mode ── */}
          {mode === 'single' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Data</label>
                <input type="date" value={singleDate} min={isoToday()} onChange={e => setSingleDate(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Hora de início</label>
                <select value={singleStart} onChange={e => setSingleStart(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-500">
                  {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Término: {addMinutes(singleStart, duration)}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Duração</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{ label: '1 hora', value: 60 }, { label: '2 horas', value: 120 }].map(opt => (
                    <button key={opt.value} onClick={() => setDuration(opt.value)}
                      className={`py-3 rounded-xl font-bold text-sm border-2 transition-colors ${
                        duration === opt.value ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200 hover:border-purple-400'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Preço (R$) <span className="font-normal text-gray-400">— opcional</span></label>
                <input type="number" min={0} step={10} placeholder="Ex: 80" value={price} onChange={e => setPrice(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-500" />
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
          )}

          {/* CTA */}
          {mode !== 'pick' && (
            <button
              onClick={mode === 'block' ? saveBlock : saveSingle}
              disabled={saving || saved}
              className="w-full py-4 rounded-2xl bg-purple-600 text-white font-bold text-base hover:bg-purple-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Criando...</>
                : saved ? <><Check className="w-5 h-5" /> Criado!</>
                : mode === 'block' ? `Criar ${blockSlotCount > 0 ? blockSlotCount + ' ' : ''}slots`
                : 'Criar horário'}
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
