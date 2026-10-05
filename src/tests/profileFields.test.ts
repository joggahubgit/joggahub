import { describe, it, expect } from 'vitest';
import { profileCompleteness, FOOT_OPTIONS } from '../app/lib/profileFields';

const full = {
  name: 'Aron', avatar_url: 'https://x/a.png', location: 'São Paulo, SP',
  preferred_position: 'right', dominant_foot: 'left',
  availability: { days: ['mon'], periods: ['evening'] },
};

describe('profileCompleteness', () => {
  it('is complete when every required field is filled (bio optional)', () => {
    const c = profileCompleteness(full);
    expect(c.complete).toBe(true);
    expect(c.pct).toBe(100);
  });

  it('lists what is missing, grouped by section', () => {
    const c = profileCompleteness({ ...full, avatar_url: null, availability: { days: ['mon'], periods: [] } });
    expect(c.complete).toBe(false);
    expect(c.missing.map(m => m.key)).toEqual(['avatar', 'availability']);
    expect(c.missing.map(m => m.section)).toEqual(['identidade', 'disponibilidade']);
    expect(c.pct).toBe(67);
  });

  it('handles a fresh profile', () => {
    const c = profileCompleteness({ name: 'AronTeste', avatar_url: null, location: null, preferred_position: null, dominant_foot: null, availability: null });
    expect(c.done).toBe(1);
    expect(c.missing).toHaveLength(5);
  });
});

describe('FOOT_OPTIONS', () => {
  it('only uses values allowed by profiles_dominant_foot_check', () => {
    expect(FOOT_OPTIONS.map(f => f.value).sort()).toEqual(['both', 'left', 'right']);
  });
});
