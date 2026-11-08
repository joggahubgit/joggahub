import { describe, expect, it } from 'vitest';
import { generateWeeklySessions, validateClassSessions, sessionsPayload, formatSessionDate, classServiceFee, classPaymentPlan, wallDateTimeLabel } from '../app/lib/classSchedule';

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

describe('classPaymentPlan (curso/day use igual às partidas)', () => {
  const now = Date.parse('2026-11-08T10:00:00Z'); // "agora" em wall clock
  it('mostra datas exatas: cobrança 2h antes e desistência até 24h antes', () => {
    const p = classPaymentPlan('2026-11-13T19:00:00+00:00', now);
    expect(p.hold).toBe(true);
    expect(p.chargeAt).toBe('sex, 13/11 às 17:00');
    expect(p.leaveUntil).toBe('qui, 12/11 às 19:00');
  });
  it('vira o dia corretamente', () => {
    expect(wallDateTimeLabel('2026-11-10T01:00:00', 2)).toBe('seg, 09/11 às 23:00');
  });
  it('com mais de 6 dias cobra na hora', () => {
    expect(classPaymentPlan('2026-11-14T10:00:00Z', now).hold).toBe(true);  // exatamente 6 dias
    expect(classPaymentPlan('2026-11-14T10:01:00Z', now).hold).toBe(false);
  });
});
