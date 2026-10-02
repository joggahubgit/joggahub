/**
 * Competitive futevôlei scoring rules — best of 3 sets, sets 1–2 to 18
 * points, set 3 (decider) to 15, minimum 2-point winning margin (running
 * score, no cap). Mirrored in supabase/functions/submit-game-result and
 * process-game-transitions — keep all three in sync.
 */
export interface SetScore {
  a: number;
  b: number;
}

export function setTarget(setIndex: number): number {
  return setIndex < 2 ? 18 : 15;
}

/** Whether a single set's final score could actually occur under the win-by-2 rule. */
export function isValidSetScore(a: number, b: number, target: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
  const winner = Math.max(a, b);
  const diff = Math.abs(a - b);
  if (diff < 2) return false;
  if (winner === target) return true;
  if (winner > target) return diff === 2;
  return false; // winner hasn't reached the threshold yet — set can't be over
}

export type MatchOutcome =
  | { status: 'invalid' }
  | { status: 'draw' }
  | { status: 'confirmed'; winningTeam: 'a' | 'b' };

/** Derives the match outcome from 1–3 set scores, or 'invalid' if any set is impossible. */
export function deriveOutcome(sets: SetScore[]): MatchOutcome {
  if (sets.length < 1 || sets.length > 3) return { status: 'invalid' };

  let setsA = 0;
  let setsB = 0;
  for (let i = 0; i < sets.length; i++) {
    const { a, b } = sets[i];
    if (!isValidSetScore(a, b, setTarget(i))) return { status: 'invalid' };
    if (a > b) setsA++; else setsB++;
  }

  if (sets.length === 1) {
    return { status: 'confirmed', winningTeam: setsA > setsB ? 'a' : 'b' };
  }
  if (setsA >= 2) return { status: 'confirmed', winningTeam: 'a' };
  if (setsB >= 2) return { status: 'confirmed', winningTeam: 'b' };
  return { status: 'draw' }; // e.g. 1–1 after 2 sets with no decider played
}
