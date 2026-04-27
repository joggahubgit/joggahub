/**
 * Game configuration constants.
 *
 * FUTSAL_TEMP_MIN_PLAYERS is a temporary override for testing the full game
 * lifecycle (confirmation → pending_results → completed).
 *
 * To revert: change FUTSAL_TEMP_MIN_PLAYERS back to the production value (e.g. 8)
 * or remove the futsal-specific override in PaymentSuccess.tsx.
 */

/** Minimum players required to confirm any game. */
export const DEFAULT_MIN_PLAYERS = 10;

/** Hours before game start within which a player cannot self-cancel. */
export const PLAYER_CANCEL_CUTOFF_HOURS = 12;

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
