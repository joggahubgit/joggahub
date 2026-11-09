// Port of src/app/components/OpenGameReview.tsx (web).
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle, ChevronDown, ChevronUp, Clock, MapPin, ShieldCheck, Users, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { calcFees, startCheckout } from '@/features/payments/checkout';
import { ScheduledHoldNotice } from '@/features/payments/scheduled';
import palette from '../../../tailwind.palette';
import { formatBRL } from '@/lib/shared';

type Params = {
  slotId: string;
  courtId: string;
  courtName: string;
  courtSport: string;
  venueName: string;
  date: string;
  time: string;
  endTime: string;
  totalPrice: string;
  maxPlayers: string;
  minPlayers: string;
};

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', society: 'Society', futsal: 'Futsal', tennis: 'Tênis', padel: 'Padel',
  basketball: 'Basquete', volleyball: 'Vôlei', beach_tennis: 'Beach Tennis', futevolei: 'Futevôlei',
};
const sportLabel = (s: string) => SPORT_LABELS[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function OpenGameReview() {
  const p = useLocalSearchParams<Params>();
  const [policyExpanded, setPolicyExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const totalPrice = Number(p.totalPrice) || 0;
  const minPlayers = Number(p.minPlayers) || 1;
  const maxPlayers = Number(p.maxPlayers) || minPlayers;
  const pricePerPlayer = totalPrice / minPlayers;
  const { fee: serviceFee, total } = calcFees(pricePerPlayer);

  const [sh, sm] = (p.time ?? '00:00').split(':').map(Number);
  const [eh, em] = (p.endTime ?? '00:00').split(':').map(Number);
  const durationMins = eh * 60 + em - (sh * 60 + sm);
  const durationLabel =
    durationMins >= 60
      ? durationMins % 60 === 0
        ? `${durationMins / 60}h`
        : `${Math.floor(durationMins / 60)}h${durationMins % 60}min`
      : `${durationMins}min`;

  async function handleConfirm() {
    setCreating(true);
    setError('');
    try {
      await startCheckout(
        'create-checkout-session',
        { mode: 'organizer', slotId: p.slotId, durationMins, maxPlayers, captureManual: true },
        { mode: 'organizer', courtName: p.courtName, venueName: p.venueName, date: p.date, time: p.time, endTime: p.endTime },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar pagamento.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <SafeAreaView edges={['top']} className="bg-white border-b border-gray-100">
        <View className="flex-row items-center justify-between px-5 pt-4 pb-4">
          <Text className="text-2xl font-bold text-gray-900">Revisão</Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fechar" className="p-2 rounded-full">
            <X size={24} color={palette.gray['700']} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 gap-4">
        {/* Match summary card */}
        <View className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <View className="p-5 flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-lg font-bold text-gray-900 capitalize">{formatDate(p.date)}</Text>
              <Text className="text-lg font-bold text-gray-900">
                {p.time} – {p.endTime}
              </Text>
              <View className="mt-2 gap-1">
                <Text className="text-sm text-gray-500">{sportLabel(p.courtSport)}</Text>
                <Text className="text-sm text-gray-500">{p.courtName}</Text>
                <View className="flex-row items-center gap-1">
                  <MapPin size={14} color={palette.gray['500']} />
                  <Text className="text-sm text-gray-500">{p.venueName}</Text>
                </View>
              </View>
            </View>
            <View className="items-center gap-1 pt-1">
              <Clock size={24} color={palette.gray['500']} />
              <Text className="text-sm font-semibold text-gray-500">{durationLabel}</Text>
            </View>
          </View>

          {/* Players bar */}
          <View className="border-t border-gray-100 px-5 py-4 bg-gray-50">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-2">
                <Users size={16} color={palette.gray['500']} />
                <Text className="text-sm font-semibold text-gray-700">{maxPlayers} jogadores</Text>
              </View>
              <Text className="text-sm text-gray-400">1/{maxPlayers} confirmado</Text>
            </View>
            <View className="flex-row gap-1">
              {Array.from({ length: maxPlayers }).map((_, i) => (
                <View key={i} className={`flex-1 h-1.5 rounded-full ${i === 0 ? 'bg-gray-900' : 'bg-gray-200'}`} />
              ))}
            </View>
            <Text className="text-xs text-gray-400 mt-2">{maxPlayers - 1} vagas abertas para outros jogadores</Text>
          </View>
        </View>

        {/* Price breakdown */}
        <View className="bg-white rounded-2xl border border-gray-200 p-5 gap-3">
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-600">Valor total da quadra</Text>
            <Text className="text-sm font-semibold text-gray-900">R$ {totalPrice}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-600">Dividido por {minPlayers} jogadores (mínimo)</Text>
            <Text className="text-sm font-semibold text-gray-900">{formatBRL(pricePerPlayer)}/pessoa</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-600">Taxa de serviço (8% + R$ 2,50)</Text>
            <Text className="text-sm font-semibold text-gray-900">{formatBRL(serviceFee)}</Text>
          </View>
          <View className="border-t border-gray-100 pt-3 flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="font-bold text-gray-900 text-base">Bloqueio no cartão</Text>
              <Text className="text-xs text-gray-400 mt-0.5">O valor cobrado será proporcional aos jogadores confirmados</Text>
            </View>
            <Text className="text-2xl font-bold text-violet-600">{formatBRL(total)}</Text>
          </View>
        </View>

        {!!p.date && !!p.time && <ScheduledHoldNotice startIso={`${p.date}T${p.time}`} amount={total} chargeText="cobrado 2h antes da partida; pode ficar menor se mais jogadores entrarem" />}

        {/* Cancellation policy */}
        <View className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <Pressable onPress={() => setPolicyExpanded(e => !e)} className="flex-row items-center justify-between px-5 py-4">
            <View className="flex-row items-center gap-3">
              <ShieldCheck size={20} color={palette.gray['500']} />
              <Text className="font-semibold text-gray-900 text-sm">Política de Cancelamento</Text>
            </View>
            {policyExpanded ? <ChevronUp size={20} color={palette.gray['400']} /> : <ChevronDown size={20} color={palette.gray['400']} />}
          </Pressable>
          {policyExpanded && (
            <View className="px-5 pb-5 gap-4 border-t border-gray-100 pt-4">
              <View>
                <Text className="font-bold text-gray-900 mb-2 text-base">Antes do mínimo de jogadores ser atingido</Text>
                <Text className="text-sm text-gray-500 leading-relaxed">
                  A partida fica pendente. Se não atingir o mínimo de {minPlayers} jogadores até 2h antes do início, será cancelada automaticamente e você receberá o reembolso integral.
                </Text>
              </View>
              <View>
                <Text className="font-bold text-gray-900 mb-2 text-base">Após o mínimo ser atingido</Text>
                <Text className="text-sm text-gray-500 leading-relaxed">
                  Você pode cancelar sua vaga até 24 horas antes do início da partida e receber reembolso integral. Cancelamentos com menos de 24 horas de antecedência não são reembolsáveis.
                </Text>
              </View>
              <Text className="text-xs text-gray-400">Este serviço é provido pelo clube e sujeito às suas regras internas.</Text>
            </View>
          )}
        </View>

        {!!error && (
          <View className="bg-red-50 rounded-xl px-4 py-3 border border-red-100">
            <Text className="text-sm text-red-500">{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* CTA */}
      <SafeAreaView edges={['bottom']} className="px-5 pt-5 bg-white border-t border-gray-100">
        <Pressable
          onPress={handleConfirm}
          disabled={creating}
          className={`w-full bg-violet-600 py-4 rounded-2xl flex-row items-center justify-center gap-2 mb-5 active:bg-violet-700 ${creating ? 'opacity-60' : ''}`}
        >
          {creating ? <ActivityIndicator color="#ffffff" /> : <CheckCircle size={20} color="#ffffff" />}
          <Text className="text-white font-bold text-base">{creating ? 'Processando...' : `Garantir minha vaga · R$ ${total.toFixed(2)}`}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
