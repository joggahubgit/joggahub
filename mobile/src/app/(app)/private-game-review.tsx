// Port of src/app/components/PrivateGameReview.tsx (web).
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CalendarDays, ChevronRight, Clock, CreditCard, Lock, MapPin, Shield, Users } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { calcFees, startCheckout } from '@/features/payments/checkout';
import { getMaxPlayersForSport, getMinPlayersForSport } from '@/lib/shared';
import palette from '../../../tailwind.palette';

type Params = {
  slotId: string;
  courtId: string;
  courtName: string;
  venueName: string;
  courtSport: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  endTime: string; // HH:MM
  price: string; // court price for the session
  maxPlayers: string;
  payMode: 'split' | 'full';
};

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="w-8 h-8 bg-violet-100 rounded-lg items-center justify-center">{icon}</View>
      <View className="flex-1">{children}</View>
    </View>
  );
}

export default function PrivateGameReview() {
  const p = useLocalSearchParams<Params>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const courtPrice = Number(p.price) || 0;
  const minSplit = getMinPlayersForSport(p.courtSport ?? '');
  const maxSplit = getMaxPlayersForSport(p.courtSport ?? '');
  const players = Number(p.maxPlayers) || maxSplit;
  const split = p.payMode === 'split';

  // Split: the organizer holds the full court price; the display shows the minimum share.
  const myShare = split ? courtPrice / minSplit : courtPrice;
  const { base, fee, total } = calcFees(myShare);
  const { total: holdTotal } = calcFees(courtPrice);
  const durationMins = p.endTime && p.time ? toMins(p.endTime) - toMins(p.time) : 90;

  // Cutoff: split = 2h before (capture), full = 24h before (capture + cancel lock).
  const cutoffHours = split ? 2 : 24;
  const deadlineLabel = (() => {
    if (!p.date || !p.time) return '';
    const start = new Date(`${p.date}T${p.time}:00`);
    start.setHours(start.getHours() - cutoffHours);
    const dayMonth = start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    return `${dayMonth} às ${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  })();

  async function handleCheckout() {
    setLoading(true);
    setError('');
    try {
      await startCheckout(
        'create-slot-checkout-session',
        { slotId: p.slotId, courtId: p.courtId, durationMins, maxPlayers: players, payMode: p.payMode },
        {
          mode: 'private_game',
          courtName: p.courtName,
          venueName: p.venueName,
          date: p.date,
          time: p.time,
          endTime: p.endTime,
          maxPlayers: split ? maxSplit : players,
          payMode: p.payMode,
          price: holdTotal.toFixed(2),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar pagamento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="pb-8">
        {/* Header */}
        <View className="bg-violet-600 px-6 pb-6">
          <SafeAreaView edges={['top']}>
            <Pressable onPress={() => router.back()} className="mt-4 mb-4 flex-row items-center gap-2 opacity-80">
              <ArrowLeft size={20} color="#ffffff" />
              <Text className="text-sm font-medium text-white">Voltar</Text>
            </Pressable>
            <View className="flex-row items-center gap-2 mb-1">
              <Lock size={16} color="#ffffff" style={{ opacity: 0.8 }} />
              <Text className="text-xs font-bold uppercase tracking-widest text-white opacity-70">Revisão · Partida Privada</Text>
            </View>
            <Text className="text-2xl font-bold text-white">{p.courtName}</Text>
            {!!p.venueName && (
              <View className="flex-row items-center gap-1 mt-1 opacity-75">
                <MapPin size={14} color="#ffffff" />
                <Text className="text-sm text-white">{p.venueName}</Text>
              </View>
            )}
          </SafeAreaView>
        </View>

        <View className="px-5 py-6 gap-4">
          {/* Game details card */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <View className="px-5 py-4 border-b border-gray-100 gap-3">
              <Text className="text-xs font-bold text-gray-400 uppercase tracking-wide">Detalhes da partida</Text>
              {!!p.date && (
                <Row icon={<CalendarDays size={16} color={palette.violet['600']} />}>
                  <Text className="text-sm font-semibold text-gray-800 capitalize">{formatDate(p.date)}</Text>
                </Row>
              )}
              {!!p.time && (
                <Row icon={<Clock size={16} color={palette.violet['600']} />}>
                  <Text className="text-sm font-semibold text-gray-800">
                    {p.time}
                    {p.endTime ? ` – ${p.endTime}` : ''}
                  </Text>
                </Row>
              )}
              <Row icon={<Users size={16} color={palette.violet['600']} />}>
                <Text className="text-sm font-semibold text-gray-800">
                  {split ? (minSplit === maxSplit ? `${minSplit} jogadores` : `Mínimo ${minSplit} · Máximo ${maxSplit} jogadores`) : `${players} jogadores`}
                </Text>
                <Text className="text-xs text-gray-400 mt-0.5">{split ? 'Mais jogadores = menos por pessoa' : 'Você paga o valor completo'}</Text>
              </Row>
            </View>

            {/* Price breakdown */}
            <View className="px-5 py-4 gap-2">
              <Text className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Resumo de valores</Text>
              {split ? (
                <>
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-gray-600">Valor da quadra</Text>
                    <Text className="text-sm font-semibold text-gray-900">R$ {courtPrice.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-gray-600">Sua parte mínima (÷ {minSplit})</Text>
                    <Text className="text-sm font-semibold text-gray-900">R$ {base.toFixed(2)}</Text>
                  </View>
                </>
              ) : (
                <View className="flex-row justify-between">
                  <Text className="text-sm text-gray-600">Valor da quadra</Text>
                  <Text className="text-sm font-semibold text-gray-900">R$ {base.toFixed(2)}</Text>
                </View>
              )}
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-600">Taxa de serviço (8% + R$ 2,50)</Text>
                <Text className="text-sm font-semibold text-gray-900">R$ {fee.toFixed(2)}</Text>
              </View>
              <View className="flex-row justify-between pt-3 mt-1 border-t border-gray-100">
                <View>
                  <Text className="font-bold text-gray-900 text-base">Bloqueio no cartão</Text>
                  {!split && <Text className="text-xs text-gray-400 mt-0.5">Cobrado 24h antes da partida</Text>}
                </View>
                <View className="items-end">
                  <Text className="text-xl font-black text-violet-600">R$ {(split ? total : holdTotal).toFixed(2)}</Text>
                  {split && <Text className="text-xs text-gray-400 mt-0.5">R$ {holdTotal.toFixed(2)} retidos como garantia</Text>}
                </View>
              </View>
            </View>
          </View>

          {/* Hold info */}
          <View className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100 gap-1.5">
            <Text className="text-xs text-blue-900 leading-relaxed">
              Retemos <Text className="text-xs font-bold text-blue-900">R$ {holdTotal.toFixed(2)}</Text> no seu cartão como garantia.{' '}
              {split
                ? 'Outros jogadores entram via link e cada um autoriza sua parte mínima.'
                : 'A cobrança acontece apenas 24h antes da partida.'}
            </Text>
            {!!deadlineLabel && (
              <Text className="text-xs text-blue-700 leading-relaxed">
                {split ? '2h antes do jogo (' : 'Cobrança e bloqueio de cancelamento: '}
                <Text className="text-xs font-bold text-blue-700">{deadlineLabel}</Text>
                {split ? ') o valor é ajustado pelo número real de jogadores e cobrado de cada um.' : '.'}
              </Text>
            )}
          </View>

          {/* Security badge */}
          <View className="bg-violet-50 rounded-2xl p-4 border border-violet-100 flex-row items-start gap-3">
            <Shield size={20} color={palette.violet['600']} />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-violet-800">Pagamento 100% seguro</Text>
              <Text className="text-xs text-violet-600 mt-0.5">Processado pelo Stripe. Seus dados são criptografados e protegidos.</Text>
            </View>
          </View>

          <View className="flex-row items-center justify-center gap-2">
            <CreditCard size={16} color={palette.gray['400']} />
            <Text className="text-xs font-medium text-gray-400">Cartão de crédito · Débito</Text>
          </View>

          {!!error && (
            <View className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <Text className="text-red-700 text-sm">{error}</Text>
            </View>
          )}

          {/* CTA */}
          <Pressable
            onPress={handleCheckout}
            disabled={loading}
            className={`w-full bg-violet-600 py-4 rounded-2xl flex-row items-center justify-center gap-2 shadow-lg active:bg-violet-700 ${loading ? 'opacity-60' : ''}`}
          >
            {loading ? (
              <>
                <ActivityIndicator color="#ffffff" />
                <Text className="text-white font-bold text-lg">Aguarde...</Text>
              </>
            ) : (
              <>
                <CreditCard size={20} color="#ffffff" />
                <Text className="text-white font-bold text-lg">Garantir reserva · R$ {holdTotal.toFixed(2)}</Text>
                <ChevronRight size={20} color="#ffffff" />
              </>
            )}
          </Pressable>

          <Text className="text-center text-xs text-gray-400">Você será levado à página segura do Stripe</Text>
          <Text className="text-center text-xs text-gray-400 -mt-2">
            R$ {holdTotal.toFixed(2)} retidos agora · cobrança real {split ? '2h antes' : '24h antes'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
