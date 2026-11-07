// Componentes de aulas no app — mesmo visual do site (src/app/components/classes).
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, GraduationCap, MapPin, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { classLevelLabel, formatBRL, wallDate, wallTime } from '@/lib/shared';
import { fetchMyClasses, fmtShort, todayStr, type ClassCard, type UpcomingClass } from './api';
import palette from '../../../tailwind.palette';

export function ClassListCard({ c, enrolled }: { c: ClassCard; enrolled?: boolean }) {
  const left = c.capacity - c.enrolled_count;
  const badge = enrolled
    ? { label: 'Inscrito', bg: 'bg-violet-100', fg: 'text-violet-700' }
    : left <= 0
      ? { label: 'Lotado', bg: 'bg-gray-100', fg: 'text-gray-500' }
      : { label: `${left} ${left === 1 ? 'vaga' : 'vagas'}`, bg: 'bg-green-50', fg: 'text-green-700' };
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/aulas/[id]', params: { id: c.id } })}
      className="bg-white rounded-2xl border border-gray-200 p-4 active:bg-gray-50"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-bold text-gray-900 text-base">{c.title}</Text>
          <Text className="text-sm text-gray-500">Prof. {c.coach_name} · {classLevelLabel(c.level)}</Text>
        </View>
        <View className={`px-2 py-1 rounded-full ${badge.bg}`}>
          <Text className={`text-[11px] font-semibold ${badge.fg}`}>{badge.label}</Text>
        </View>
      </View>
      <View className="mt-3 gap-1.5">
        <View className="flex-row items-center gap-2">
          <MapPin size={16} color={palette.gray['400']} />
          <Text className="text-sm text-gray-600 flex-1" numberOfLines={1}>
            {c.venues?.name}{c.venues?.city ? ` · ${c.venues.city}` : ''}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <CalendarDays size={16} color={palette.gray['400']} />
          <Text className="text-sm text-gray-600">{c.lesson_count} aulas · {fmtShort(c.start_date)} a {fmtShort(c.end_date)}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Users size={16} color={palette.gray['400']} />
          <Text className="text-sm text-gray-600">{c.enrolled_count}/{c.capacity} alunos</Text>
        </View>
      </View>
      <Text className="mt-3 text-lg font-bold text-violet-600">
        {formatBRL(Number(c.price))} <Text className="text-xs font-normal text-gray-400">o curso todo</Text>
      </Text>
    </Pressable>
  );
}

/** Card da próxima aula em "Próximas partidas" (Home). */
export function UpcomingClassCard({ item }: { item: UpcomingClass }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/aulas/[id]', params: { id: item.classId } })}
      className="w-72 bg-white rounded-2xl border border-gray-200 overflow-hidden"
    >
      <View className="h-1.5 bg-amber-500 w-full" />
      <View className="p-4 gap-3">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-sm font-bold text-gray-900">
              {wallDate(item.startsAt)} · {wallTime(item.startsAt)} – {wallTime(item.endsAt)}
            </Text>
            <Text className="text-sm font-semibold text-gray-700" numberOfLines={1}>{item.title}</Text>
            <Text className="text-xs text-gray-400" numberOfLines={1}>{item.venueName} · {item.courtName}</Text>
          </View>
          <View className="px-2 py-1 rounded-full bg-amber-100 ml-2">
            <Text className="text-[11px] font-bold text-amber-700">Aula {item.lessonNumber}/{item.lessonCount}</Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between pt-1 border-t border-gray-100">
          <View className="flex-row items-center gap-1.5 flex-1">
            <GraduationCap size={16} color={palette.amber['500']} />
            <Text className="text-xs text-gray-500" numberOfLines={1}>Aula · Prof. {item.coach}</Text>
          </View>
          <Text className="text-[11px] font-bold text-green-700">Inscrito</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Seção "Cursos" em Minhas Reservas. Não renderiza nada se não houver cursos. */
export function MyClassesSection({ userId, className }: { userId: string; className?: string }) {
  const q = useQuery({ queryKey: ['myClasses', userId], queryFn: () => fetchMyClasses(userId) });
  const rows = q.data ?? [];
  if (!rows.length) return null;
  const today = todayStr();
  return (
    <View className={className}>
      <Text className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Cursos</Text>
      <View className="gap-3">
        {rows.map(r => {
          const c = r.classes!;
          const badge =
            r.status !== 'active'
              ? (c.status === 'cancelled' ? 'Curso cancelado' : 'Você desistiu') + (r.refunded ? ' · reembolsado' : '')
              : c.end_date < today ? 'Concluído' : 'Inscrito';
          const tone =
            r.status !== 'active' ? ['bg-gray-100', 'text-gray-500'] : c.end_date < today ? ['bg-green-100', 'text-green-700'] : ['bg-violet-100', 'text-violet-700'];
          return (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: '/aulas/[id]', params: { id: c.id } })}
              className="bg-white rounded-2xl border border-gray-200 p-4 flex-row items-center gap-3 active:bg-gray-50"
            >
              <View className="w-10 h-10 rounded-full bg-amber-100 items-center justify-center">
                <GraduationCap size={20} color={palette.amber['600']} />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-gray-900 text-base" numberOfLines={1}>{c.title}</Text>
                <Text className="text-xs text-gray-500" numberOfLines={1}>
                  {c.venues?.name} · {c.lesson_count} aulas · {fmtShort(c.start_date)} a {fmtShort(c.end_date)}
                </Text>
                <View className="flex-row items-center gap-2 mt-1.5">
                  <View className={`px-2 py-0.5 rounded-full ${tone[0]}`}>
                    <Text className={`text-[11px] font-bold ${tone[1]}`}>{badge}</Text>
                  </View>
                  <Text className="text-xs font-semibold text-gray-700">{formatBRL(Number(r.amount_paid) + Number(r.service_fee))}</Text>
                </View>
              </View>
              <ChevronRight size={16} color={palette.gray['300']} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
