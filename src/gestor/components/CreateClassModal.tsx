import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, CheckCircle, AlertCircle, CalendarDays, Repeat } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import {
  CLASS_LEVELS, WEEKDAY_LABELS, classServiceFee, formatBRL, formatSessionDate,
  generateWeeklySessions, sessionsPayload, sortSessions, validateClassSessions, type ClassSession,
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

const input = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400';
const label = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block';

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={input}>
      {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
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
  const [lessonCount, setLessonCount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mode, setMode] = useState<'weekly' | 'custom'>('weekly');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [wStart, setWStart] = useState('19:00');
  const [wEnd, setWEnd] = useState('20:00');
  const [custom, setCustom] = useState<ClassSession[]>([]);
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

  const sessions = useMemo(
    () => (mode === 'weekly' ? generateWeeklySessions(startDate, endDate, weekdays, wStart, wEnd) : sortSessions(custom)),
    [mode, startDate, endDate, weekdays, wStart, wEnd, custom],
  );

  const count = Number(lessonCount);
  const priceNum = Number(price.replace(',', '.'));
  const capNum = Number(capacity);

  const fieldErrors: string[] = [];
  if (title.trim().length < 3) fieldErrors.push('Dê um nome ao curso (mín. 3 letras).');
  if (coach.trim().length < 2) fieldErrors.push('Informe o nome do professor.');
  if (!courtId) fieldErrors.push('Escolha a quadra.');
  if (!(capNum >= 1 && capNum <= 50)) fieldErrors.push('Vagas: de 1 a 50.');
  if (!(priceNum > 0)) fieldErrors.push('Informe o preço do curso.');
  const scheduleErrors = validateClassSessions(count, startDate, endDate, sessions, today);
  const errors = [...fieldErrors, ...scheduleErrors];

  function toggleDay(d: number) {
    setWeekdays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));
  }

  function addCustom() {
    const last = custom[custom.length - 1];
    setCustom([...custom, { date: last?.date ?? startDate ?? '', start: last?.start ?? '19:00', end: last?.end ?? '20:00' }]);
  }

  function updateCustom(i: number, patch: Partial<ClassSession>) {
    setCustom(custom.map((s, j) => (j === i ? { ...s, ...patch } : s)));
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
      p_lesson_count: count,
      p_start_date: startDate,
      p_end_date: endDate,
      p_schedule_mode: mode,
      p_sessions: sessionsPayload(sessions),
    });
    setSaving(false);
    if (error) { setServerError(error.message); return; }
    onCreated(data as string);
  }

  const showErrors = touched || sessions.length > 0;

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

          {/* Período */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={label}>Nº de aulas</label>
              <input type="number" min={1} max={100} value={lessonCount} onChange={e => setLessonCount(e.target.value)}
                placeholder="Ex.: 8" className={input} />
            </div>
            <div>
              <label className={label}>Data de início</label>
              <input type="date" value={startDate} min={today}
                onChange={e => { setStartDate(e.target.value); if (endDate && e.target.value > endDate) setEndDate(e.target.value); }}
                className={input} />
            </div>
            <div>
              <label className={label}>Data de término</label>
              <input type="date" value={endDate} min={startDate || today} onChange={e => setEndDate(e.target.value)} className={input} />
            </div>
          </div>

          {/* Modo das datas */}
          <div>
            <label className={label}>Datas das aulas</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'weekly', icon: Repeat, t: 'Dias fixos na semana', d: 'Ex.: terças e quintas às 19h' },
                { v: 'custom', icon: CalendarDays, t: 'Escolher cada data', d: 'Marque aula por aula' },
              ] as const).map(o => (
                <button key={o.v} onClick={() => setMode(o.v)}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${mode === o.v ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><o.icon className="w-4 h-4 text-purple-600" />{o.t}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{o.d}</span>
                </button>
              ))}
            </div>
          </div>

          {mode === 'weekly' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((name, i) => (
                  <button key={i} onClick={() => toggleDay(i)}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${weekdays.includes(i) ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[11px] text-gray-400 mb-1">Começa</p><TimeSelect value={wStart} onChange={setWStart} /></div>
                <div><p className="text-[11px] text-gray-400 mb-1">Termina</p><TimeSelect value={wEnd} onChange={setWEnd} /></div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {custom.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="date" value={s.date} min={today} onChange={e => updateCustom(i, { date: e.target.value })} className={`${input} flex-[1.4]`} />
                  <div className="flex-1"><TimeSelect value={s.start} onChange={v => updateCustom(i, { start: v })} /></div>
                  <div className="flex-1"><TimeSelect value={s.end} onChange={v => updateCustom(i, { end: v })} /></div>
                  <button onClick={() => setCustom(custom.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-500" aria-label="Remover aula">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button onClick={addCustom} className="flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:underline">
                <Plus className="w-4 h-4" /> Adicionar aula
              </button>
            </div>
          )}

          {/* Prévia */}
          {sessions.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">
                {sessions.length} {sessions.length === 1 ? 'aula' : 'aulas'}
                {count > 0 && sessions.length !== count && <span className="text-red-600 font-normal"> (você informou {count})</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sessions.map((s, i) => (
                  <span key={i} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-700 tabular-nums">
                    {formatSessionDate(s.date)} · {s.start}–{s.end}
                  </span>
                ))}
              </div>
            </div>
          )}

          {showErrors && errors.length > 0 && (
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
            {saving ? 'Criando…' : 'Criar curso e bloquear agenda'}
          </button>
        </div>
      </div>
    </div>
  );
}
