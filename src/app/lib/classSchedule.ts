// Datas das aulas de um curso (compartilhado entre web e app).
// Datas "YYYY-MM-DD" e horas "HH:MM" na hora local do clube (wall clock),
// mesma convenção das tabelas. O servidor (create_class) valida de novo.

export interface ClassSession {
  date: string;  // YYYY-MM-DD
  start: string; // HH:MM
  end: string;   // HH:MM
}

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const CLASS_LEVELS: { value: string; label: string }[] = [
  { value: 'todos', label: 'Todos os níveis' },
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado', label: 'Avançado' },
];

export const classLevelLabel = (v: string) => CLASS_LEVELS.find(l => l.value === v)?.label ?? v;

/** Inscrição fecha 2h antes da primeira aula. */
export const CLASS_ENROLL_CUTOFF_HOURS = 2;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function parseDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fmtDate(d: Date) {
  return d.toISOString().substring(0, 10);
}

/** Todas as datas entre início e término que caem nos dias da semana escolhidos (0 = domingo). */
export function generateWeeklySessions(
  startDate: string, endDate: string, weekdays: number[], start: string, end: string,
): ClassSession[] {
  if (!startDate || !endDate || !weekdays.length) return [];
  const out: ClassSession[] = [];
  const last = parseDate(endDate);
  for (let d = parseDate(startDate); d <= last && out.length <= 200; d.setUTCDate(d.getUTCDate() + 1)) {
    if (weekdays.includes(d.getUTCDay())) out.push({ date: fmtDate(d), start, end });
  }
  return out;
}

export const sortSessions = (s: ClassSession[]) =>
  [...s].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

/**
 * Mesmas regras do create_class no banco, para avisar antes de salvar.
 * `today` = data de hoje (YYYY-MM-DD) na hora local; aulas de hoje são aceitas
 * aqui e o servidor confere o horário exato.
 */
export function validateClassSessions(
  lessonCount: number, startDate: string, endDate: string, sessions: ClassSession[], today: string,
): string[] {
  const errors: string[] = [];
  if (!startDate || !endDate) return ['Informe a data de início e a de término.'];
  if (endDate < startDate) return ['A data de término deve ser depois da de início.'];
  if (!lessonCount || lessonCount < 1) errors.push('Informe quantas aulas o curso tem.');
  if (startDate < today) errors.push('A data de início já passou.');

  const sorted = sortSessions(sessions);
  if (sorted.length !== lessonCount) {
    errors.push(`O curso tem ${lessonCount || 0} aulas, mas há ${sorted.length} datas. Ajuste o número de aulas ou as datas.`);
  }
  if (sorted.length) {
    if (sorted[0].date !== startDate) errors.push('A primeira aula precisa ser na data de início.');
    if (sorted[sorted.length - 1].date !== endDate) errors.push('A última aula precisa ser na data de término.');
  }
  for (const s of sorted) {
    if (!s.start || !s.end) { errors.push('Toda aula precisa de horário de início e fim.'); break; }
    const dur = toMin(s.end) - toMin(s.start);
    if (dur < 30 || dur > 240) { errors.push('Cada aula deve durar entre 30 minutos e 4 horas.'); break; }
  }
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (a.date === b.date && toMin(b.start) < toMin(a.end)) {
      errors.push(`Duas aulas no mesmo horário em ${formatSessionDate(a.date)}.`);
      break;
    }
  }
  return errors;
}

/** "ter, 02/12" */
export function formatSessionDate(date: string) {
  const d = parseDate(date);
  const [, m, day] = date.split('-');
  return `${WEEKDAY_LABELS[d.getUTCDay()].toLowerCase()}, ${day}/${m}`;
}

/** Payload do create_class: [{start:"YYYY-MM-DDTHH:MM", end:"..."}] */
export const sessionsPayload = (s: ClassSession[]) =>
  sortSessions(s).map(x => ({ start: `${x.date}T${x.start}`, end: `${x.date}T${x.end}` }));

/** Taxa de serviço: mesma das reservas (8% + R$ 2,50). Espelha serviceFeeFor do servidor. */
export const classServiceFee = (price: number) => Math.round((price * 0.08 + 2.5) * 100) / 100;

export const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
