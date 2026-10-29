// Port of src/app/components/JoinGameReview.tsx (web): confirm joining yourself
// or adding another player (paid via checkout, or free via join-free-game).
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, ChevronDown, ChevronUp, Clock, Lock, MapPin, ShieldCheck, Users, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { calcFees, startCheckout } from '@/features/payments/checkout';
import { supabase } from '@/lib/supabase';
import palette from '../../../tailwind.palette';

type Params = {
  gameId: string;
  playerId: string;
  playerName: string;
  courtName: string;
  courtSport: string;
  venueName: string;
  date: string;
  time: string;
  endTime: string;
  pricePerPlayer: string;
  mode: 'join_self' | 'join_other';
  isPrivate: string;
  gamePayMode: 'split' | 'full';
  currentPlayers: string;
  maxPlayers: string;
  team?: 'a' | 'b';
};

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', society: 'Society', futsal: 'Futsal', tennis: 'Tênis', padel: 'Padel',
  basketball: 'Basquete', volleyball: 'Vôlei', beach_tennis: 'Beach Tennis', futevolei: 'Futevôlei',
};
const sportLabel = (s: string) => SPORT_LABELS[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function JoinGameReview() {
  const p = useLocalSearchParams<Params>();
  const qc = useQueryClient();
  const [policyExpanded, setPolicyExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const isSelf = p.mode !== 'join_other';
  const isPrivate = p.isPrivate === 'true';
  const price = Number(p.pricePerPlayer) || 0;
  const isFree = (isPrivate && p.gamePayMode === 'full') || price === 0;
  const { fee, total } = calcFees(price);
  const current = Number(p.currentPlayers);
  const max = Number(p.maxPlayers);
  const spots = max - current;

  const toMins = (t?: string) => {
    const [h, m] = (t || '00:00').split(':').map(Number);
    return h * 60 + m;
  };
  const durationMins = toMins(p.endTime) - toMins(p.time);
  const durationLabel =
    durationMins > 0 ? (durationMins % 60 === 0 ? `${durationMins / 60}h` : `${Math.floor(durationMins / 60)}h${durationMins % 60}min`) : '';
  const firstName = (p.playerName ?? '').split(' ')[0];

  async function confirmFree() {
    setConfirming(true);
    setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('join-free-game', {
      body: { gameId: p.gameId, ...(isSelf ? {} : { targetPlayerId: p.playerId }), ...(p.team ? { team: p.team } : {}) },
    });
    if (fnErr || data?.error) {
      const body = await (fnErr as { context?: Response } | null)?.context?.json?.().catch(() => null);
      setError(body?.error ?? data?.error ?? 'Erro ao adicionar jogador');
      setConfirming(false);
      return;
    }
    // Refresh the cached game (and lists) so the new player shows up, then
    // return to the game screen underneath instead of stacking a second copy.
    await qc.invalidateQueries();
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/game/[id]', params: { id: p.gameId } });
  }

  async function confirmPaid() {
    setConfirming(true);
    setError('');
    try {
      await startCheckout(
        'create-checkout-session',
        {
          mode: isSelf ? 'join_self' : 'join_other',
          gameId: p.gameId,
          ...(isSelf ? {} : { targetPlayerId: p.playerId }),
          captureManual: true,
          ...(p.team ? { team: p.team } : {}),
        },
        { mode: p.mode, playerName: p.playerName, courtName: p.courtName, venueName: p.venueName, date: p.date, time: p.time, endTime: p.endTime },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar pagamento.');
    } finally {
      setConfirming(false);
    }
  }

  const cta = confirming
    ? 'Confirmando...'
    : isFree
      ? 'Confirmar entrada · Grátis'
      : isSelf
        ? `Pagar minha parte · R$ ${total.toFixed(2)}`
        : `Pagar vaga de ${firstName} · R$ ${total.toFixed(2)}`;

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-white border-b border-gray-100">
        <View className="flex-row items-center justify-between px-5 pt-4 pb-4">
          <Text className="text-2xl font-bold text-gray-900">Confirmar entrada</Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fechar" className="p-2 rounded-full">
            <X size={24} color={palette.gray['700']} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 gap-4">
        {isPrivate && (
          <View className="bg-gray-900 rounded-2xl px-5 py-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Lock size={16} color={palette.gray['400']} />
              <Text className="text-sm font-bold text-white">Partida Privada</Text>
            </View>
            {Number.isFinite(current) && Number.isFinite(max) && (
              <View className="flex-row items-center gap-1.5">
                <Users size={16} color={palette.gray['400']} />
                <Text className="text-sm font-semibold text-gray-300">
                  {current}/{max} jogadores
                </Text>
                {spots > 0 && (
                  <View className="ml-1 bg-amber-400 px-2 py-0.5 rounded-full">
                    <Text className="text-xs text-gray-900 font-bold">
                      {spots} {spots === 1 ? 'vaga' : 'vagas'}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Player */}
        <View className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex-row items-center gap-4">
          <View className="w-12 h-12 bg-violet-600 rounded-full items-center justify-center">
            <Text className="text-white font-bold text-xl">{(p.playerName ?? '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text className="text-xs text-gray-400 mb-0.5">{isSelf ? 'Confirmando sua entrada' : 'Adicionando jogador'}</Text>
            <Text className="font-bold text-gray-900 text-base">{p.playerName}</Text>
          </View>
        </View>

        {/* Match summary */}
        <View className="bg-white rounded-2xl border border-gray-200 p-5 flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900 capitalize">{formatDate(p.date)}</Text>
            <Text className="text-lg font-bold text-gray-900">
              {p.time}
              {p.endTime ? ` – ${p.endTime}` : ''}
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
          {!!durationLabel && (
            <View className="items-center gap-1 pt-1">
              <Clock size={24} color={palette.gray['500']} />
              <Text className="text-sm font-semibold text-gray-500">{durationLabel}</Text>
            </View>
          )}
        </View>

        {/* Price */}
        <View className="bg-white rounded-2xl border border-gray-200 p-5">
          {!isFree && (
            <View className="gap-2 mb-3">
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-600">Valor da vaga</Text>
                <Text className="text-sm font-semibold text-gray-900">R$ {price.toFixed(2)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-600">Taxa de serviço (8% + R$ 2,50)</Text>
                <Text className="text-sm font-semibold text-gray-900">R$ {fee.toFixed(2)}</Text>
              </View>
            </View>
          )}
          <View className="border-t border-gray-100 pt-3 flex-row items-center justify-between">
            <View>
              <Text className="font-bold text-gray-900 text-base">Total</Text>
              <Text className="text-xs text-gray-400 mt-0.5">{isFree ? 'Organizador pagou a quadra completa' : 'Inclui taxa de serviço'}</Text>
            </View>
            {isFree ? (
              <Text className="text-2xl font-bold text-green-600">Grátis</Text>
            ) : (
              <Text className="text-2xl font-bold text-violet-600">R$ {total.toFixed(2)}</Text>
            )}
          </View>
        </View>

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
            <View className="px-5 pb-5 gap-3 border-t border-gray-100 pt-4">
              <Text className="text-sm text-gray-500 leading-relaxed">Cancelamentos com menos de 24 horas de antecedência não são reembolsáveis.</Text>
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

      <SafeAreaView edges={['bottom']} className="px-5 pt-5 bg-white border-t border-gray-100">
        <Pressable
          onPress={isFree ? confirmFree : confirmPaid}
          disabled={confirming}
          className={`w-full bg-violet-600 py-4 rounded-2xl flex-row items-center justify-center gap-2 mb-5 active:bg-violet-700 ${confirming ? 'opacity-60' : ''}`}
        >
          {confirming ? <ActivityIndicator color="#ffffff" /> : <CheckCircle size={20} color="#ffffff" />}
          <Text className="text-white font-bold text-base">{cta}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
