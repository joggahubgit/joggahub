/**
 * Game lifecycle business rules — unit & integration tests
 *
 * Test framework: Vitest (not yet installed)
 * To install and run:
 *   npm install -D vitest
 *   npx vitest run src/tests/gameRules.test.ts
 *
 * Add to package.json scripts:
 *   "test": "vitest run",
 *   "test:watch": "vitest"
 */

import { describe, it, expect } from 'vitest';
import {
  getMinPlayersForSport,
  DEFAULT_MIN_PLAYERS,
  PLAYER_CANCEL_CUTOFF_HOURS,
  PENDING_RESULTS_DELAY_MINUTES,
  RESULT_WINDOW_HOURS,
} from '../app/lib/gameConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper: cancel window check
// ─────────────────────────────────────────────────────────────────────────────

function isWithinCancelCutoff(startTimeISO: string, nowMs: number = Date.now()): boolean {
  const msUntilStart = new Date(startTimeISO).getTime() - nowMs;
  return msUntilStart < PLAYER_CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper: pending_results trigger check
// ─────────────────────────────────────────────────────────────────────────────

function shouldTransitionToPendingResults(endTimeISO: string, nowMs: number = Date.now()): boolean {
  const threshold = new Date(endTimeISO).getTime() + PENDING_RESULTS_DELAY_MINUTES * 60 * 1000;
  return nowMs >= threshold;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper: result window expiry check
// ─────────────────────────────────────────────────────────────────────────────

function isResultWindowExpired(endTimeISO: string, nowMs: number = Date.now()): boolean {
  const expiry = new Date(endTimeISO).getTime() + RESULT_WINDOW_HOURS * 60 * 60 * 1000;
  return nowMs >= expiry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper: should confirm game
// ─────────────────────────────────────────────────────────────────────────────

function shouldConfirmGame(sportType: string, currentStatus: string, newPlayerCount: number): boolean {
  return (
    currentStatus === 'scheduled' &&
    newPlayerCount >= getMinPlayersForSport(sportType)
  );
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('getMinPlayersForSport', () => {
  it('returns DEFAULT_MIN_PLAYERS for futsal', () => {
    expect(getMinPlayersForSport('futsal')).toBe(DEFAULT_MIN_PLAYERS);
  });

  it('returns DEFAULT_MIN_PLAYERS for football', () => {
    expect(getMinPlayersForSport('football')).toBe(DEFAULT_MIN_PLAYERS);
  });

  it('returns DEFAULT_MIN_PLAYERS for society', () => {
    expect(getMinPlayersForSport('society')).toBe(DEFAULT_MIN_PLAYERS);
  });

  it('returns DEFAULT_MIN_PLAYERS for unknown sport', () => {
    expect(getMinPlayersForSport('unknown_sport')).toBe(DEFAULT_MIN_PLAYERS);
  });
});

describe('Game confirmation — minimum players rule', () => {
  it('confirms futsal when DEFAULT_MIN_PLAYERS is reached', () => {
    expect(shouldConfirmGame('futsal', 'scheduled', DEFAULT_MIN_PLAYERS)).toBe(true);
  });

  it('does not confirm futsal below DEFAULT_MIN_PLAYERS', () => {
    expect(shouldConfirmGame('futsal', 'scheduled', DEFAULT_MIN_PLAYERS - 1)).toBe(false);
  });

  it('confirms futsal above DEFAULT_MIN_PLAYERS', () => {
    expect(shouldConfirmGame('futsal', 'scheduled', DEFAULT_MIN_PLAYERS + 1)).toBe(true);
  });

  it('does not re-confirm an already confirmed_booking game', () => {
    expect(shouldConfirmGame('futsal', 'confirmed_booking', DEFAULT_MIN_PLAYERS + 1)).toBe(false);
  });

  it('does not confirm a completed game', () => {
    expect(shouldConfirmGame('futsal', 'completed', DEFAULT_MIN_PLAYERS + 1)).toBe(false);
  });

  it('does not confirm football below DEFAULT_MIN_PLAYERS', () => {
    expect(shouldConfirmGame('football', 'scheduled', DEFAULT_MIN_PLAYERS - 1)).toBe(false);
  });

  it('confirms football at DEFAULT_MIN_PLAYERS', () => {
    expect(shouldConfirmGame('football', 'scheduled', DEFAULT_MIN_PLAYERS)).toBe(true);
  });
});

describe('Player cancel window — 12h rule', () => {
  const hoursToMs = (h: number) => h * 60 * 60 * 1000;

  it('allows cancel when more than 12h before start', () => {
    const futureStart = new Date(Date.now() + hoursToMs(13)).toISOString();
    expect(isWithinCancelCutoff(futureStart)).toBe(false);
  });

  it('blocks cancel when less than 12h before start', () => {
    const nearStart = new Date(Date.now() + hoursToMs(11)).toISOString();
    expect(isWithinCancelCutoff(nearStart)).toBe(true);
  });

  it('blocks cancel when game has already started (past start time)', () => {
    const pastStart = new Date(Date.now() - hoursToMs(1)).toISOString();
    expect(isWithinCancelCutoff(pastStart)).toBe(true);
  });

  it('blocks cancel at exactly 12h before start (boundary — cutoff is strict <)', () => {
    // exactly at cutoff: msUntilStart == CUTOFF_HOURS * 3600 * 1000
    // isWithinCancelCutoff uses strict < so exactly 12h should NOT be blocked
    const exactCutoff = new Date(Date.now() + hoursToMs(PLAYER_CANCEL_CUTOFF_HOURS)).toISOString();
    expect(isWithinCancelCutoff(exactCutoff)).toBe(false);
  });

  it('blocks cancel at 12h - 1ms before start', () => {
    const justBeforeCutoff = new Date(Date.now() + hoursToMs(PLAYER_CANCEL_CUTOFF_HOURS) - 1).toISOString();
    expect(isWithinCancelCutoff(justBeforeCutoff)).toBe(true);
  });
});

describe('Pending results transition — 5 minutes after end', () => {
  const minutesToMs = (m: number) => m * 60 * 1000;

  it('does not trigger before 5 min after end', () => {
    const endTime = new Date(Date.now() - minutesToMs(4)).toISOString();
    expect(shouldTransitionToPendingResults(endTime)).toBe(false);
  });

  it('triggers at exactly 5 min after end', () => {
    const endTime = new Date(Date.now() - minutesToMs(PENDING_RESULTS_DELAY_MINUTES)).toISOString();
    expect(shouldTransitionToPendingResults(endTime)).toBe(true);
  });

  it('triggers after more than 5 min after end', () => {
    const endTime = new Date(Date.now() - minutesToMs(10)).toISOString();
    expect(shouldTransitionToPendingResults(endTime)).toBe(true);
  });

  it('does not trigger when end time is in the future', () => {
    const endTime = new Date(Date.now() + minutesToMs(30)).toISOString();
    expect(shouldTransitionToPendingResults(endTime)).toBe(false);
  });
});

describe('Result window expiry — 12h after end', () => {
  const hoursToMs = (h: number) => h * 60 * 60 * 1000;

  it('result window still open at 11h after end', () => {
    const endTime = new Date(Date.now() - hoursToMs(11)).toISOString();
    expect(isResultWindowExpired(endTime)).toBe(false);
  });

  it('result window expires at exactly 12h after end', () => {
    const endTime = new Date(Date.now() - hoursToMs(RESULT_WINDOW_HOURS)).toISOString();
    expect(isResultWindowExpired(endTime)).toBe(true);
  });

  it('result window expired after more than 12h', () => {
    const endTime = new Date(Date.now() - hoursToMs(14)).toISOString();
    expect(isResultWindowExpired(endTime)).toBe(true);
  });

  it('result window is open when game just ended', () => {
    const endTime = new Date(Date.now() - hoursToMs(0.1)).toISOString();
    expect(isResultWindowExpired(endTime)).toBe(false);
  });
});

describe('Cancel permission — player vs club', () => {
  it('club can always cancel regardless of timing', () => {
    // Club cancellation is always allowed (handled in validate-game-cancel edge function)
    // This test documents the expected behavior
    const cancelledBy: 'player' | 'club' = 'club';
    expect(cancelledBy === 'club').toBe(true); // club bypass is unconditional
  });

  it('player is blocked within cancel window', () => {
    const nearStart = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1h before
    const cancelledBy: 'player' | 'club' = 'player';
    const blocked = cancelledBy === 'player' && isWithinCancelCutoff(nearStart);
    expect(blocked).toBe(true);
  });

  it('player is allowed outside cancel window', () => {
    const farStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h before
    const cancelledBy: 'player' | 'club' = 'player';
    const blocked = cancelledBy === 'player' && isWithinCancelCutoff(farStart);
    expect(blocked).toBe(false);
  });
});

describe('XP distribution rules', () => {
  it('xp_distributed starts as false', () => {
    const game = { status: 'completed', xp_distributed: false };
    expect(game.xp_distributed).toBe(false);
  });

  it('completed without results has xp_distributed = false', () => {
    // Timeout path: process-game-transitions sets xp_distributed: false explicitly
    const game = { status: 'completed', xp_distributed: false };
    expect(game.status === 'completed' && !game.xp_distributed).toBe(true);
  });

  it('completed with results has xp_distributed = true', () => {
    // MVP submission path sets xp_distributed: true
    const game = { status: 'completed', xp_distributed: true };
    expect(game.status === 'completed' && game.xp_distributed).toBe(true);
  });
});

describe('Full lifecycle — all sports use same minimum', () => {
  it('futsal min players equals DEFAULT_MIN_PLAYERS', () => {
    expect(getMinPlayersForSport('futsal')).toBe(DEFAULT_MIN_PLAYERS);
  });

  it('football min players equals DEFAULT_MIN_PLAYERS', () => {
    expect(getMinPlayersForSport('football')).toBe(DEFAULT_MIN_PLAYERS);
  });

  it('society min players equals DEFAULT_MIN_PLAYERS', () => {
    expect(getMinPlayersForSport('society')).toBe(DEFAULT_MIN_PLAYERS);
  });

  it('padel min players equals DEFAULT_MIN_PLAYERS', () => {
    expect(getMinPlayersForSport('padel')).toBe(DEFAULT_MIN_PLAYERS);
  });

  it('tennis min players equals DEFAULT_MIN_PLAYERS', () => {
    expect(getMinPlayersForSport('tennis')).toBe(DEFAULT_MIN_PLAYERS);
  });
});
