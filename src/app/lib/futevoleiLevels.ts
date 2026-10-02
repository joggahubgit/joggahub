/**
 * Self-declared starting level for futevôlei, shown once (onboarding or
 * profile) before a player has any confirmed matches. Maps a friendly band
 * to a starting point on the same 1.0–7.0 rating scale used by
 * player_ratings — the ELO-style adjustment in submit-game-result then
 * recalibrates it match by match, fast at first (low confidence) and
 * slower once matches_played grows (same idea as Playtomic's level).
 */
export interface FutevoleiLevelOption {
  key: string;
  label: string;
  description: string;
  rating: number;
}

export const FUTEVOLEI_LEVELS: FutevoleiLevelOption[] = [
  { key: 'iniciante',    label: 'Iniciante',    description: 'Nunca joguei ou jogo raramente', rating: 1.5 },
  { key: 'casual',       label: 'Casual',       description: 'Jogo de vez em quando',           rating: 2.5 },
  { key: 'intermediario', label: 'Intermediário', description: 'Jogo regularmente, já peguei o jeito', rating: 3.5 },
  { key: 'avancado',     label: 'Avançado',     description: 'Jogo há anos, boa técnica e tática', rating: 4.5 },
  { key: 'competidor',   label: 'Competidor',   description: 'Já joguei torneios ou competições', rating: 5.5 },
];

/** Below this many confirmed matches, the rating is still "provisório" — moves fast, shown with a badge. */
export const PROVISIONAL_MATCHES_THRESHOLD = 10;
