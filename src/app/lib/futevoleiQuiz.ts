/**
 * 5-question quiz that sets a player's starting futevôlei level (onboarding
 * and Profile, before any rating exists). Modelled on Playtomic's padel level
 * table, on the same 0.5–7.0 scale as player_ratings.
 *
 * Each answer is worth 0–4 points (options are listed in that order), 0–20 in
 * total → 0.5 + 0.5 per 2 points, capped at 5.5 — the most anyone can
 * self-declare (declare_initial_rating enforces it too). 6.0+ only comes from
 * playing. Shared with the mobile app (mobile/src/lib/shared.ts) — no imports.
 */

export interface QuizQuestion {
  key: string;
  title: string;
  /** Points = index (0–4). */
  options: string[];
}

export const FUTEVOLEI_QUIZ: QuizQuestion[] = [
  {
    key: 'tempo',
    title: 'Há quanto tempo você joga futevôlei?',
    options: ['Nunca joguei', 'Menos de 6 meses', 'De 6 meses a 2 anos', 'De 2 a 5 anos', 'Mais de 5 anos'],
  },
  {
    key: 'frequencia',
    title: 'Com que frequência você joga ou treina?',
    options: [
      'Raramente',
      'De vez em quando, sem aula',
      'Toda semana, ou já fiz aulas',
      '2 ou mais vezes por semana, com aula ou treino',
      'Treino regular com professor ou equipe',
    ],
  },
  {
    key: 'dominio',
    title: 'Quando a bola vem do outro lado, você…',
    options: [
      'Ainda tenho dificuldade de dominar',
      'Domino bolas lentas, mas erro bastante',
      'Recebo e passo para o parceiro na maioria das vezes',
      'Recebo bolas rápidas e coloco onde o parceiro quer',
      'Domino qualquer bola, até ataques fortes, com precisão',
    ],
  },
  {
    key: 'ataque',
    title: 'Como é o seu ataque?',
    options: [
      'Só passo a bola para o outro lado',
      'Ataco com o pé, mas sem direção',
      'Faço chapada ou pingo com alguma direção',
      'Vario chapada, pingo e cabeça, e procuro o ponto fraco',
      'Shark attack ou chilena, com ataques fortes e decisivos',
    ],
  },
  {
    key: 'partidas',
    title: 'Como são as suas partidas?',
    options: [
      'Nunca joguei uma partida de verdade',
      'Racha com amigos',
      'Partidas competitivas no meu nível, pensando em saque e posicionamento',
      'Já joguei torneios amadores',
      'Jogo torneios com frequência ou já fui ao pódio',
    ],
  },
];

export const QUIZ_MAX_SELF_RATING = 5.5;

/**
 * Starting rating from the answers (points per question, null = unanswered).
 * Returns null until every question is answered.
 */
export function quizRating(answers: (number | null)[]): { points: number; rating: number } | null {
  if (answers.length !== FUTEVOLEI_QUIZ.length || answers.some(a => a === null)) return null;
  const pts = answers as number[];
  const points = pts.reduce((s, a) => s + a, 0);
  let rating = Math.min(QUIZ_MAX_SELF_RATING, 0.5 + Math.floor(points / 2) * 0.5);
  if (pts[0] === 0) rating = Math.min(rating, 1.0); // never played → at most 1.0
  if (pts[4] <= 1) rating = Math.min(rating, 3.5);  // never played a tournament → at most 3.5
  return { points, rating };
}

/** Category for any rating on the 0.5–7.0 scale (Playtomic-style bands). */
export function levelCategory(rating: number): string {
  if (rating < 1.5) return 'Iniciação';
  if (rating < 2.5) return 'Iniciação / Intermediário';
  if (rating < 4.0) return 'Intermediário';
  if (rating < 5.0) return 'Intermediário alto';
  if (rating < 5.5) return 'Intermediário avançado';
  if (rating < 7.0) return 'Avançado';
  return 'Elite';
}

/** 3.5 → "3,5" */
export function formatLevel(rating: number): string {
  return rating.toFixed(1).replace('.', ',');
}
