// Port of src/app/components/MyBookings.tsx (web). Cancelling (refund) keeps
// the web's modal but finishes on the website until the payment phase.
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Calendar, CheckCircle, ChevronLeft, ChevronRight, Clock, MapPin, Shield, Trophy, Users, XCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PageHeader } from '@/components/ui/PageHeader';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchMyBookings, type BookingItem } from '@/features/bookings/api';
import { wallDate, wallTime } from '@/lib/shared';
import palette from '../../../tailwind.palette';

const PAGE = 10;
const ACTIVE = ['confirmed', 'open', 'scheduled', 'confirmed_booking'];
const fmtDate = (iso: string) => wallDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });

function Chip({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View className={`px-2 py-0.5 rounded-full ${bg}`}>
      <Text className={`text-[10px] font-bold ${fg}`}>{label}</Text>
    </View>
  );
}

function TypeBadge({ item }: { item: BookingItem }) {
  const cfg =
    item.type === 'slot'
      ? { Icon: Calendar, label: 'Reserva', bg: 'bg-violet-50', fg: 'text-violet-600', c: palette.violet['600'] }
      : item.type === 'game_organizer'
        ? { Icon: Trophy, label: 'Organizador', bg: 'bg-orange-50', fg: 'text-orange-600', c: palette.orange['600'] }
        : { Icon: Users, label: 'Jogador', bg: 'bg-blue-50', fg: 'text-blue-600', c: palette.blue['600'] };
  return (
    <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${cfg.bg}`}>
      <cfg.Icon size={12} color={cfg.c} />
      <Text className={`text-[10px] font-bold ${cfg.fg}`}>{cfg.label}</Text>
    </View>
  );
}

function StatusChip({ item }: { item: BookingItem }) {
  if (item.type !== 'slot') {
    if (item.status === 'confirmed_booking') return <Chip label="Confirmada" bg="bg-green-100" fg="text-green-700" />;
    if (item.status === 'pending_results') return <Chip label="Aguardando dados" bg="bg-orange-100" fg="text-orange-700" />;
    if (item.status === 'completed') return <Chip label="Encerrada" bg="bg-gray-100" fg="text-gray-600" />;
    if (item.status === 'expired') return <Chip label="Expirada" bg="bg-red-100" fg="text-red-500" />;
    if (item.status === 'cancelled' || item.status === 'closed') return <Chip label="Cancelada" bg="bg-red-100" fg="text-red-600" />;
    return <Chip label="Agendada" bg="bg-amber-100" fg="text-amber-700" />;
  }
  if (item.status === 'cancelled') return <Chip label="Cancelada" bg="bg-red-100" fg="text-red-600" />;
  if (item.paymentStatus === 'paid') return <Chip label="Pago" bg="bg-green-100" fg="text-green-700" />;
  return <Chip label="Pendente" bg="bg-amber-100" fg="text-amber-700" />;
}

export default function MyBookings() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const q = useQuery({ queryKey: ['myBookings', userId], queryFn: () => fetchMyBookings(userId) });
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<BookingItem | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const closeCancel = () => {
    setCancelTarget(null);
    setCancelDone(false);
    setCancelError('');
  };

  // The server refunds/releases and (for private games) cancels for every player.
  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError('');
    const { data, error } = await supabase.functions.invoke('cancel-booking', { body: { bookingId: cancelTarget.id } });
    setCancelBusy(false);
    if (error || data?.error) {
      const ctx = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
      setCancelError(ctx?.error ?? data?.error ?? 'Erro ao cancelar');
      return;
    }
    setCancelDone(true);
    q.refetch();
  };
  // Captured once per load (like the web's `now`), keeping render pure.
  const nowMs = q.dataUpdatedAt;

  const items = q.data ?? [];
  const isUpcoming = (i: BookingItem) => ACTIVE.includes(i.status) && new Date(i.startTime).getTime() >= nowMs;
  const canCancel = (i: BookingItem) => i.type === 'slot' && isUpcoming(i) && !i.withinCancelCutoff;
  const upcoming = items.filter(isUpcoming);
  const past = items.filter(i => !isUpcoming(i));
  const pages = Math.ceil(past.length / PAGE);
  const pagedPast = past.slice((page - 1) * PAGE, page * PAGE);

  const card = (item: BookingItem) => {
    const dimmed = item.status === 'cancelled' || item.status === 'closed';
    const top = dimmed ? 'bg-gray-300' : item.type === 'slot' ? 'bg-violet-600' : item.type === 'game_organizer' ? 'bg-orange-500' : 'bg-blue-500';
    const clickable = item.type !== 'slot';
    return (
      <Pressable
        key={`${item.type}-${item.id}`}
        disabled={!clickable}
        onPress={() => router.push({ pathname: '/game/[id]', params: { id: item.id } })}
        className={`bg-white rounded-2xl border overflow-hidden ${dimmed ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}
      >
        <View className={`h-1 w-full ${top}`} />
        <View className="p-4 gap-3">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-0.5 flex-wrap">
                <Text className="font-bold text-gray-900 text-base" numberOfLines={1}>
                  {item.courtName}
                </Text>
                <TypeBadge item={item} />
              </View>
              {!!item.venueName && (
                <View className="flex-row items-center gap-1">
                  <MapPin size={14} color={palette.gray['500']} />
                  <Text className="text-sm text-gray-500">{item.venueName}</Text>
                </View>
              )}
            </View>
            <StatusChip item={item} />
          </View>

          <View className="flex-row flex-wrap items-center" style={{ columnGap: 16, rowGap: 4 }}>
            <View className="flex-row items-center gap-1.5">
              <Calendar size={16} color={palette.violet['500']} />
              <Text className="text-sm text-gray-600">{fmtDate(item.startTime).replace(/^./, c => c.toUpperCase())}</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <Clock size={16} color={palette.violet['500']} />
              <Text className="text-sm text-gray-600">
                {wallTime(item.startTime)}
                {item.endTime ? ` – ${wallTime(item.endTime)}` : ''}
              </Text>
            </View>
            {!!item.maxPlayers && (
              <View className="flex-row items-center gap-1.5">
                <Users size={16} color={palette.violet['500']} />
                <Text className="text-sm text-gray-600">
                  {item.currentPlayers}/{item.maxPlayers} jogadores
                </Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center justify-between pt-1 border-t border-gray-100">
            <Text className="text-sm font-bold text-violet-600">R$ {item.price.toFixed(2)}</Text>
            {canCancel(item) ? (
              <Pressable onPress={() => setCancelTarget(item)} className="flex-row items-center gap-1.5" hitSlop={8}>
                <XCircle size={16} color={palette.red['500']} />
                <Text className="text-sm text-red-500 font-semibold">Cancelar</Text>
              </Pressable>
            ) : item.withinCancelCutoff && isUpcoming(item) && item.type === 'game_organizer' ? (
              <View className="flex-row items-center gap-1">
                <Shield size={12} color={palette.gray['400']} />
                <Text className="text-[10px] text-gray-400 font-semibold">Contate o clube</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader title="Minhas Reservas" />
      {q.isPending ? (
        <View className="items-center py-24">
          <ActivityIndicator size="large" color={palette.violet['600']} />
        </View>
      ) : items.length === 0 ? (
        <View className="items-center justify-center py-24 px-6">
          <Text className="text-5xl mb-4">📋</Text>
          <Text className="font-semibold text-gray-700 text-lg">{q.isError ? 'Não foi possível carregar' : 'Nenhuma reserva ainda'}</Text>
          <Text className="text-sm text-gray-400 mt-1">{q.isError ? 'Puxe para tentar de novo.' : 'Explore os clubes e agende seu horário!'}</Text>
          <Pressable onPress={() => (q.isError ? q.refetch() : router.push('/courts'))} className="mt-6 bg-violet-600 px-6 py-3 rounded-xl">
            <Text className="text-white font-semibold text-base">{q.isError ? 'Tentar de novo' : 'Encontrar quadras'}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 py-5 gap-6 pb-8"
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={palette.violet['600']} />}
        >
          {upcoming.length > 0 && (
            <View>
              <Text className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Próximas</Text>
              <View className="gap-3">{upcoming.map(card)}</View>
            </View>
          )}
          {past.length > 0 && (
            <View>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-sm font-bold text-gray-500 uppercase tracking-wide">Histórico</Text>
                {pages > 1 && <Text className="text-xs text-gray-400">{past.length} reservas</Text>}
              </View>
              <View className="gap-3">{pagedPast.map(card)}</View>
              {pages > 1 && (
                <View className="flex-row items-center justify-between mt-4">
                  <Pressable
                    onPress={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className={`flex-row items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-gray-200 ${page === 1 ? 'opacity-40' : ''}`}
                  >
                    <ChevronLeft size={16} color={palette.gray['600']} />
                    <Text className="text-sm font-semibold text-gray-600">Anterior</Text>
                  </Pressable>
                  <Text className="text-sm font-semibold text-gray-500">
                    {page} / {pages}
                  </Text>
                  <Pressable
                    onPress={() => setPage(p => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className={`flex-row items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-gray-200 ${page === pages ? 'opacity-40' : ''}`}
                  >
                    <Text className="text-sm font-semibold text-gray-600">Próxima</Text>
                    <ChevronRight size={16} color={palette.gray['600']} />
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <BottomSheet visible={!!cancelTarget} onClose={() => !cancelBusy && closeCancel()}>
        {cancelTarget && cancelDone && (
          <View className="items-center gap-4">
            <View className="w-14 h-14 bg-green-100 rounded-full items-center justify-center">
              <CheckCircle size={32} color={palette.green['600']} />
            </View>
            <View className="items-center">
              <Text className="text-lg font-bold text-gray-900">Reserva cancelada</Text>
              <Text className="text-sm text-gray-500 mt-1">Você receberá uma confirmação em breve.</Text>
            </View>
            <Pressable onPress={closeCancel} className="w-full bg-gray-900 py-3.5 rounded-2xl items-center">
              <Text className="text-white font-bold text-base">Fechar</Text>
            </Pressable>
          </View>
        )}
        {cancelTarget && !cancelDone && (
          <View className="gap-4">
            <View>
              <Text className="text-lg font-bold text-gray-900">Cancelar reserva</Text>
              <Text className="text-sm text-gray-500 mt-1">
                {cancelTarget.courtName} · {fmtDate(cancelTarget.startTime)} às {wallTime(cancelTarget.startTime)}
              </Text>
            </View>
            {cancelTarget.paymentStatus === 'paid' && (
              <View className="flex-row items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                <AlertCircle size={16} color={palette.amber['500']} />
                <Text className="text-sm text-amber-800 flex-1">
                  Esta reserva foi <Text className="text-sm font-bold text-amber-800">paga</Text>. O reembolso de R$ {cancelTarget.price.toFixed(2)} será processado automaticamente via Stripe.
                </Text>
              </View>
            )}
            {!!cancelError && (
              <View className="bg-red-50 rounded-xl px-3 py-2 border border-red-100">
                <Text className="text-sm text-red-600">{cancelError}</Text>
              </View>
            )}
            <View className="flex-row gap-3 pt-1">
              <Pressable onPress={closeCancel} disabled={cancelBusy} className={`flex-1 py-3 border-2 border-gray-200 rounded-xl items-center ${cancelBusy ? 'opacity-50' : ''}`}>
                <Text className="text-gray-600 font-semibold text-base">Voltar</Text>
              </Pressable>
              <Pressable onPress={confirmCancel} disabled={cancelBusy} className={`flex-1 py-3 bg-red-600 rounded-xl flex-row items-center justify-center gap-2 ${cancelBusy ? 'opacity-50' : ''}`}>
                {cancelBusy && <ActivityIndicator size="small" color="#ffffff" />}
                <Text className="text-white font-bold text-base">{cancelBusy ? 'Cancelando...' : 'Confirmar'}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}
