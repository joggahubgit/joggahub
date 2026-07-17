/**
 * Game configuration constants.
 *
 * FUTSAL_TEMP_MIN_PLAYERS is a temporary override for testing the full game
 * lifecycle (confirmation → pending_results → completed).
 *
 * To revert: change FUTSAL_TEMP_MIN_PLAYERS back to the production value (e.g. 8)
 * or remove the futsal-specific override in PaymentSuccess.tsx.
 */

/** Platform fee applied to every transaction. */
export const PLATFORM_FEE_PERCENT = 0.08;
export const PLATFORM_FEE_FIXED = 2.50;

/** Minimum players required to confirm any game. */
export const DEFAULT_MIN_PLAYERS = 10;

/** Hours before game start within which a player cannot self-cancel. */
export const PLAYER_CANCEL_CUTOFF_HOURS = 24;

/**
 * Hours before game start at which split-payment holds are captured by the cron
 * (process-game-transitions, blocks O and S), and at which new players can no
 * longer join. Must match those blocks' cutoff — entry has to close here because
 * per-player price is fixed at join time and never redistributed once the group
 * has been captured, so a later join would overcharge past the court's total price.
 */
export const CAPTURE_CUTOFF_HOURS = 2;

/** Minutes after game end before automatic transition to pending_results. */
export const PENDING_RESULTS_DELAY_MINUTES = 5;

/** Hours after game end before auto-closing without XP (result window). */
export const RESULT_WINDOW_HOURS = 12;

/** XP awarded to every participant on game completion. */
export const XP_PARTICIPATION = 15;

/** Additional XP awarded to the MVP. */
export const XP_MVP_BONUS = 30;

/** Returns the minimum players needed to confirm a game by sport type. */
export function getMinPlayersForSport(_sportType: string): number {
  return DEFAULT_MIN_PLAYERS;
}
