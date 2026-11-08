// Port of src/app/components/classes/ClassDetailPage.tsx (web).
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle, GraduationCap, Info, MapPin, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  LEAVE_REFUND_HOURS, fetchClassPage, leaveClass, startClassCheckout, wallMs, wallNowMs,
} from '@/features/classes/api';
import { CLASS_ENROLL_CUTOFF_HOURS, classLevelLabel, classPaymentPlan, classServiceFee, formatBRL, formatSessionDate } from '@/lib/shared';
import { confirmAction } from '@/lib/confirm';
import palette from '../../../../tailwind.palette';

export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session!.user.id;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['classPage', id, userId], queryFn: () => fetchClassPage(id!, userId), enabled: !!id });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/aulas');
  }

  if (q.isPending) {
    return <View className="flex-1 items-center justify-center bg-gray-50"><ActivityIndicator color={palette.violet['600']} /></View>;
  }
  const cls = q.data?.cls;
  if (!cls) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-6 gap-3">
        <GraduationCap size={48} color={palette.gray['300']} />
        <Text className="text-gray-600 font-semibold">Curso não encontrado</Text>
        <Pressable onPress={() => router.replace('/aulas')}><Text className="text-violet-600 font-semibold">Ver cursos</Text></Pressable>
      </View>
    );
  }

  const { sessions, enrollment } = q.data!;
  const enrolled = enrollment?.status === 'active';
  const firstStart = sessions[0]?.starts_at;
  const now = wallNowMs();
  const enrollOpen = !!firstStart && wallMs(firstStart) - CLASS_ENROLL_CUTOFF_HOURS * 3600_000 > now;
  const canLeaveWithRefund = !!firstStart && wallMs(firstStart) - LEAVE_REFUND_HOURS * 3600_000 > now;
  const left = cls.capacity - cls.enrolled_count;
  const fee = classServiceFee(Number(cls.price));
  const total = Number(cls.price) + fee;
  const cancelled = cls.status !== 'active';
  const showBar = !enrolled && !cancelled;
  const plan = firstStart ? classPaymentPlan(firstStart, now) : null;

  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const outcome = await startClassCheckout(cls!.id);
      if (outcome === 'cancelled') q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    confirmAction({
      title: 'Desistir do curso?',
      message: enrollment?.payment_held
        ? 'Você perde a vaga e a reserva no seu cartão é liberada. Nada é cobrado.'
        : 'Você perde a vaga e recebe o valor total de volta no cartão.',
      confirmText: 'Desistir',
      destructive: true,
      onConfirm: async () => {
        setBusy(true);
        setError('');
        try {
          const r = await leaveClass(enrollment!.id);
          setNotice(enrollment!.payment_held
            ? 'Inscrição cancelada. A reserva no seu cartão foi liberada, nada foi cobrado.'
            : r.refunded ? 'Inscrição cancelada. O valor total foi reembolsado no seu cartão.' : 'Inscrição cancelada.');
          qc.invalidateQueries();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerStyle={{ paddingBottom: showBar ? 210 : 40 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor="#ffffff" />}
      >
        <SafeAreaView edges={['top']} className="bg-violet-600 rounded-b-3xl">
          <View className="px-6 pt-4 pb-8">
            <Pressable onPress={goBack} accessibilityLabel="Voltar" hitSlop={12} className="mb-4 self-start">
              <ArrowLeft size={24} color="#ffffff" />
            </Pressable>
            <Text className="text-xs font-semibold uppercase tracking-wide text-violet-200">{classLevelLabel(cls.level)}</Text>
            <Text className="text-2xl font-bold text-white mt-1">{cls.title}</Text>
            <Text className="text-violet-100 mt-1 text-base">com Prof. {cls.coach_name}</Text>
          </View>
        </SafeAreaView>

        <View className="px-6 -mt-4 gap-3">
          {cancelled && (
            <View className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <Text className="text-red-700 text-sm">Este curso foi cancelado pelo clube.</Text>
            </View>
          )}
          {!!notice && (
            <View className="bg-green-50 border border-green-200 rounded-2xl p-4 flex-row gap-2">
              <CheckCircle size={16} color={palette.green['700']} />
              <Text className="text-green-800 text-sm flex-1">{notice}</Text>
            </View>
          )}
          {enrolled && (
            <View className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex-row gap-3">
              <CheckCircle size={20} color={palette.violet['600']} />
              <View className="flex-1">
                <Text className="font-semibold text-violet-900 text-base">Você está inscrito</Text>
                <Text className="text-sm text-violet-700">
                  {enrollment!.payment_held && plan
                    ? <>{formatBRL(Number(enrollment!.amount_paid) + Number(enrollment!.service_fee))} reservado no seu cartão. Cobrado só em <Text className="text-sm font-bold text-violet-700">{plan.chargeAt}</Text>.</>
                    : <>Pago {formatBRL(Number(enrollment!.amount_paid) + Number(enrollment!.service_fee))}. Até a primeira aula!</>}
                </Text>
              </View>
            </View>
          )}

          <View className="bg-white rounded-2xl border border-gray-200 p-5 gap-3">
            <View className="flex-row items-start gap-3">
              <MapPin size={20} color={palette.gray['400']} />
              <View className="flex-1">
                <Text className="text-sm text-gray-700">
                  <Text className="text-sm font-bold text-gray-900">{cls.venues?.name}</Text> · {cls.courts?.name}
                </Text>
                {!!cls.venues?.address && (
                  <Text className="text-sm text-gray-500">{cls.venues.address}{cls.venues.city ? `, ${cls.venues.city}` : ''}</Text>
                )}
              </View>
            </View>
            <View className="flex-row items-center gap-3">
              <CalendarDays size={20} color={palette.gray['400']} />
              <Text className="text-sm text-gray-700">{cls.lesson_count} aulas</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Users size={20} color={palette.gray['400']} />
              <Text className="text-sm text-gray-700">
                {cls.enrolled_count}/{cls.capacity} alunos
                {!cancelled && !enrolled ? (left > 0 ? ` · ${left} ${left === 1 ? 'vaga' : 'vagas'}` : ' · Lotado') : ''}
              </Text>
            </View>
            {!!cls.description && (
              <Text className="pt-2 border-t border-gray-100 text-sm text-gray-600">{cls.description}</Text>
            )}
          </View>

          <View className="bg-white rounded-2xl border border-gray-200 p-5">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Datas das aulas</Text>
            {sessions.map((s, i) => (
              <View key={s.id} className={`flex-row items-center py-2 ${i ? 'border-t border-gray-100' : ''}`}>
                <Text className="text-sm text-gray-500 w-16">Aula {i + 1}</Text>
                <Text className="flex-1 text-sm font-medium text-gray-900 capitalize">{formatSessionDate(s.starts_at.substring(0, 10))}</Text>
                <Text className="text-sm text-gray-600">{s.starts_at.substring(11, 16)}–{s.ends_at.substring(11, 16)}</Text>
              </View>
            ))}
          </View>

          <View className="bg-white rounded-2xl border border-gray-200 p-5 gap-2">
            <View className="flex-row items-center gap-2">
              <Info size={16} color={palette.violet['600']} />
              <Text className="font-semibold text-gray-900 text-sm">Como funciona</Text>
            </View>
            <Text className="text-sm text-gray-600">
              Você paga o curso inteiro pelo app e garante a vaga em todas as aulas. Como nas partidas, o valor fica reservado no cartão e só é cobrado {CLASS_ENROLL_CUTOFF_HOURS}h antes da primeira aula
              {plan ? <> (<Text className="text-sm font-bold text-gray-700">{plan.chargeAt}</Text>)</> : null}. Se você se inscrever com mais de 6 dias de antecedência, a cobrança é feita na hora.
            </Text>
            <Text className="text-sm text-gray-600">
              Desistiu? Sem custo até {LEAVE_REFUND_HOURS}h antes da primeira aula
              {plan ? <> (<Text className="text-sm font-bold text-gray-700">{plan.leaveUntil}</Text>)</> : null}. Se o clube cancelar o curso, você recebe tudo de volta.
            </Text>
            <Text className="text-sm text-gray-600">As inscrições fecham {CLASS_ENROLL_CUTOFF_HOURS}h antes da primeira aula.</Text>
          </View>

          {enrolled && (
            canLeaveWithRefund ? (
              <Pressable onPress={leave} disabled={busy} className="py-3 items-center">
                {busy ? <ActivityIndicator color={palette.red['600']} /> : <Text className="text-sm font-semibold text-red-600">Desistir do curso</Text>}
              </Pressable>
            ) : (
              <Text className="text-xs text-gray-400 text-center">O prazo para desistir com reembolso já passou. Fale com o clube.</Text>
            )
          )}

          {!!error && (
            <View className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <Text className="text-red-700 text-sm">{error}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {showBar && (
        <SafeAreaView edges={['bottom']} className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200">
          <View className="px-6 py-4">
            {left <= 0 ? (
              <Text className="text-center text-sm font-semibold text-gray-500 py-2">Curso lotado</Text>
            ) : !enrollOpen ? (
              <Text className="text-center text-sm font-semibold text-gray-500 py-2">Inscrições encerradas</Text>
            ) : (
              <>
                <View className="flex-row items-baseline justify-between mb-2">
                  <Text className="text-sm text-gray-500">Curso {formatBRL(Number(cls.price))} + taxa {formatBRL(fee)}</Text>
                  <Text className="text-lg font-bold text-gray-900">{formatBRL(total)}</Text>
                </View>
                {plan && (
                  <Text className="text-xs text-gray-500 mb-2">
                    {plan.hold
                      ? <>O valor fica reservado no cartão e só é cobrado em <Text className="text-xs font-bold text-gray-700">{plan.chargeAt}</Text>. Desistência sem custo até {plan.leaveUntil}.</>
                      : <>A primeira aula é daqui a mais de 6 dias, então o valor é cobrado na hora. Desistência com reembolso total até {plan.leaveUntil}.</>}
                  </Text>
                )}
                <Pressable onPress={enroll} disabled={busy} className={`bg-violet-600 py-3.5 rounded-xl items-center ${busy ? 'opacity-60' : ''}`}>
                  {busy ? <ActivityIndicator color="#ffffff" /> : <Text className="text-white font-bold text-base">Inscrever-se · {formatBRL(total)}</Text>}
                </Pressable>
              </>
            )}
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}
