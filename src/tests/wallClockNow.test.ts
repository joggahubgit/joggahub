import { describe, expect, it } from 'vitest';
import { brNow, realToWallMs, wallMs, wallNowMs } from '../app/lib/wallClock';

// Horários de partida são gravados na hora de Brasília ("20:00" fica "20:00+00").
// O "agora" precisa estar na mesma convenção, senão tudo acontece 3h antes.
describe('agora em Brasília (wall clock)', () => {
  it('converte um instante real para o relógio de Brasília (UTC−3)', () => {
    expect(realToWallMs(Date.parse('2026-11-09T12:00:00Z'))).toBe(Date.parse('2026-11-09T09:00:00Z'));
    expect(realToWallMs(Date.parse('2026-11-10T01:30:00Z'))).toBe(Date.parse('2026-11-09T22:30:00Z'));
  });

  it('lê o horário gravado sem converter fuso', () => {
    expect(wallMs('2026-11-18T20:00:00+00:00')).toBe(Date.parse('2026-11-18T20:00:00Z'));
    expect(wallMs('2026-11-18T20:00:00')).toBe(Date.parse('2026-11-18T20:00:00Z'));
  });

  it('partida às 20:00: às 17:59 de Brasília ainda faltam mais de 2h', () => {
    const start = wallMs('2026-11-18T20:00:00+00:00');
    const realNow = Date.parse('2026-11-18T20:59:00Z'); // 17:59 em Brasília
    const hoursLeft = (start - realToWallMs(realNow)) / 3600_000;
    expect(hoursLeft).toBeGreaterThan(2);
    // a conta antiga (Date.now() direto) dizia que a partida já tinha começado
    expect((start - realNow) / 3600_000).toBeLessThan(0);
  });

  it('wallNowMs fica 3h atrás do relógio UTC', () => {
    const diffH = (Date.now() - wallNowMs()) / 3600_000;
    expect(diffH).toBeGreaterThan(2.9);
    expect(diffH).toBeLessThan(3.1);
  });

  it('brNow: campos locais na hora de Brasília, em qualquer fuso do computador', () => {
    const b = brNow();
    const asWall = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate(), b.getHours(), b.getMinutes(), b.getSeconds());
    expect(Math.abs(asWall - wallNowMs())).toBeLessThan(2000);
  });
});
