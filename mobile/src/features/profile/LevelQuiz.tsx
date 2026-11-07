// Native port of src/app/components/LevelQuiz.tsx (web): the 5-question
// futevôlei level quiz, one question at a time, then the starting level.
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronLeft, RotateCcw } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { FUTEVOLEI_QUIZ, formatLevel, levelCategory, quizRating } from '@/lib/shared';
import palette from '../../../tailwind.palette';

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
      <View className="gap-4">
        <LinearGradient colors={[palette.violet['600'], palette.violet['800']]} style={{ borderRadius: 16, padding: 24, alignItems: 'center' }}>
          <Text className="text-sm text-violet-200 font-medium">Seu nível inicial</Text>
          <Text className="text-5xl font-extrabold text-white mt-1">{formatLevel(result.rating)}</Text>
          <Text className="text-base font-semibold text-white mt-1">{levelCategory(result.rating)}</Text>
        </LinearGradient>
        <Text className="text-sm text-gray-500 text-center px-2">
          Ele se ajusta sozinho conforme você joga — mais rápido nas primeiras 10 partidas.
        </Text>
        {onConfirm && (
          <Pressable
            onPress={() => onConfirm(result.rating)}
            disabled={confirming}
            className={`w-full bg-violet-600 py-3 rounded-xl items-center ${confirming ? 'opacity-60' : ''}`}
          >
            {confirming ? <ActivityIndicator color="#ffffff" /> : <Text className="text-white font-bold text-base">Confirmar meu nível</Text>}
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            onChange(emptyQuizAnswers());
            setCurrent(0);
          }}
          className="flex-row items-center justify-center gap-2 py-1"
          hitSlop={8}
        >
          <RotateCcw size={16} color={palette.violet['600']} />
          <Text className="text-sm font-semibold text-violet-600">Refazer as perguntas</Text>
        </Pressable>
      </View>
    );
  }

  const q = FUTEVOLEI_QUIZ[current];
  return (
    <View className="gap-4">
      <View>
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-semibold text-violet-600 uppercase tracking-wide">
            Pergunta {current + 1} de {FUTEVOLEI_QUIZ.length}
          </Text>
          {current > 0 && (
            <Pressable onPress={() => setCurrent(c => c - 1)} className="flex-row items-center" hitSlop={8}>
              <ChevronLeft size={16} color={palette.gray['500']} />
              <Text className="text-xs font-semibold text-gray-500">Anterior</Text>
            </Pressable>
          )}
        </View>
        <View className="flex-row gap-1">
          {FUTEVOLEI_QUIZ.map((_, i) => (
            <View key={i} className={`h-1 flex-1 rounded-full ${answers[i] !== null || i === current ? 'bg-violet-600' : 'bg-gray-200'}`} />
          ))}
        </View>
      </View>

      <Text className="text-lg font-bold text-gray-900">{q.title}</Text>

      <View className="gap-2">
        {q.options.map((label, points) => {
          const selected = answers[current] === points;
          return (
            <Pressable
              key={label}
              onPress={() => answer(points)}
              accessibilityState={{ selected }}
              className={`flex-row items-center justify-between gap-3 px-4 py-3.5 rounded-xl border-2 ${
                selected ? 'border-violet-600 bg-violet-50' : 'border-gray-200'
              }`}
            >
              <Text className="flex-1 text-sm font-medium text-gray-900">{label}</Text>
              {selected && (
                <View className="w-5 h-5 bg-violet-600 rounded-full items-center justify-center">
                  <Check size={12} color="#ffffff" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
