import { describe, it, expect } from 'vitest';
import { isValidSetScore, setTarget, deriveOutcome } from '../app/lib/futevoleiSetRules';

describe('setTarget', () => {
  it('sets 1 and 2 go to 18', () => {
    expect(setTarget(0)).toBe(18);
    expect(setTarget(1)).toBe(18);
  });
  it('set 3 (decider) goes to 15', () => {
    expect(setTarget(2)).toBe(15);
  });
});

describe('isValidSetScore', () => {
  it('accepts a clean win at exactly the threshold with a comfortable lead', () => {
    expect(isValidSetScore(18, 10, 18)).toBe(true);
    expect(isValidSetScore(18, 16, 18)).toBe(true);
  });

  it('rejects reaching the threshold with less than a 2-point lead', () => {
    expect(isValidSetScore(18, 17, 18)).toBe(false);
    expect(isValidSetScore(18, 18, 18)).toBe(false);
  });

  it('accepts a deuce-extended finish with exactly a 2-point gap beyond the threshold', () => {
    expect(isValidSetScore(19, 17, 18)).toBe(true);
    expect(isValidSetScore(20, 18, 18)).toBe(true);
    expect(isValidSetScore(25, 23, 18)).toBe(true);
  });

  it('rejects a deuce-extended finish with a gap other than 2 (impossible — set would already have ended)', () => {
    expect(isValidSetScore(21, 18, 18)).toBe(false);
    expect(isValidSetScore(20, 17, 18)).toBe(false);
  });

  it('rejects a score below the threshold entirely', () => {
    expect(isValidSetScore(15, 10, 18)).toBe(false);
    expect(isValidSetScore(17, 15, 18)).toBe(false);
  });

  it('rejects negative or non-integer scores', () => {
    expect(isValidSetScore(-1, 5, 18)).toBe(false);
    expect(isValidSetScore(18.5, 10, 18)).toBe(false);
  });

  it('applies the 15-point decider threshold the same way', () => {
    expect(isValidSetScore(15, 12, 15)).toBe(true);
    expect(isValidSetScore(15, 14, 15)).toBe(false);
    expect(isValidSetScore(17, 15, 15)).toBe(true);
    expect(isValidSetScore(18, 15, 15)).toBe(false); // gap 3 past threshold — impossible
  });
});

describe('deriveOutcome', () => {
  it('a single valid set decides the match outright', () => {
    expect(deriveOutcome([{ a: 18, b: 10 }])).toEqual({ status: 'confirmed', winningTeam: 'a' });
    expect(deriveOutcome([{ a: 10, b: 18 }])).toEqual({ status: 'confirmed', winningTeam: 'b' });
  });

  it('team A sweeps 2-0', () => {
    expect(deriveOutcome([{ a: 18, b: 10 }, { a: 18, b: 12 }]))
      .toEqual({ status: 'confirmed', winningTeam: 'a' });
  });

  it('1-1 after two sets with no decider is a draw', () => {
    expect(deriveOutcome([{ a: 18, b: 10 }, { a: 12, b: 18 }]))
      .toEqual({ status: 'draw' });
  });

  it('decided 2-1 in the third set', () => {
    expect(deriveOutcome([{ a: 18, b: 10 }, { a: 12, b: 18 }, { a: 15, b: 9 }]))
      .toEqual({ status: 'confirmed', winningTeam: 'a' });
    expect(deriveOutcome([{ a: 18, b: 10 }, { a: 12, b: 18 }, { a: 9, b: 15 }]))
      .toEqual({ status: 'confirmed', winningTeam: 'b' });
  });

  it('any impossible set score makes the whole match invalid', () => {
    expect(deriveOutcome([{ a: 21, b: 18 }])).toEqual({ status: 'invalid' });
    expect(deriveOutcome([{ a: 18, b: 10 }, { a: 21, b: 18 }])).toEqual({ status: 'invalid' });
  });

  it('rejects more than 3 sets or zero sets', () => {
    expect(deriveOutcome([])).toEqual({ status: 'invalid' });
    expect(deriveOutcome([
      { a: 18, b: 10 }, { a: 10, b: 18 }, { a: 15, b: 9 }, { a: 18, b: 10 },
    ])).toEqual({ status: 'invalid' });
  });
});
