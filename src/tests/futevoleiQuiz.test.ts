import { describe, expect, it } from 'vitest';
import { FUTEVOLEI_QUIZ, formatLevel, levelCategory, quizRating } from '../app/lib/futevoleiQuiz';

describe('futevoleiQuiz', () => {
  it('has 5 questions with 5 options each', () => {
    expect(FUTEVOLEI_QUIZ).toHaveLength(5);
    FUTEVOLEI_QUIZ.forEach(q => expect(q.options).toHaveLength(5));
  });

  it('needs every answer', () => {
    expect(quizRating([2, 2, 2, 2, null])).toBeNull();
    expect(quizRating([2, 2, 2, 2])).toBeNull();
  });

  it('maps points to the table (0.5 per 2 points, max 5.5)', () => {
    expect(quizRating([1, 0, 0, 0, 0])!.rating).toBe(0.5);   // 1 pt
    expect(quizRating([1, 1, 1, 1, 2])!.rating).toBe(2.0);   // 6 pts
    expect(quizRating([2, 2, 2, 2, 2])).toEqual({ points: 10, rating: 3.0 });
    expect(quizRating([3, 3, 3, 3, 2])!.rating).toBe(4.0);   // 14 pts (competitive matches: no cap)
    expect(quizRating([3, 3, 3, 3, 3])!.rating).toBe(4.0);   // 15 pts
    expect(quizRating([4, 4, 4, 4, 3])!.rating).toBe(5.0);   // 19 pts
    expect(quizRating([4, 4, 4, 4, 4])).toEqual({ points: 20, rating: 5.5 });
  });

  it('caps players who never played at 1.0', () => {
    expect(quizRating([0, 4, 4, 4, 4])!.rating).toBe(1.0);
  });

  it('caps players without tournaments at 3.5', () => {
    expect(quizRating([4, 4, 4, 4, 1])!.rating).toBe(3.5);
    expect(quizRating([4, 4, 4, 4, 2])!.rating).toBe(5.0);
  });

  it('names every band', () => {
    expect(levelCategory(0.5)).toBe('Iniciação');
    expect(levelCategory(1.0)).toBe('Iniciação');
    expect(levelCategory(1.5)).toBe('Iniciação / Intermediário');
    expect(levelCategory(2.0)).toBe('Iniciação / Intermediário');
    expect(levelCategory(2.5)).toBe('Intermediário');
    expect(levelCategory(3.87)).toBe('Intermediário');
    expect(levelCategory(4.0)).toBe('Intermediário alto');
    expect(levelCategory(5.0)).toBe('Intermediário avançado');
    expect(levelCategory(5.5)).toBe('Avançado');
    expect(levelCategory(6.5)).toBe('Avançado');
    expect(levelCategory(7.0)).toBe('Elite');
  });

  it('formats with a comma', () => {
    expect(formatLevel(3)).toBe('3,0');
    expect(formatLevel(4.25)).toBe('4,3');
  });
});
