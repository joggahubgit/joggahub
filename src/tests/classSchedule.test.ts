import { describe, expect, it } from 'vitest';
import { generateWeeklySessions, validateClassSessions, sessionsPayload, formatSessionDate, classServiceFee } from '../app/lib/classSchedule';

describe('generateWeeklySessions', () => {
  it('terças e quintas de 01/12 a 11/12/2026', () => {
    // 01/12/2026 é terça
    const s = generateWeeklySessions('2026-12-01', '2026-12-11', [2, 4], '19:00', '20:00');
    expect(s.map(x => x.date)).toEqual(['2026-12-01', '2026-12-03', '2026-12-08', '2026-12-10']);
    expect(s[0]).toEqual({ date: '2026-12-01', start: '19:00', end: '20:00' });
  });
  it('vazio sem dias da semana', () => {
    expect(generateWeeklySessions('2026-12-01', '2026-12-11', [], '19:00', '20:00')).toEqual([]);
  });
});

describe('validateClassSessions', () => {
  const ok = generateWeeklySessions('2026-12-01', '2026-12-10', [2, 4], '19:00', '20:00');
  it('aceita curso consistente', () => {
    expect(validateClassSessions(4, '2026-12-01', '2026-12-10', ok, '2026-11-20')).toEqual([]);
  });
  it('nº de aulas diferente das datas', () => {
    expect(validateClassSessions(8, '2026-12-01', '2026-12-10', ok, '2026-11-20').join()).toContain('8 aulas, mas há 4 datas');
  });
  it('última aula fora da data de término', () => {
    const errs = validateClassSessions(4, '2026-12-01', '2026-12-11', ok, '2026-11-20');
    expect(errs).toContain('A última aula precisa ser na data de término.');
  });
  it('início no passado', () => {
    expect(validateClassSessions(4, '2026-12-01', '2026-12-10', ok, '2026-12-05')).toContain('A data de início já passou.');
  });
  it('duração e sobreposição', () => {
    const short = [{ date: '2026-12-01', start: '19:00', end: '19:15' }];
    expect(validateClassSessions(1, '2026-12-01', '2026-12-01', short, '2026-11-20').join()).toContain('30 minutos');
    const overlap = [
      { date: '2026-12-01', start: '19:00', end: '20:00' },
      { date: '2026-12-01', start: '19:30', end: '20:30' },
    ];
    expect(validateClassSessions(2, '2026-12-01', '2026-12-01', overlap, '2026-11-20').join()).toContain('mesmo horário');
  });
});

describe('helpers', () => {
  it('payload ordenado', () => {
    expect(sessionsPayload([
      { date: '2026-12-03', start: '19:00', end: '20:00' },
      { date: '2026-12-01', start: '19:00', end: '20:00' },
    ])).toEqual([
      { start: '2026-12-01T19:00', end: '2026-12-01T20:00' },
      { start: '2026-12-03T19:00', end: '2026-12-03T20:00' },
    ]);
  });
  it('data e taxa', () => {
    expect(formatSessionDate('2026-12-01')).toBe('ter, 01/12');
    expect(classServiceFee(400)).toBe(34.5);
  });
});
