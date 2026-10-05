import { describe, it, expect } from 'vitest';
import { buildBlocks, columnStats, type GridSlot } from '../gestor/components/ScheduleGrid';

const DAY = '2026-10-07';

function slot(start: string, end: string, extra: Partial<GridSlot> = {}): GridSlot {
  return { id: `s-${start}`, court_id: 'c1', start_time: `${DAY}T${start}:00+00:00`, end_time: `${DAY}T${end}:00+00:00`, is_available: true, ...extra };
}

// 08:00–22:00 in 30-min slots, with a 1h booking at 12:00 (12:30 locked as consecutive slot)
function dayWithBooking(): GridSlot[] {
  const slots: GridSlot[] = [];
  for (let m = 8 * 60; m < 22 * 60; m += 30) {
    const hh = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    slots.push(slot(hh(m), hh(m + 30)));
  }
  const at = (t: string) => slots.find(s => s.start_time.includes(`T${t}`))!;
  Object.assign(at('12:00'), {
    is_available: false,
    booking: { id: 'b1', payment_status: 'paid', total_price: 182.5, court_price: 166.67, scheduled_end_at: `${DAY}T13:00:00+00:00`, profiles: { name: 'Aron Souto', phone: '' } },
  });
  at('12:30').is_available = false;
  return slots;
}

describe('buildBlocks', () => {
  it('draws a booking as one block over its real duration and absorbs the locked slot', () => {
    const blocks = buildBlocks(dayWithBooking());
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'booking', start: 12 * 60, end: 13 * 60 });
  });

  it('merges consecutive blocked slots that are not part of a booking', () => {
    const blocks = buildBlocks([
      slot('15:00', '15:30', { is_available: false }),
      slot('15:30', '16:00', { is_available: false }),
      slot('16:00', '16:30'),
    ]);
    expect(blocks).toEqual([expect.objectContaining({ kind: 'blocked', start: 15 * 60, end: 16 * 60 })]);
  });
});

describe('columnStats', () => {
  it('uses the created slots as capacity when the court has no opening hours', () => {
    const slots = dayWithBooking();
    const stats = columnStats({ slots }, buildBlocks(slots), null);
    expect(stats.capacity).toBe(14 * 60);  // 28 slots of 30 min, booking slot not double counted
    expect(stats.busyMin).toBe(60);
    expect(stats.pct).toBe(7);
    expect(stats.closeLabel).toBe('22:00');
  });

  it('uses opening hours when configured', () => {
    const slots = dayWithBooking();
    const stats = columnStats({ slots, schedule: { open_time: '08:00:00', close_time: '22:00:00' } }, buildBlocks(slots), null);
    expect(stats.capacity).toBe(14 * 60);
    expect(stats.pct).toBe(7);
  });

  it('knows whether the court is free right now', () => {
    const slots = dayWithBooking();
    const blocks = buildBlocks(slots);
    expect(columnStats({ slots }, blocks, 12 * 60 + 15).freeNow).toBe(false);
    expect(columnStats({ slots }, blocks, 14 * 60).freeNow).toBe(true);
    expect(columnStats({ slots }, blocks, 23 * 60).freeNow).toBe(false); // after closing
  });
});
