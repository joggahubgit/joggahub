import { useEffect, useMemo, useState } from 'react';
import { X, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import {
  CLASS_LEVELS, WEEKDAY_LABELS, classServiceFee, formatBRL, formatSessionDate,
  sessionsPayload, sortSessions, validateClassSessions, type ClassSession,
} from '@/app/lib/classSchedule';
import { localDateStr } from './ScheduleGrid';

interface Props {
  venueId: string;
  onClose: () => void;
  onCreated: (classId: string) => void;
}

interface Court { id: string; name: string; sport_type: string }

// Horários de 30 em 30 min (mesma grade dos slots).
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const input = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400';
const label = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block';

const fmtShort = (d: string) => `${d.substring(8, 10)}/${d.substring(5, 7)}`;

function TimeSelect({ value, onChange, small }: { value: string; onChange: (v: string) => void; small?: boolean }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={small ? 'border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400' : input}>
      {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

/** Calendário do mês: clicar marca/desmarca a data. Dias passados ficam bloqueados. */
function MonthPicker({ selected, onToggle, today }: { selected: Set<string>; onToggle: (date: string) => void; today: string }) {
  const [month, setMonth] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${month.y}-${String(month.m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ];
  const isCurrentMonth = `${month.y}-${String(month.m + 1).padStart(2, '0')}` === today.substring(0, 7);
  const shift = (n: number) => setMonth(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <div className="border border-gray-200 rounded-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => shift(-1)} disabled={isCurrentMonth} aria-label="Mês anterior"
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <p className="text-sm font-bold text-gray-900 capitalize">{MONTHS[month.m]} {month.y}</p>
        <button onClick={() => shift(1)} aria-label="Próximo mês" className="p-1.5 rounded-lg hover:bg-gray-100">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map(d => <span key={d} className="text-[11px] font-semibold text-gray-400 py-1">{d}</span>)}
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} />;
          const past = date < today;
          const on = selected.has(date);
          return (
            <button key={date} onClick={() => onToggle(date)} disabled={past}
              className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
                on ? 'bg-purple-600 text-white shadow-sm'
                  : past ? 'text-gray-300 cursor-not-allowed'
                    : date === today ? 'text-purple-700 ring-1 ring-purple-300 hover:bg-purple-50'
                      : 'text-gray-700 hover:bg-purple-50'
              }`}>
              {Number(date.substring(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CreateClassModal({ venueId, onClose, onCreated }: Props) {
  const today = localDateStr(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtId, setCourtId] = useState('');
  const [title, setTitle] = useState('');
  const [coach, setCoach] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('todos');
  const [capacity, setCapacity] = useState('4');
  const [price, setPrice] = useState('');
  const [start, setStart] = useState('19:00');
  const [end, setEnd] = useState('20:00');
  const [picked, setPicked] = useState<ClassSession[]>([]);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    supabase.from('courts').select('id, name, sport_type').eq('venue_id', venueId).neq('is_active', false).order('name')
      .then(({ data }) => {
        setCourts(data ?? []);
        if (data?.length) setCourtId(data[0].id);
      });
  }, [venueId]);

  // As datas escolhidas definem tudo: nº de aulas, início e término.
  const sessions = useMemo(() => sortSessions(picked), [picked]);
  const selectedDates = useMemo(() => new Set(picked.map(s => s.date)), [picked]);
  const startDate = sessions[0]?.date ?? '';
  const endDate = sessions[sessions.length - 1]?.date ?? '';

  const priceNum = Number(price.replace(',', '.'));
  const capNum = Number(capacity);

  const fieldErrors: string[] = [];
  if (title.trim().length < 3) fieldErrors.push('Dê um nome ao curso (mín. 3 letras).');
  if (coach.trim().length < 2) fieldErrors.push('Informe o nome do professor.');
  if (!courtId) fieldErrors.push('Escolha a quadra.');
  if (!(capNum >= 1 && capNum <= 50)) fieldErrors.push('Vagas: de 1 a 50.');
  if (!(priceNum > 0)) fieldErrors.push('Informe o preço do curso.');
  const scheduleErrors = sessions.length
    ? validateClassSessions(sessions.length, startDate, endDate, sessions, today)
    : ['Escolha no calendário os dias das aulas.'];
  const errors = [...fieldErrors, ...scheduleErrors];

  function toggleDate(date: string) {
    setPicked(prev => (prev.some(s => s.date === date)
      ? prev.filter(s => s.date !== date)
      : [...prev, { date, start, end }]));
  }

  // Mudar o horário geral muda o de todas as aulas já marcadas.
  function setAllTimes(patch: { start?: string; end?: string }) {
    if (patch.start) setStart(patch.start);
    if (patch.end) setEnd(patch.end);
    setPicked(prev => prev.map(s => ({ ...s, ...patch })));
  }

  function updateSession(date: string, patch: Partial<ClassSession>) {
    setPicked(prev => prev.map(s => (s.date === date ? { ...s, ...patch } : s)));
  }

  async function save() {
    setTouched(true);
    setServerError('');
    if (errors.length) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('create_class', {
      p_court_id: courtId,
      p_title: title.trim(),
      p_coach_name: coach.trim(),
      p_description: description.trim() || null,
      p_level: level,
      p_capacity: capNum,
      p_price: priceNum,
      p_lesson_count: sessions.length,
      p_start_date: startDate,
      p_end_date: endDate,
      p_schedule_mode: 'custom',
      p_sessions: sessionsPayload(sessions),
    });
    setSaving(false);
    if (error) { setServerError(error.message); return; }
    onCreated(data as string);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Novo curso</h2>
            <p className="text-xs text-gray-400 mt-0.5">Os horários das aulas ficam bloqueados na agenda da quadra</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Sobre o curso */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={label}>Nome do curso</label>
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80}
                placeholder="Ex.: Futevôlei para iniciantes" className={input} />
            </div>
            <div>
              <label className={label}>Professor</label>
              <input value={coach} onChange={e => setCoach(e.target.value)} maxLength={80} placeholder="Nome do professor" className={input} />
            </div>
            <div>
              <label className={label}>Nível</label>
              <select value={level} onChange={e => setLevel(e.target.value)} className={input}>
                {CLASS_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Descrição (opcional)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={2}
                placeholder="O que o aluno vai aprender, o que levar…" className={`${input} resize-none`} />
            </div>
          </div>

          {/* Quadra, vagas, preço */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={label}>Quadra</label>
              <select value={courtId} onChange={e => setCourtId(e.target.value)} className={input}>
                {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Vagas</label>
              <input type="number" min={1} max={50} value={capacity} onChange={e => setCapacity(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Preço do curso (R$)</label>
              <input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="Ex.: 400" className={input} />
            </div>
          </div>
          {priceNum > 0 && (
            <p className="text-xs text-gray-500 -mt-3">
              O aluno paga {formatBRL(priceNum + classServiceFee(priceNum))} no app ({formatBRL(priceNum)} do curso + {formatBRL(classServiceFee(priceNum))} de taxa de serviço).
            </p>
          )}

          {/* Datas: calendário + horário */}
          <div>
            <label className={label}>Dias das aulas</label>
            <p className="text-xs text-gray-500 -mt-0.5 mb-2">Clique nos dias do calendário. Clique de novo para desmarcar.</p>
            <div className="grid sm:grid-cols-[1fr_200px] gap-4">
              <MonthPicker selected={selectedDates} onToggle={toggleDate} today={today} />
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Começa</p>
                  <TimeSelect value={start} onChange={v => setAllTimes({ start: v })} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Termina</p>
                  <TimeSelect value={end} onChange={v => setAllTimes({ end: v })} />
                </div>
                <p className="text-[11px] text-gray-400">Vale para todas as aulas. Para mudar só uma, use a lista abaixo.</p>
              </div>
            </div>
          </div>

          {/* Resumo + lista das aulas */}
          {sessions.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">
                {sessions.length} {sessions.length === 1 ? 'aula' : 'aulas'}
                <span className="font-normal text-gray-500">
                  {sessions.length === 1 ? ` · ${fmtShort(startDate)}` : ` · de ${fmtShort(startDate)} a ${fmtShort(endDate)}`}
                </span>
              </p>
              <div className="space-y-1.5">
                {sessions.map((s, i) => (
                  <div key={s.date} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-400 w-12">Aula {i + 1}</span>
                    <span className="flex-1 text-sm font-medium text-gray-900 capitalize">{formatSessionDate(s.date)}</span>
                    <TimeSelect small value={s.start} onChange={v => updateSession(s.date, { start: v })} />
                    <span className="text-gray-400 text-xs">até</span>
                    <TimeSelect small value={s.end} onChange={v => updateSession(s.date, { end: v })} />
                    <button onClick={() => toggleDate(s.date)} className="p-1 text-gray-400 hover:text-red-500" aria-label="Remover aula">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {touched && errors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              {errors.map(e => (
                <p key={e} className="flex items-start gap-1.5 text-xs text-amber-800"><AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{e}</p>
              ))}
            </div>
          )}
          {serverError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{serverError}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={save} disabled={saving || (touched && errors.length > 0)}
            className="flex-[2] py-3 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Criando…' : sessions.length ? `Criar curso com ${sessions.length} ${sessions.length === 1 ? 'aula' : 'aulas'}` : 'Criar curso e bloquear agenda'}
          </button>
        </div>
      </div>
    </div>
  );
}
