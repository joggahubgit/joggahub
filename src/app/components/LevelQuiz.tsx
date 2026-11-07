// The 5-question futevôlei level quiz (lib/futevoleiQuiz.ts): one question at a
// time, then the resulting starting level. Used in onboarding and Profile.
import { useState } from 'react';
import { Check, ChevronLeft, RotateCcw } from 'lucide-react';
import { FUTEVOLEI_QUIZ, formatLevel, levelCategory, quizRating } from '@/app/lib/futevoleiQuiz';

export type QuizAnswers = (number | null)[];
export const emptyQuizAnswers = (): QuizAnswers => FUTEVOLEI_QUIZ.map(() => null);

interface Props {
  answers: QuizAnswers;
  onChange: (answers: QuizAnswers) => void;
  /** Profile only: confirm button under the result */
  onConfirm?: (rating: number) => void;
  confirming?: boolean;
}

export function LevelQuiz({ answers, onChange, onConfirm, confirming }: Props) {
  const firstOpen = answers.findIndex(a => a === null);
  const [current, setCurrent] = useState(firstOpen === -1 ? 0 : firstOpen);
  const result = quizRating(answers);

  function answer(points: number) {
    const next = answers.map((a, i) => (i === current ? points : a));
    onChange(next);
    const open = next.findIndex(a => a === null);
    if (open !== -1) setTimeout(() => setCurrent(open), 180);
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-6 text-white text-center">
          <p className="text-sm text-violet-200 font-medium">Seu nível inicial</p>
          <p className="text-5xl font-extrabold mt-1">{formatLevel(result.rating)}</p>
          <p className="text-base font-semibold mt-1">{levelCategory(result.rating)}</p>
        </div>
        <p className="text-sm text-gray-500 text-center px-2">
          Ele se ajusta sozinho conforme você joga — mais rápido nas primeiras 10 partidas.
        </p>
        {onConfirm && (
          <button
            onClick={() => onConfirm(result.rating)}
            disabled={confirming}
            className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold hover:bg-violet-700 disabled:opacity-60"
          >
            {confirming ? 'Salvando...' : 'Confirmar meu nível'}
          </button>
        )}
        <button
          onClick={() => { onChange(emptyQuizAnswers()); setCurrent(0); }}
          className="flex items-center justify-center gap-2 text-sm font-semibold text-violet-600"
        >
          <RotateCcw className="w-4 h-4" /> Refazer as perguntas
        </button>
      </div>
    );
  }

  const q = FUTEVOLEI_QUIZ[current];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-violet-600 uppercase tracking-wide">
            Pergunta {current + 1} de {FUTEVOLEI_QUIZ.length}
          </span>
          {current > 0 && (
            <button onClick={() => setCurrent(c => c - 1)} className="flex items-center gap-0.5 text-xs font-semibold text-gray-500">
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {FUTEVOLEI_QUIZ.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${answers[i] !== null || i === current ? 'bg-violet-600' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <h3 className="text-lg font-bold text-gray-900">{q.title}</h3>

      <div className="flex flex-col gap-2">
        {q.options.map((label, points) => {
          const selected = answers[current] === points;
          return (
            <button
              key={label}
              onClick={() => answer(points)}
              className={`flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all ${
                selected ? 'border-violet-600 bg-violet-50' : 'border-gray-200 hover:border-violet-200'
              }`}
            >
              <span className="text-sm font-medium text-gray-900">{label}</span>
              {selected && (
                <span className="w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
