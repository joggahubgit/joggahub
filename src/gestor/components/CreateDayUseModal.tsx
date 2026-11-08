// Gestor cria um day use: quadra aberta para jogo livre, preço fixo por pessoa,
// até 12 jogadores. O gestor não conta como jogador. Não entra no ranking.
import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Sun } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { classServiceFee, formatBRL, formatSessionDate } from '@/app/lib/classSchedule';
import { localDateStr } from './ScheduleGrid';

interface Props {
  venueId: string;
  initialCourtId?: string;
  initialDate?: string;   // YYYY-MM-DD
  initialStart?: string;  // HH:MM
  onClose: () => void;
  onCreated: (classId: string) => void;
}

interface Court { id: string; name: string }

export const DAY_USE_MAX_PLAYERS = 12;

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const input = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400';
const label = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block';
const toMin = (t: string) => Number(t.substring(0, 2)) * 60 + Number(t.substring(3, 5));

export function CreateDayUseModal({ venueId, initialCourtId, initialDate, initialStart, onClose, onCreated }: Props) {
  const today = localDateStr(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtId, setCourtId] = useState('');
  const [title, setTitle] = useState('Day use');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initialDate ?? '');
  const [start, setStart] = useState(initialStart ?? '08:00');
  const [end, setEnd] = useState(() => {
    if (!initialStart) return '12:00';
    const m = Math.min(toMin(initialStart) + 180, 23 * 60 + 30);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`;
  });
  const [capacity, setCapacity] = useState(String(DAY_USE_MAX_PLAYERS));
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    supabase.from('courts').select('id, name').eq('venue_id', venueId).neq('is_active', false).order('name')
      .then(({ data }) => {
        setCourts(data ?? []);
        if (data?.length) setCourtId(initialCourtId && data.some(c => c.id === initialCourtId) ? initialCourtId : data[0].id);
      });
  }, [venueId]);

  const priceNum = Number(price.replace(',', '.'));
  const capNum = Number(capacity);
  const dur = toMin(end) - toMin(start);

  const errors: string[] = [];
  if (title.trim().length < 3) errors.push('Dê um nome ao day use (mín. 3 letras).');
  if (!courtId) errors.push('Escolha a quadra.');
  if (!date) errors.push('Escolha a data.');
  else if (date < today) errors.push('A data já passou.');
  if (dur < 30) errors.push('O horário de término precisa ser pelo menos 30 min depois do início.');
  if (dur > 12 * 60) errors.push('O day use pode durar no máximo 12 horas.');
  if (!(capNum >= 1 && capNum <= DAY_USE_MAX_PLAYERS)) errors.push(`Vagas: de 1 a ${DAY_USE_MAX_PLAYERS} jogadores.`);
  if (!(priceNum > 0)) errors.push('Informe o preço por pessoa.');

  async function save() {
    setTouched(true);
    setServerError('');
    if (errors.length) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('create_day_use', {
      p_court_id: courtId,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_capacity: capNum,
      p_price: priceNum,
      p_start: `${date}T${start}`,
      p_end: `${date}T${end}`,
    });
    setSaving(false);
    if (error) { setServerError(error.message); return; }
    onCreated(data as string);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Sun className="w-5 h-5 text-sky-500" />Partida aberta · Day use</h2>
            <p className="text-xs text-gray-400 mt-0.5">Quadra aberta para jogo livre. Cada jogador paga pelo app.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className={label}>Nome</label>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Ex.: Day use de sábado" className={input} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Quadra</label>
              <select value={courtId} onChange={e => setCourtId(e.target.value)} className={input}>
                {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Data</label>
              <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} className={input} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Começa</label>
              <select value={start} onChange={e => setStart(e.target.value)} className={input}>
                {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Termina</label>
              <select value={end} onChange={e => setEnd(e.target.value)} className={input}>
                {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Vagas (até {DAY_USE_MAX_PLAYERS})</label>
              <input type="number" min={1} max={DAY_USE_MAX_PLAYERS} value={capacity} onChange={e => setCapacity(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Preço por pessoa (R$)</label>
              <input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="Ex.: 40" className={input} />
            </div>
          </div>
          {priceNum > 0 && (
            <p className="text-xs text-gray-500 -mt-2">
              Cada jogador paga {formatBRL(priceNum + classServiceFee(priceNum))} no app ({formatBRL(priceNum)} + {formatBRL(classServiceFee(priceNum))} de taxa de serviço).
            </p>
          )}

          <div>
            <label className={label}>Descrição (opcional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={2}
              placeholder="Ex.: rodízio de duplas, traga sua bola…" className={`${input} resize-none`} />
          </div>

          {date && dur >= 30 && (
            <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-sm text-sky-900">
              <b className="capitalize">{formatSessionDate(date)}</b> · {start}–{end} · até {capNum || 0} jogadores. O horário fica bloqueado na agenda.
            </div>
          )}

          {touched && errors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              {errors.map(e => <p key={e} className="flex items-start gap-1.5 text-xs text-amber-800"><AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{e}</p>)}
            </div>
          )}
          {serverError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{serverError}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={save} disabled={saving || (touched && errors.length > 0)}
            className="flex-[2] py-3 rounded-xl bg-sky-600 text-white font-bold text-sm hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" />{saving ? 'Criando…' : 'Criar day use e bloquear agenda'}
          </button>
        </div>
      </div>
    </div>
  );
}
