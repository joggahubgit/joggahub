// Port of src/app/components/OpenGamePage.tsx (web).
// Every money action runs in the app: join (paid/free), add player, pay a venue
// reservation (server-side checkout), and leave / remove / cancel (refunds by
// leave-game / cancel-game on the server).
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, CheckCircle, Clock, Copy, Crown, Lock, MapPin, MessageCircle, Search, Share2, Shield, Trash2, X, Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchGameDetail, type GameDetail, type GamePlayer } from '@/features/games/api';
import { GameResultSubmit } from '@/features/results/GameResultSubmit';
import { calcFees, startCheckout } from '@/features/payments/checkout';
import { getEnv } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { confirmAction } from '@/lib/confirm';
import { PLAYER_CANCEL_CUTOFF_HOURS } from '@/lib/shared';
import palette from '../../../../tailwind.palette';

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', society: 'Society', futsal: 'Futsal', tennis: 'Tênis', padel: 'Padel',
  basketball: 'Basquete', volleyball: 'Vôlei', beach_tennis: 'Beach Tennis', futevolei: 'Futevôlei',
};
const sportLabel = (s: string) => SPORT_LABELS[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

function shareMessage(g: GameDetail, date: string, time: string, endTime: string, url: string) {
  const when = `🕐 ${time}${endTime ? ` – ${endTime}` : ''}`;
  if (g.isPrivate) {
    return ['🔒 Partida privada no JoggaHub!', '', `🏟️ ${sportLabel(g.sport)}`, `📅 ${formatDate(date)}`, when, `📍 ${g.courtName} · ${g.venueName}`, '', 'Acesse pelo link para confirmar sua presença:', url].join('\n');
  }
  const remaining = g.maxPlayers - g.currentPlayers;
  return [
    '⚽ Partida aberta no JoggaHub!',
    '',
    `🏟️ ${sportLabel(g.sport)}`,
    `📅 ${formatDate(date)}`,
    when,
    `📍 ${g.courtName} · ${g.venueName}`,
    `💰 R$ ${g.pricePerPlayer}/pessoa`,
    '',
    `👥 Jogadores (${g.currentPlayers}/${g.maxPlayers}):`,
    g.players.map(p => `✅ ${p.name}`).join('\n'),
    '',
    remaining > 0 ? `Ainda há ${remaining} ${remaining === 1 ? 'vaga' : 'vagas'}! Entre pelo JoggaHub para participar:` : 'Partida completa! Acompanhe pelo link:',
    url,
  ].join('\n');
}

function SheetButtons({ onBack, confirm }: { onBack: () => void; confirm?: { label: string; className: string; onPress: () => void } }) {
  return (
    <View className="flex-row gap-3">
      <Pressable onPress={onBack} className="flex-1 py-4 rounded-2xl border-2 border-gray-200 items-center">
        <Text className="font-semibold text-gray-700 text-base">Voltar</Text>
      </Pressable>
      {confirm && (
        <Pressable onPress={confirm.onPress} className={`flex-1 py-4 rounded-2xl items-center ${confirm.className}`}>
          <Text className="text-white font-bold text-base">{confirm.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function OpenGamePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const q = useQuery({ queryKey: ['game', id], queryFn: () => fetchGameDetail(id), enabled: !!id });

  const [showShare, setShowShare] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showPlayerLeaveConfirm, setShowPlayerLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [pendingTeam, setPendingTeam] = useState<'a' | 'b'>('a');
  const [busy, setBusy] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goHome = () => router.replace('/');
  const webUrl = `${getEnv().webUrl}/open-game/${id}`;

  const header = (
    <SafeAreaView edges={['top']} className="bg-white border-b border-gray-100">
      <View className="flex-row items-center justify-between px-5 pt-4 pb-4">
        <Pressable onPress={() => (router.canGoBack() ? router.back() : goHome())} accessibilityRole="button" accessibilityLabel="Voltar" className="p-2 rounded-full">
          <ArrowLeft size={24} color={palette.gray['700']} />
        </Pressable>
        {q.data && !q.data.unavailable && (
          <Pressable onPress={() => setShowShare(true)} accessibilityRole="button" accessibilityLabel="Compartilhar" className="p-2 rounded-full">
            <Share2 size={24} color={palette.gray['700']} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );

  if (q.isPending) {
    return (
      <View className="flex-1 bg-white">
        {header}
        <View className="items-center py-32">
          <ActivityIndicator size="large" color={palette.violet['600']} />
        </View>
      </View>
    );
  }

  const g = q.data;
  if (!g || g.unavailable) {
    const cancelled = g?.unavailable === 'cancelled';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <View className="w-16 h-16 bg-red-100 rounded-full items-center justify-center">
            <X size={32} color={palette.red['500']} />
          </View>
          <View className="items-center">
            <Text className="text-xl font-bold text-gray-900 mb-2">
              {q.isError ? 'Não foi possível carregar' : cancelled ? 'Partida cancelada' : 'Partida encerrada'}
            </Text>
            <Text className="text-sm text-gray-500 leading-relaxed text-center">
              {q.isError
                ? 'Verifique sua conexão e tente de novo.'
                : cancelled
                  ? 'Esta partida foi cancelada e não está mais disponível.'
                  : 'Esta partida não tem mais jogadores ativos e não está mais disponível.'}
            </Text>
          </View>
          <Pressable onPress={() => (q.isError ? q.refetch() : goHome())} className="mt-4 bg-violet-600 px-6 py-3 rounded-2xl">
            <Text className="text-white font-semibold text-sm">{q.isError ? 'Tentar de novo' : 'Voltar ao início'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isOrganizer = !!userId && g.organizerId === userId;
  const isEnrolled = isOrganizer || g.players.some(p => p.id === userId && p.paid);
  const date = g.scheduledAt?.substring(0, 10) ?? '';
  const time = g.scheduledAt?.substring(11, 16) ?? '';
  const endTime = g.endAt?.substring(11, 16) ?? '';
  const { withinCancelCutoff, withinJoinCutoff } = g;
  const status = g.status;
  const spotsLeft = g.maxPlayers - g.currentPlayers;
  const players = g.players.map(p => ({ ...p, isCurrentUser: p.id === userId }));
  const display = { courtName: g.courtName, venueName: g.venueName, date, time, endTime };

  /** Paid join (open game, or private split game): hold the player's share. */
  const payToJoin = async (team: 'a' | 'b') => {
    setJoining(true);
    setJoinError('');
    try {
      await startCheckout(
        'create-checkout-session',
        { mode: 'join_self', gameId: g.id, captureManual: true, ...(g.sport === 'futevolei' ? { team } : {}) },
        { ...display, mode: 'join_self' },
      );
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Erro ao iniciar pagamento.');
    } finally {
      setJoining(false);
      q.refetch();
    }
  };

  /** Private game the organizer paid in full: joining is free (server enrolls). */
  const joinFree = async (team: 'a' | 'b') => {
    setJoining(true);
    setJoinError('');
    const { data, error } = await supabase.functions.invoke('join-free-game', {
      body: { gameId: g.id, ...(g.sport === 'futevolei' ? { team } : {}) },
    });
    if (error || data?.error) {
      const body = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
      setJoinError(body?.error ?? data?.error ?? 'Erro ao entrar na partida. Tente novamente.');
    }
    setJoining(false);
    q.refetch();
  };

  const payReservation = async () => {
    setJoining(true);
    setJoinError('');
    try {
      await startCheckout('create-checkout-session', { mode: 'pay_reservation', gameId: g.id }, { ...display, mode: 'pay_reservation' });
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Erro ao iniciar pagamento.');
    } finally {
      setJoining(false);
      q.refetch();
    }
  };

  // Same branching as the web's handleCircleClick.
  const onEmptySlot = (team: 'a' | 'b' = 'a') => {
    if (status === 'completed' || status === 'expired' || status === 'pending_results') return;
    if (withinJoinCutoff || joining) return;
    setPendingTeam(team);
    if (g.isPrivate && !isEnrolled && !isOrganizer) {
      if (g.payMode === 'full') joinFree(team);
      else payToJoin(team);
      return;
    }
    if (isEnrolled || isOrganizer) setShowAddPlayer(true);
    else setShowJoin(true);
  };

  const joinFees = calcFees(g.pricePerPlayer);

  /** leave-game / cancel-game: refunds and notifications happen on the server. */
  const runGameAction = async (fn: 'leave-game' | 'cancel-game', body: Record<string, unknown>, after: 'home' | 'refetch') => {
    setBusy(true);
    setJoinError('');
    const { data, error } = await supabase.functions.invoke(fn, { body: { gameId: g.id, ...body } });
    setBusy(false);
    setShowCancelConfirm(false);
    setShowLeaveConfirm(false);
    setShowPlayerLeaveConfirm(false);
    if (error || data?.error) {
      const ctx = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
      setJoinError(ctx?.error ?? data?.error ?? 'Não foi possível concluir. Tente novamente.');
      q.refetch();
      return;
    }
    if (after === 'home') goHome();
    else q.refetch();
  };

  const removePlayer = (player: GamePlayer) =>
    confirmAction({
      title: `Remover ${player.name.split(' ')[0]}?`,
      message: 'O jogador será removido da partida e o valor dele será estornado.',
      confirmText: 'Remover',
      destructive: true,
      onConfirm: () => runGameAction('leave-game', { targetPlayerId: player.id }, 'refetch'),
    });

  const closeAddPlayer = () => {
    setShowAddPlayer(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const onSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      // Only names: other players' phone numbers are not shown in the app.
      const { data } = await supabase.from('profiles').select('id, name').ilike('name', `%${text.trim()}%`).limit(8);
      const inGame = new Set(g.players.map(pl => pl.id));
      setSearchResults((data ?? []).filter(r => r.name && !inGame.has(r.id)) as { id: string; name: string }[]);
      setSearching(false);
    }, 300);
  };

  const selectPlayer = (pl: { id: string; name: string }) => {
    if (withinJoinCutoff) return;
    closeAddPlayer();
    router.push({
      pathname: '/join-game-review',
      params: {
        gameId: g.id,
        playerId: pl.id,
        playerName: pl.name,
        courtName: g.courtName,
        courtSport: g.sport,
        venueName: g.venueName,
        date,
        time,
        endTime,
        pricePerPlayer: String(g.pricePerPlayer),
        mode: 'join_other',
        isPrivate: String(g.isPrivate),
        gamePayMode: g.payMode,
        currentPlayers: String(g.currentPlayers),
        maxPlayers: String(g.maxPlayers),
        ...(g.sport === 'futevolei' ? { team: pendingTeam } : {}),
      },
    });
  };

  const renderSlot = (i: number, team?: 'a' | 'b') => {
    const player = players[i] as (GamePlayer & { isCurrentUser: boolean }) | undefined;
    const filled = i < g.currentPlayers;
    const canRemove = isOrganizer && filled && player && !player.isOrganizer && !withinCancelCutoff;
    const canSelfLeave = !isOrganizer && filled && player?.isCurrentUser && !withinCancelCutoff && (status === 'scheduled' || status === 'confirmed_booking');
    return (
      <View key={i} className="items-center gap-1" style={{ width: 56 }}>
        <View>
          {filled && player ? (
            <>
              <Pressable
                onPress={() => player.isOrganizer && isOrganizer && setShowLeaveConfirm(true)}
                className={`w-12 h-12 rounded-full items-center justify-center overflow-hidden ${player.paid ? 'bg-violet-600' : 'bg-gray-400'} ${player.isOrganizer && isOrganizer ? 'border-2 border-violet-300' : ''}`}
                accessibilityLabel={`${player.name}${player.isOrganizer ? ', organizador' : ''}`}
              >
                {player.avatarUrl ? (
                  <Image source={{ uri: player.avatarUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <Text className="text-white font-bold text-lg">{player.name.charAt(0).toUpperCase()}</Text>
                )}
              </Pressable>
              {player.isOrganizer && (
                <View className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-400 rounded-full items-center justify-center">
                  <Crown size={12} color={palette.yellow['900']} />
                </View>
              )}
              {(canRemove || canSelfLeave) && (
                <Pressable
                  onPress={() => (canSelfLeave ? setShowPlayerLeaveConfirm(true) : removePlayer(player))}
                  accessibilityLabel={canSelfLeave ? 'Sair da partida' : `Remover ${player.name}`}
                  hitSlop={6}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full items-center justify-center"
                >
                  <X size={12} color="#ffffff" />
                </Pressable>
              )}
            </>
          ) : filled ? (
            <View className="w-12 h-12 bg-gray-300 rounded-full items-center justify-center">
              <Text className="text-white font-bold text-lg">?</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => onEmptySlot(team)}
              disabled={joining}
              accessibilityRole="button"
              accessibilityLabel={isEnrolled ? 'Adicionar jogador' : 'Entrar na partida'}
              className="w-12 h-12 rounded-full border-2 border-dashed border-violet-300 items-center justify-center active:bg-violet-100"
            >
              <Text className="text-xl text-violet-400">+</Text>
            </Pressable>
          )}
        </View>
        {filled && player ? (
          <View className="items-center gap-0.5">
            <Text className="text-xs text-gray-700 font-semibold text-center w-14" numberOfLines={1}>
              {player.name.split(' ')[0]}
            </Text>
            {player.isOrganizer ? (
              <Text className="text-[10px] font-semibold text-yellow-600">Org.</Text>
            ) : (
              <Text className={`text-[10px] font-semibold ${player.paid ? 'text-green-600' : 'text-amber-500'}`}>{player.paid ? 'Pago' : 'Pendente'}</Text>
            )}
          </View>
        ) : (
          <Text className="text-[10px] text-gray-300">vaga</Text>
        )}
      </View>
    );
  };

  const playersGrid = () => {
    if (g.sport === 'futevolei' && g.maxPlayers === 4) {
      const teamA = players.map((p, i) => ({ p, i })).filter(x => (x.p.team ?? 'a') === 'a').map(x => x.i);
      const teamB = players.map((p, i) => ({ p, i })).filter(x => x.p.team === 'b').map(x => x.i);
      let next = g.currentPlayers;
      const emptyA = Array.from({ length: Math.max(0, 2 - teamA.length) }, () => next++);
      const emptyB = Array.from({ length: Math.max(0, 2 - teamB.length) }, () => next++);
      return (
        <View className="flex-row gap-4">
          {[
            { label: 'Time A', team: 'a' as const, cls: 'text-violet-600', idx: [...teamA, ...emptyA] },
            { label: 'Time B', team: 'b' as const, cls: 'text-gray-500', idx: [...teamB, ...emptyB] },
          ].map(t => (
            <View key={t.label} className="flex-1">
              <Text className={`text-xs font-bold uppercase tracking-wide mb-2 text-center ${t.cls}`}>{t.label}</Text>
              <View className="flex-row flex-wrap justify-center gap-3">{t.idx.map(i => renderSlot(i, t.team))}</View>
            </View>
          ))}
        </View>
      );
    }
    return <View className="flex-row flex-wrap gap-3">{Array.from({ length: g.maxPlayers }).map((_, i) => renderSlot(i))}</View>;
  };

  const msg = shareMessage(g, date, time, endTime, webUrl);

  return (
    <View className="flex-1 bg-white">
      {header}
      <ScrollView
        contentContainerClassName="pb-24"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={palette.violet['600']} />}
      >
        {/* Futevôlei: real result registration — stays visible after completion so the scoreboard doesn't disappear */}
        {(status === 'pending_results' || status === 'completed') && g.sport === 'futevolei' && isEnrolled && (
          <GameResultSubmit gameId={g.id} players={g.players.map(p => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl }))} currentUserId={userId} />
        )}

        {status === 'pending_results' && g.sport !== 'futevolei' && isOrganizer && (
          <View className="mx-5 mt-4 bg-orange-50 border border-orange-300 rounded-2xl px-4 py-3 flex-row items-center gap-3">
            <Zap size={20} color={palette.orange['500']} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-orange-800">Partida encerrada — registre os dados</Text>
              <Text className="text-xs text-orange-600 mt-0.5">Você tem até 12h para registrar o MVP. Após isso o XP não será contado.</Text>
            </View>
          </View>
        )}
        {status === 'pending_results' && g.sport !== 'futevolei' && isEnrolled && !isOrganizer && (
          <View className="mx-5 mt-4 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 flex-row items-center gap-3">
            <Zap size={20} color={palette.amber['500']} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-amber-800">Vote no melhor jogador!</Text>
              <Text className="text-xs text-amber-600 mt-0.5">Você tem até 12h para votar. O MVP ganha +30 XP.</Text>
            </View>
          </View>
        )}

        {isOrganizer && !g.organizerPaid && g.pricePerPlayer > 0 && (
          <View className="mx-5 mt-4 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-4">
            <View className="flex-row items-start gap-3 mb-3">
              <Clock size={20} color={palette.amber['500']} />
              <View className="flex-1">
                <Text className="font-bold text-amber-800 text-base">Pagamento pendente</Text>
                <Text className="text-sm text-amber-700 mt-0.5">
                  O clube reservou este horário para você. Complete o pagamento para confirmar sua vaga. Você tem 2 horas a partir da reserva.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={payReservation}
              disabled={joining}
              className={`w-full bg-amber-500 py-3 rounded-xl items-center active:bg-amber-600 ${joining ? 'opacity-60' : ''}`}
            >
              <Text className="text-white font-bold text-base">{joining ? 'Aguarde...' : `Pagar R$ ${joinFees.total.toFixed(2)} e confirmar vaga`}</Text>
            </Pressable>
          </View>
        )}

        {isEnrolled && status === 'scheduled' && (
          <View className="mx-5 mt-4 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex-row items-center gap-3">
            <CheckCircle size={20} color={palette.violet['600']} />
            <Text className="text-sm font-semibold text-violet-700">Você está inscrito nesta partida</Text>
          </View>
        )}
        {isEnrolled && status === 'confirmed_booking' && (
          <View className="mx-5 mt-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex-row items-center gap-3">
            <CheckCircle size={20} color={palette.green['600']} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-green-700">Reserva confirmada!</Text>
              {withinCancelCutoff && (
                <Text className="text-xs text-green-600 mt-0.5">Faltam menos de {PLAYER_CANCEL_CUTOFF_HOURS}h — cancelamento apenas pelo clube.</Text>
              )}
            </View>
          </View>
        )}

        {/* Match info card */}
        <View className="mx-5 mt-4 border border-gray-200 rounded-2xl p-5">
          <View className="pb-4 border-b border-gray-100">
            <Text className="text-2xl font-bold text-gray-900">{sportLabel(g.sport)}</Text>
            {!!date && (
              <Text className="text-sm text-gray-500 mt-1">
                {formatDate(date).replace(/^./, c => c.toUpperCase())}
                {time ? `, ${time}` : ''}
                {endTime ? ` – ${endTime}` : ''}
              </Text>
            )}
          </View>
          <View className="flex-row pt-4">
            <View className="flex-1 items-center">
              <Text className="text-xs text-gray-400 mb-1">Gênero</Text>
              <Text className="text-sm font-bold text-gray-900">Todos</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-xs text-gray-400 mb-1">Nível</Text>
              <Text className="text-sm font-bold text-gray-900">Aberto</Text>
            </View>
            <View className="flex-1 items-center">
              {(!g.isPrivate || g.pricePerPlayer > 0) && (
                <>
                  <Text className="text-xs text-gray-400 mb-1">Valor</Text>
                  <Text className="text-sm font-bold text-gray-900">R$ {g.pricePerPlayer}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Status badges */}
        <View className="mx-5 mt-3 flex-row gap-2 flex-wrap">
          {g.isPrivate && (
            <View className="flex-row items-center gap-1.5 bg-gray-900 rounded-2xl px-3 py-2">
              <Lock size={14} color="#ffffff" />
              <Text className="text-xs font-bold text-white">Partida Privada</Text>
            </View>
          )}
          {status === 'scheduled' && (
            <View className="flex-row items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
              <Clock size={14} color={palette.amber['600']} />
              <Text className="text-xs font-bold text-amber-700">{g.isPrivate ? 'Agendada' : 'Aguardando jogadores'}</Text>
            </View>
          )}
          {status === 'confirmed_booking' && (
            <View className="flex-row items-center gap-1.5 bg-green-50 border border-green-300 rounded-2xl px-3 py-2">
              <CheckCircle size={14} color={palette.green['600']} />
              <Text className="text-xs font-bold text-green-700">Reserva confirmada</Text>
            </View>
          )}
          {status === 'pending_results' && (
            <View className="flex-row items-center gap-1.5 bg-orange-50 border border-orange-300 rounded-2xl px-3 py-2">
              <Zap size={14} color={palette.orange['600']} />
              <Text className="text-xs font-bold text-orange-700">Aguardando dados</Text>
            </View>
          )}
          {status === 'completed' && (
            <View className="flex-row items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-2xl px-3 py-2">
              <CheckCircle size={14} color={palette.gray['500']} />
              <Text className="text-xs font-bold text-gray-600">Encerrada</Text>
            </View>
          )}
        </View>

        {!!joinError && (
          <View className="mx-5 mt-3 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
            <Text className="text-sm text-red-500">{joinError}</Text>
          </View>
        )}
        {joining && (
          <View className="mx-5 mt-3 flex-row items-center justify-center gap-2 py-2">
            <ActivityIndicator color={palette.violet['600']} />
            <Text className="text-sm text-gray-500">Aguarde...</Text>
          </View>
        )}

        {/* Players */}
        <View className="mx-5 mt-3 border border-gray-200 rounded-2xl p-5">
          <View className="flex-row items-center justify-between mb-5">
            <Text className="font-bold text-gray-900 text-base">Jogadores</Text>
            <View className="flex-row items-center gap-2">
              {spotsLeft > 0 && (
                <View className="bg-amber-100 px-2 py-1 rounded-full">
                  <Text className="text-xs text-amber-700 font-semibold">
                    {spotsLeft} {spotsLeft === 1 ? 'vaga' : 'vagas'}
                  </Text>
                </View>
              )}
              <Text className="text-sm text-gray-400">
                {g.currentPlayers}/{g.maxPlayers}
              </Text>
            </View>
          </View>
          {playersGrid()}
        </View>

        {/* Actions */}
        <View className="mx-5 mt-3 flex-row gap-3">
          <Pressable onPress={goHome} className="flex-1 flex-row items-center justify-center gap-2 border-2 border-gray-200 rounded-2xl py-3.5">
            <Calendar size={20} color={palette.gray['700']} />
            <Text className="font-semibold text-gray-700 text-sm">Calendário</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/game-chat/[id]', params: { id: g.id } })}
            className="flex-1 flex-row items-center justify-center gap-2 bg-violet-600 rounded-2xl py-3.5 active:bg-violet-700"
          >
            <MessageCircle size={20} color="#ffffff" />
            <Text className="font-semibold text-white text-sm">Chat</Text>
          </Pressable>
        </View>

        {/* Venue card */}
        {!!(g.venueName || g.courtName) && (
          <View className="mx-5 mt-3 border border-gray-200 rounded-2xl p-4 flex-row items-center gap-3">
            <View className="w-12 h-12 bg-green-100 rounded-xl items-center justify-center">
              <MapPin size={24} color={palette.green['600']} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-gray-900 text-sm" numberOfLines={1}>
                {g.venueName}
              </Text>
              <Text className="text-xs text-gray-500" numberOfLines={1}>
                {g.courtName}
              </Text>
              <Text className="text-xs text-violet-600 font-semibold">Mais informações →</Text>
            </View>
            <Pressable onPress={() => setShowShare(true)} accessibilityLabel="Compartilhar" className="w-10 h-10 bg-violet-600 rounded-full items-center justify-center">
              <Share2 size={16} color="#ffffff" />
            </Pressable>
          </View>
        )}

        {/* Cancel game — organizer only */}
        {isOrganizer && status !== 'completed' && status !== 'expired' && (
          <View className="mx-5 mt-3">
            {withinCancelCutoff ? (
              <View className="w-full flex-row items-center gap-3 border-2 border-gray-200 rounded-2xl px-4 py-3.5 bg-gray-50">
                <Shield size={16} color={palette.gray['400']} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-500">Cancelamento bloqueado</Text>
                  <Text className="text-xs text-gray-400">Faltam menos de {PLAYER_CANCEL_CUTOFF_HOURS}h. Contate o clube.</Text>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setShowCancelConfirm(true)} className="w-full flex-row items-center justify-center gap-2 border-2 border-red-200 rounded-2xl py-3.5 active:bg-red-50">
                <Trash2 size={16} color={palette.red['500']} />
                <Text className="text-red-500 font-semibold text-sm">Cancelar partida</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Invite CTA */}
        {spotsLeft > 0 && !g.isPrivate && (
          <View className="mx-5 mt-3 bg-violet-600 rounded-2xl p-5">
            <Text className="font-bold text-white text-base mb-1">Divulgue sua partida!</Text>
            <Text className="text-sm text-violet-100 mb-4">
              Faltam {spotsLeft} {spotsLeft === 1 ? 'jogador' : 'jogadores'} para completar
            </Text>
            <Pressable onPress={() => setShowShare(true)} className="w-full bg-white py-3 rounded-xl flex-row items-center justify-center gap-2 active:bg-violet-50">
              <Share2 size={16} color={palette.violet['600']} />
              <Text className="text-violet-600 font-semibold text-sm">Compartilhar partida</Text>
            </Pressable>
          </View>
        )}

        {g.isPrivate && isOrganizer && spotsLeft > 0 && (
          <View className="mx-5 mt-3 bg-gray-900 rounded-2xl p-5">
            <View className="flex-row items-center gap-2 mb-1">
              <Lock size={16} color={palette.gray['400']} />
              <Text className="font-bold text-white text-base">Partida privada</Text>
            </View>
            <Text className="text-sm text-gray-400 mb-4">Compartilhe o link com seus jogadores para que eles possam pagar a parte deles.</Text>
            <Pressable onPress={() => setShowShare(true)} className="w-full bg-white py-3 rounded-xl flex-row items-center justify-center gap-2 active:bg-gray-100">
              <Share2 size={16} color={palette.gray['900']} />
              <Text className="text-gray-900 font-semibold text-sm">Compartilhar link</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Cancel game confirmation */}
      <BottomSheet visible={showCancelConfirm} onClose={() => setShowCancelConfirm(false)}>
        <View className="items-center mb-6">
          <View className="w-14 h-14 bg-red-100 rounded-full items-center justify-center mb-4">
            <Trash2 size={28} color={palette.red['500']} />
          </View>
          <Text className="font-bold text-gray-900 text-xl mb-2">Cancelar partida?</Text>
          <Text className="text-sm text-gray-500 leading-relaxed mb-3 text-center">
            Ao cancelar, <Text className="text-sm font-bold text-gray-700">todos os jogadores inscritos serão notificados</Text> e receberão o estorno integral de acordo com as políticas do JoggaHub, em até 10 dias úteis no método de pagamento utilizado.
          </Text>
          <Text className="text-sm text-gray-500 leading-relaxed text-center">A vaga será liberada no calendário. Esta ação não pode ser desfeita.</Text>
        </View>
        <SheetButtons
          onBack={() => setShowCancelConfirm(false)}
          confirm={{ label: busy ? 'Cancelando...' : 'Confirmar cancelamento', className: busy ? 'bg-red-500 opacity-60' : 'bg-red-500', onPress: () => !busy && runGameAction('cancel-game', {}, 'home') }}
        />
      </BottomSheet>

      {/* Leave as player */}
      <BottomSheet visible={showPlayerLeaveConfirm} onClose={() => setShowPlayerLeaveConfirm(false)}>
        <View className="items-center mb-6">
          <View className="w-14 h-14 bg-red-100 rounded-full items-center justify-center mb-4">
            {withinCancelCutoff ? <Shield size={28} color={palette.red['500']} /> : <X size={28} color={palette.red['500']} />}
          </View>
          <Text className="font-bold text-gray-900 text-xl mb-2">{withinCancelCutoff ? 'Cancelamento bloqueado' : 'Sair da partida?'}</Text>
          {withinCancelCutoff ? (
            <>
              <Text className="text-sm text-gray-500 leading-relaxed text-center">
                Faltam menos de <Text className="text-sm font-bold text-gray-700">{PLAYER_CANCEL_CUTOFF_HOURS}h</Text> para o início da partida. O cancelamento não é permitido nesse período.
              </Text>
              <Text className="text-sm text-gray-500 mt-2 leading-relaxed text-center">Para sair, entre em contato diretamente com o organizador ou clube.</Text>
            </>
          ) : (
            <Text className="text-sm text-gray-500 leading-relaxed text-center">Você será removido da partida e os outros jogadores serão notificados.</Text>
          )}
        </View>
        <SheetButtons
          onBack={() => setShowPlayerLeaveConfirm(false)}
          confirm={withinCancelCutoff ? undefined : { label: busy ? 'Saindo...' : 'Confirmar saída', className: busy ? 'bg-red-500 opacity-60' : 'bg-red-500', onPress: () => !busy && runGameAction('leave-game', {}, 'home') }}
        />
      </BottomSheet>

      {/* Leave as organizer */}
      <BottomSheet visible={showLeaveConfirm} onClose={() => setShowLeaveConfirm(false)}>
        <View className="items-center mb-6">
          <View className={`w-14 h-14 rounded-full items-center justify-center mb-4 ${withinCancelCutoff ? 'bg-red-100' : 'bg-amber-100'}`}>
            {withinCancelCutoff ? <Shield size={28} color={palette.red['500']} /> : <Crown size={28} color={palette.amber['500']} />}
          </View>
          <Text className="font-bold text-gray-900 text-xl mb-2">{withinCancelCutoff ? 'Cancelamento bloqueado' : 'Sair da partida?'}</Text>
          {withinCancelCutoff ? (
            <>
              <Text className="text-sm text-gray-500 leading-relaxed text-center">
                Faltam menos de <Text className="text-sm font-bold text-gray-700">{PLAYER_CANCEL_CUTOFF_HOURS}h</Text> para o início da partida. O cancelamento por jogadores não é permitido nesse período.
              </Text>
              <Text className="text-sm text-gray-500 mt-2 leading-relaxed text-center">Para cancelar, entre em contato diretamente com o clube.</Text>
            </>
          ) : (
            <>
              <Text className="text-sm text-gray-500 leading-relaxed mb-3 text-center">
                Você será removido da partida e{' '}
                {players[1] ? (
                  <>
                    <Text className="text-sm font-bold text-gray-700">{players[1].name.split(' ')[0]}</Text> assumirá como novo organizador.
                  </>
                ) : (
                  'como você é o único jogador, para sair é preciso cancelar a partida.'
                )}
              </Text>
              <Text className="text-sm text-gray-500 leading-relaxed text-center">O estorno da sua parte será processado de acordo com as políticas do JoggaHub.</Text>
            </>
          )}
        </View>
        <SheetButtons
          onBack={() => setShowLeaveConfirm(false)}
          confirm={withinCancelCutoff || !players[1] ? undefined : { label: busy ? 'Saindo...' : 'Confirmar saída', className: busy ? 'bg-amber-500 opacity-60' : 'bg-amber-500', onPress: () => !busy && runGameAction('leave-game', {}, 'home') }}
        />
      </BottomSheet>

      {/* Join */}
      <BottomSheet visible={showJoin} onClose={() => setShowJoin(false)}>
        <Text className="font-bold text-gray-900 text-xl mb-1">Entrar na partida</Text>
        <Text className="text-sm text-gray-500 mb-6">{g.courtName && g.venueName ? `${sportLabel(g.sport)} · ${g.venueName}` : 'Partida Aberta'}</Text>
        <View className="bg-gray-50 rounded-2xl p-4 gap-3 mb-6">
          {[
            ['Data', date ? formatDate(date).replace(/^./, c => c.toUpperCase()) : '—'],
            ['Horário', `${time}${endTime ? ` – ${endTime}` : ''}`],
            ['Vagas restantes', `${spotsLeft - 1} após sua entrada`],
          ].map(([k, v]) => (
            <View key={k} className="flex-row justify-between">
              <Text className="text-sm text-gray-500">{k}</Text>
              <Text className="text-sm font-semibold text-gray-900">{v}</Text>
            </View>
          ))}
          <View className="border-t border-gray-200 pt-3 gap-2">
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-500">Valor da vaga</Text>
              <Text className="text-sm font-semibold text-gray-900">R$ {g.pricePerPlayer.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-500">Taxa de serviço (8% + R$ 2,50)</Text>
              <Text className="text-sm font-semibold text-gray-900">R$ {joinFees.fee.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between pt-1 border-t border-gray-100">
              <Text className="font-bold text-gray-900 text-base">Total</Text>
              <Text className="text-xl font-bold text-violet-600">R$ {joinFees.total.toFixed(2)}</Text>
            </View>
          </View>
        </View>
        {withinJoinCutoff ? (
          <View className="w-full flex-row items-center justify-center gap-2 bg-gray-100 py-4 rounded-2xl">
            <Shield size={16} color={palette.gray['500']} />
            <Text className="text-gray-500 font-semibold text-sm">Entradas encerradas (menos de 2h para o início)</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setShowJoin(false);
              payToJoin(pendingTeam);
            }}
            disabled={joining}
            className="w-full bg-violet-600 py-4 rounded-2xl flex-row items-center justify-center gap-2 active:bg-violet-700"
          >
            <CheckCircle size={20} color="#ffffff" />
            <Text className="text-white font-bold text-base">{joining ? 'Entrando...' : `Pagar minha parte · R$ ${joinFees.total.toFixed(2)}`}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setShowJoin(false)} className="w-full mt-3 py-3 items-center">
          <Text className="text-sm text-gray-500 font-semibold">Cancelar</Text>
        </Pressable>
      </BottomSheet>

      {/* Add player */}
      <BottomSheet visible={showAddPlayer} onClose={closeAddPlayer}>
        <View className="flex-row items-center justify-between mb-4">
          <Text className="font-bold text-gray-900 text-xl">Adicionar jogador</Text>
          <Pressable onPress={closeAddPlayer} accessibilityLabel="Fechar" className="p-2 rounded-full">
            <X size={20} color={palette.gray['500']} />
          </Pressable>
        </View>
        <View className="flex-row items-center gap-2 bg-gray-100 rounded-2xl px-4 py-3 mb-4">
          <Search size={16} color={palette.gray['400']} />
          <TextInput
            autoFocus
            placeholder="Buscar por nome..."
            placeholderTextColor={palette.gray['400']}
            value={searchQuery}
            onChangeText={onSearch}
            className="flex-1 text-gray-800 text-sm"
            style={{ fontFamily: 'Inter_400Regular', paddingVertical: 0 }}
          />
          {searching && <ActivityIndicator size="small" color={palette.gray['400']} />}
          {!!searchQuery && !searching && (
            <Pressable onPress={() => onSearch('')} accessibilityLabel="Limpar busca">
              <X size={16} color={palette.gray['400']} />
            </Pressable>
          )}
        </View>
        <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
          {!searchQuery && <Text className="text-sm text-gray-400 text-center py-8">Digite o nome do jogador para buscar</Text>}
          {!!searchQuery && !searching && searchResults.length === 0 && (
            <Text className="text-sm text-gray-400 text-center py-8">Nenhum jogador encontrado</Text>
          )}
          {searchResults.map(r => (
            <Pressable key={r.id} onPress={() => selectPlayer(r)} className="flex-row items-center gap-3 px-2 py-3 rounded-2xl active:bg-gray-50">
              <View className="w-10 h-10 bg-violet-600 rounded-full items-center justify-center">
                <Text className="text-white font-bold">{r.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text className="flex-1 font-semibold text-gray-900 text-sm">{r.name}</Text>
              <Text className="text-xs text-violet-600 font-semibold">Selecionar</Text>
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>

      {/* Share */}
      <BottomSheet visible={showShare} onClose={() => setShowShare(false)}>
        <Text className="font-bold text-gray-900 text-lg mb-5">Compartilhar partida</Text>
        <ScrollView className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100" style={{ maxHeight: 260 }}>
          <Text className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Mensagem gerada</Text>
          <Text className="text-sm text-gray-700 leading-relaxed">{msg}</Text>
        </ScrollView>
        <View className="gap-3">
          <Pressable
            onPress={() => {
              Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`).catch(() => {});
              setShowShare(false);
            }}
            className="w-full bg-green-500 rounded-2xl py-4 flex-row items-center justify-center gap-3 active:bg-green-600"
          >
            <MessageCircle size={20} color="#ffffff" />
            <Text className="text-white font-semibold text-base">Compartilhar via WhatsApp</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(msg);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="w-full bg-gray-100 rounded-2xl py-4 flex-row items-center justify-center gap-3 active:bg-gray-200"
          >
            {copied ? <CheckCircle size={20} color={palette.green['600']} /> : <Copy size={20} color={palette.gray['800']} />}
            <Text className="text-gray-800 font-semibold text-base">{copied ? 'Copiado!' : 'Copiar mensagem'}</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setShowShare(false)} className="w-full mt-3 py-3 items-center">
          <Text className="text-sm text-gray-500 font-semibold">Fechar</Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}
