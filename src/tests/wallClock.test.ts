import { describe, it, expect } from 'vitest';
import { wallDate, wallTime } from '../app/lib/wallClock';

describe('wallClock', () => {
  it('shows the stored time, whatever the viewer timezone', () => {
    expect(wallTime('2026-10-07T12:00:00+00:00')).toBe('12:00');
    expect(wallTime('2026-10-07T22:30:00+00:00')).toBe('22:30');
  });
  it('keeps the stored date even late at night', () => {
    expect(wallDate('2026-10-07T23:30:00+00:00')).toBe(wallDate('2026-10-07T08:00:00+00:00'));
    expect(wallDate('2026-10-07T23:30:00+00:00', { day: '2-digit', month: '2-digit' })).toBe('07/10');
  });
});
