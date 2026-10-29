// Port of src/app/components/PaymentSuccess.tsx (web), server-side flow only:
// the game/booking/enrollment is created by the server (finalize-checkout /
// stripe-webhook); this screen polls for the result and shows it. Display data
// (court, date…) comes from the return URL and is never trusted for anything else.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Share2 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { getEnv } from '@/lib/env';
import palette from '../../../tailwind.palette';

type Params = {
  session_id?: string;
  mode?: string;
  courtName?: string;
  venueName?: string;
  date?: string;
  time?: string;
  endTime?: string;
  price?: string;
  maxPlayers?: string;
  payMode?: string;
  playerName?: string;
};

type Result = { kind: string; gameId: string | null };

const POLL_MS = 1500;
const DEADLINE_MS = 30_000;

const formatDate = (iso?: string) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : iso ?? '';

export default function PaymentSuccess() {
  const p = useLocalSearchParams<Params>();
  const qc = useQueryClient();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const sessionId = p.session_id ?? '';
    if (!sessionId.startsWith('cs_')) return; // shown as an error during render
    let cancelled = false;
    const deadline = Date.now() + DEADLINE_MS;
    (async () => {
      while (!cancelled) {
        const { data } = await supabase.functions.invoke('finalize-checkout', { body: { sessionId } });
        if (cancelled) return;
        if (data?.status === 'done') {
          setResult({ kind: data.kind, gameId: data.gameId ?? null });
          // Lists that show this purchase must refetch.
          qc.invalidateQueries();
          return;
        }
        if (data?.status === 'failed') {
          setError(`${data.error ?? 'Não foi possível concluir.'} O valor foi liberado no seu cartão.`);
          return;
        }
        if (data?.error && !data?.status) {
          setError(String(data.error));
          return;
        }
        if (Date.now() > deadline) {
          setError('Seu pagamento foi recebido e ainda está sendo processado. Em alguns instantes ele aparece em Minhas Reservas.');
          return;
        }
        await new Promise(r => setTimeout(r, POLL_MS));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p.session_id, qc]);

  const goHome = () => router.replace('/');
  const openGame = (id: string) => router.replace({ pathname: '/game/[id]', params: { id } });

  const shownError = (p.session_id ?? '').startsWith('cs_') ? error : 'Não encontramos este pagamento. Confira em Minhas Reservas.';
  if (shownError) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-red-500 font-semibold mb-4 text-center text-base">{shownError}</Text>
        <Pressable onPress={goHome}>
          <Text className="text-violet-600 font-semibold">Voltar</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!result) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center gap-4">
        <ActivityIndicator size="large" color={palette.violet['600']} />
        <Text className="text-gray-600 font-semibold">Confirmando pagamento...</Text>
      </SafeAreaView>
    );
  }

  const when = [formatDate(p.date), p.time ? `${p.time}${p.endTime ? ` – ${p.endTime}` : ''}` : ''].filter(Boolean);

  // ── PRIVATE GAME ──
  if (result.kind === 'private_game') {
    const split = p.payMode === 'split';
    const shareUrl = result.gameId ? `${getEnv().webUrl}/open-game/${result.gameId}` : null;
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <ScrollView contentContainerClassName="flex-grow items-center justify-center px-6 py-8">
          <View className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 w-full gap-6">
            <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center self-center">
              <CheckCircle size={36} color={palette.green['600']} />
            </View>
            <View className="items-center">
              <Text className="text-2xl font-bold text-gray-900 mb-2">Partida criada!</Text>
              <Text className="text-gray-500 text-sm text-center">
                {split
                  ? 'Compartilhe o link abaixo para os outros jogadores confirmarem o pagamento deles.'
                  : 'Sua partida privada está confirmada. Compartilhe com seus amigos!'}
              </Text>
            </View>
            {(p.courtName || p.venueName || when.length > 0) && (
              <View className="bg-gray-50 rounded-2xl p-4 border border-gray-100 gap-2">
                {!!p.courtName && <Text className="font-semibold text-gray-900 text-sm">{p.courtName}</Text>}
                {!!p.venueName && <Text className="text-gray-500 text-sm">{p.venueName}</Text>}
                {when.map(w => (
                  <Text key={w} className="text-gray-600 text-sm capitalize">{w}</Text>
                ))}
                <View className="pt-1 border-t border-gray-200">
                  <Text className="text-gray-500 text-sm">
                    {p.maxPlayers ? `${p.maxPlayers} jogadores · ` : ''}{split ? 'Divisão' : 'Você pagou tudo'}
                  </Text>
                </View>
                {!!p.price && <Text className="font-bold text-violet-600 text-sm">R$ {Number(p.price).toFixed(2)} retidos no cartão</Text>}
              </View>
            )}
            {shareUrl && (
              <Pressable
                onPress={() => Share.share({ message: `Partida privada no JoggaHub\n${shareUrl}` }).catch(() => {})}
                className="w-full flex-row items-center justify-center gap-2 py-3 rounded-2xl border-2 border-violet-500"
              >
                <Share2 size={20} color={palette.violet['700']} />
                <Text className="text-violet-700 font-bold text-base">Compartilhar partida</Text>
              </Pressable>
            )}
            <View className="gap-2">
              {result.gameId && (
                <Pressable onPress={() => openGame(result.gameId!)} className="w-full bg-violet-600 py-4 rounded-2xl items-center active:bg-violet-700">
                  <Text className="text-white font-bold text-base">Ver minha partida</Text>
                </Pressable>
              )}
              <Pressable onPress={goHome} className="w-full bg-gray-100 py-3 rounded-2xl items-center">
                <Text className="text-gray-700 font-semibold text-base">Ir para o início</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── GAME (organizer / join / pay reservation) ──
  const message =
    result.kind === 'organizer'
      ? 'Sua partida foi criada e está aberta para outros jogadores!'
      : result.kind === 'pay_reservation'
        ? 'Seu pagamento foi confirmado. Sua vaga na partida está garantida.'
        : p.mode === 'join_other'
          ? `${p.playerName ?? 'O jogador'} foi adicionado à partida com sucesso.`
          : 'Você está inscrito na partida. Boa sorte!';
  return (
    <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-6">
      <View className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 w-full items-center">
        <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-4">
          <CheckCircle size={36} color={palette.green['600']} />
        </View>
        <Text className="text-2xl font-bold text-gray-900 mb-2">Pagamento confirmado!</Text>
        <Text className="text-gray-500 text-sm mb-8 text-center">{message}</Text>
        {result.gameId ? (
          <Pressable onPress={() => openGame(result.gameId!)} className="w-full bg-violet-600 py-4 rounded-2xl items-center active:bg-violet-700">
            <Text className="text-white font-bold text-base">Ver partida</Text>
          </Pressable>
        ) : (
          <Pressable onPress={goHome} className="w-full bg-violet-600 py-4 rounded-2xl items-center active:bg-violet-700">
            <Text className="text-white font-bold text-base">Ir para o início</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
