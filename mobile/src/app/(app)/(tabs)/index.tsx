// Port of src/app/components/Home.tsx (web).
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Bell, Calendar, GraduationCap, MapPin, Menu, Search, Trophy, Users, X, Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchOpenGames, fetchUpcomingGames, type UpcomingGame } from '@/features/games/api';
import { fetchUnreadCount, fetchUpcomingBookings, fetchVenueCards, type UpcomingBooking } from '@/features/home/api';
import { wallDate, wallTime } from '@/lib/shared';
import { useRealtimeRefetch } from '@/lib/useRealtimeRefetch';
import { PendingResultBanner } from '@/features/results/PendingResultBanner';
import palette from '../../../../tailwind.palette';

const SPORT_LABELS: Record<string, string> = { football: 'Society', society: 'Society', futsal: 'Futsal', futevolei: 'Futevôlei' };

function BookingCard({ b }: { b: UpcomingBooking }) {
  const isPaid = b.paymentStatus === 'paid';
  return (
    <Pressable onPress={() => router.push('/my-bookings')} className="w-72 bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <View className="h-1.5 bg-violet-600 w-full" />
      <View className="p-4 gap-3">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-sm font-bold text-gray-900">
              {wallDate(b.startTime)} · {wallTime(b.startTime)}
              {b.endTime ? ` – ${wallTime(b.endTime)}` : ''}
            </Text>
            <Text className="text-sm font-semibold text-gray-700">{b.venueName}</Text>
            <Text className="text-xs text-gray-400">{b.courtName}</Text>
          </View>
          <View className={`px-2 py-1 rounded-full ${isPaid ? 'bg-green-100' : 'bg-amber-100'}`}>
            <Text className={`text-[10px] font-bold ${isPaid ? 'text-green-700' : 'text-amber-700'}`}>{isPaid ? 'Pago' : 'Pendente'}</Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between pt-1 border-t border-gray-100">
          <View className="flex-row items-center gap-1.5">
            <Calendar size={16} color={palette.violet['500']} />
            <Text className="text-xs text-gray-500">Reserva de quadra</Text>
          </View>
          <Text className="text-sm font-bold text-violet-600">R$ {b.totalPrice.toFixed(2)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function UpcomingGameCard({ g }: { g: UpcomingGame }) {
  const isFull = g.currentPlayers >= g.maxPlayers;
  const isPendingPayment = g.statusKind === 'pending_payment';
  const isConfirmed = (isFull || g.statusKind === 'confirmed') && !isPendingPayment;
  const spotsLeft = g.maxPlayers - g.currentPlayers;
  const badge = isPendingPayment
    ? { label: 'Pagamento pendente', bg: 'bg-amber-100', fg: 'text-amber-700' }
    : isConfirmed
      ? { label: 'Confirmada', bg: 'bg-green-100', fg: 'text-green-700' }
      : { label: 'Aguardando', bg: 'bg-amber-100', fg: 'text-amber-700' };

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/game/[id]', params: { id: g.id } })}
      className="w-72 bg-white rounded-2xl border border-gray-200 p-4"
    >
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1">
          <Text className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-0.5">{SPORT_LABELS[g.sport] ?? g.sport}</Text>
          <Text className="font-bold text-gray-900 text-base">{g.venueName}</Text>
          <Text className="text-sm text-gray-500">{g.courtName}</Text>
        </View>
        <View className={`px-2 py-1 rounded-full ml-2 ${badge.bg}`}>
          <Text className={`text-[10px] font-bold ${badge.fg}`}>{badge.label}</Text>
        </View>
      </View>

      <View className="flex-row items-center gap-1.5 mb-3">
        <Calendar size={16} color={palette.gray['600']} />
        <Text className="text-sm text-gray-600">
          {wallDate(g.scheduledAt)} · {wallTime(g.scheduledAt)}
        </Text>
      </View>

      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Users size={16} color={palette.gray['400']} />
          <Text className="text-sm font-semibold text-gray-900">
            {g.currentPlayers}/{g.maxPlayers}
          </Text>
          <Text className="text-sm text-gray-500">jogadores</Text>
        </View>
        {spotsLeft > 0 ? (
          <View className="px-2.5 py-1 bg-green-100 rounded-full">
            <Text className="text-green-700 text-xs font-bold">
              {spotsLeft} {spotsLeft === 1 ? 'vaga' : 'vagas'}
            </Text>
          </View>
        ) : (
          <View className="px-2.5 py-1 bg-red-100 rounded-full">
            <Text className="text-red-600 text-xs font-bold">Completo</Text>
          </View>
        )}
      </View>

      <View className="flex-row gap-1">
        {Array.from({ length: g.maxPlayers }).map((_, i) => (
          <View
            key={i}
            className={`flex-1 h-1.5 rounded-full ${i < g.currentPlayers ? (isFull ? 'bg-green-500' : 'bg-violet-600') : 'bg-gray-200'}`}
          />
        ))}
      </View>
    </Pressable>
  );
}

function ExploreCard({
  title,
  subtitle,
  iconBg,
  icon,
  soon,
  onPress,
}: {
  title: string;
  subtitle: string;
  iconBg: string;
  icon: React.ReactNode;
  soon?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="bg-white rounded-xl p-4 border-2 border-gray-200 min-w-[160px] active:border-violet-600">
      {soon && (
        <View className="absolute top-2 right-2 bg-amber-100 px-2 py-0.5 rounded-full">
          <Text className="text-amber-700 text-[10px] font-semibold">Em breve</Text>
        </View>
      )}
      <View className={`${iconBg} rounded-full p-3 self-start mb-3`}>{icon}</View>
      <Text className="font-semibold text-gray-900 text-base">{title}</Text>
      <Text className="text-sm text-gray-600">{subtitle}</Text>
    </Pressable>
  );
}

export default function Home() {
  const { profile, session } = useAuth();
  const userId = session!.user.id; // guaranteed by the (app) guard
  const firstName = profile?.name?.split(' ')[0] ?? 'Jogador';
  // Shown once right after the first onboarding, like the web's location.state.firstLogin.
  const { firstLogin } = useLocalSearchParams<{ firstLogin?: string }>();
  const [showWelcome, setShowWelcome] = useState(firstLogin === '1');

  const upcoming = useQuery({ queryKey: ['upcomingGames', userId], queryFn: () => fetchUpcomingGames(userId) });
  const bookings = useQuery({ queryKey: ['upcomingBookings', userId], queryFn: () => fetchUpcomingBookings(userId) });
  const open = useQuery({ queryKey: ['openGames', 'home'], queryFn: () => fetchOpenGames(3) });
  const venues = useQuery({ queryKey: ['venueCards'], queryFn: fetchVenueCards });
  const unread = useQuery({ queryKey: ['unread', userId], queryFn: () => fetchUnreadCount(userId) });

  // Same realtime subscriptions as the web Home.
  useRealtimeRefetch(`home-${userId}`, ['games', 'bookings', 'notifications'], () => {
    upcoming.refetch();
    bookings.refetch();
    unread.refetch();
  });

  const refreshing = upcoming.isRefetching || bookings.isRefetching || open.isRefetching || venues.isRefetching;
  const refresh = () => {
    upcoming.refetch();
    bookings.refetch();
    open.refetch();
    venues.refetch();
    unread.refetch();
  };

  const upcomingGames = upcoming.data ?? [];
  const upcomingBookings = bookings.data ?? [];

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header — outside the ScrollView so it stays fixed while the content scrolls */}
      <SafeAreaView edges={['top']} className="bg-violet-600">
        <View className="bg-violet-600 px-6 py-6">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3">
              <Image source={require('../../../../assets/logo.png')} style={{ width: 32, height: 32 }} contentFit="contain" tintColor="#ffffff" />
              <View>
                <Text className="text-sm text-violet-100">Olá,</Text>
                <Text className="text-xl font-bold text-white">{firstName}</Text>
              </View>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => router.push('/notifications')}
                accessibilityRole="button"
                accessibilityLabel={unread.data ? `Notificações, ${unread.data} não lidas` : 'Notificações'}
                className="bg-white/20 rounded-full p-2"
              >
                <Bell size={24} color="#ffffff" />
                {!!unread.data && <View className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
              </Pressable>
              <Pressable onPress={() => router.push('/menu')} accessibilityRole="button" accessibilityLabel="Menu" className="bg-white/20 rounded-full p-2">
                <Menu size={24} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <Pressable onPress={() => router.push('/courts')} accessibilityRole="search" className="bg-white rounded-xl p-3 flex-row items-center gap-3">
            <Search size={20} color={palette.gray['400']} />
            <Text className="flex-1 text-gray-400 text-base">Buscar quadras, jogos...</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.violet['600']} />}
      >
        {/* Result waiting for this player's confirmation */}
        <PendingResultBanner userId={userId} />

        {/* Welcome banner — only after the first onboarding */}
        {showWelcome && (
          <LinearGradient
            colors={[palette.amber['400'], palette.orange['400']]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ marginHorizontal: 24, marginTop: 20, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <View className="bg-white/20 rounded-full p-2">
              <Zap size={20} color="#ffffff" />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-white text-sm">Bem-vindo, {firstName}! +20 XP</Text>
              <Text className="text-xs text-white/80">Perfil criado com sucesso. Bora jogar!</Text>
            </View>
            <Pressable onPress={() => setShowWelcome(false)} accessibilityLabel="Fechar" hitSlop={10}>
              <X size={16} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </LinearGradient>
        )}

        {/* Próximas partidas + reservas */}
        {(upcomingGames.length > 0 || upcomingBookings.length > 0) && (
          <View className="pt-6">
            <Text className="text-lg font-semibold text-gray-900 mb-3 px-6">Próximas partidas</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-6 pb-2">
              {upcomingBookings.map(b => (
                <BookingCard key={b.id} b={b} />
              ))}
              {upcomingGames.map(g => (
                <UpcomingGameCard key={g.id} g={g} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Explorar */}
        <View className="py-6">
          <Text className="text-lg font-semibold text-gray-900 mb-4 px-6">Explorar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-6 pb-2">
            <ExploreCard
              title="Encontrar"
              subtitle="Quadras"
              iconBg="bg-violet-100"
              icon={<MapPin size={24} color={palette.violet['600']} />}
              onPress={() => router.push('/courts')}
            />
            <ExploreCard
              title="Aulas"
              subtitle="Aprenda"
              iconBg="bg-purple-100"
              icon={<GraduationCap size={24} color={palette.purple['600']} />}
              soon
              onPress={() => router.push({ pathname: '/coming-soon', params: { title: 'Aulas' } })}
            />
            <ExploreCard
              title="Competições"
              subtitle="Participe"
              iconBg="bg-yellow-100"
              icon={<Trophy size={24} color={palette.yellow['600']} />}
              soon
              onPress={() => router.push({ pathname: '/coming-soon', params: { title: 'Competições' } })}
            />
            <ExploreCard
              title="Encontre"
              subtitle="uma partida"
              iconBg="bg-green-100"
              icon={<Users size={24} color={palette.green['600']} />}
              onPress={() => router.push('/games')}
            />
          </ScrollView>
        </View>

        {/* Jogos abertos */}
        <View className="px-6 py-4">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-gray-900">Jogos abertos</Text>
            <Pressable onPress={() => router.push('/games')} hitSlop={10}>
              <Text className="text-violet-600 text-sm font-semibold">Ver todos</Text>
            </Pressable>
          </View>
          {!open.data?.length ? (
            <View className="bg-white rounded-xl p-6 border border-gray-200 items-center">
              <Text className="text-gray-500 text-sm text-center">
                {open.isPending ? 'Carregando…' : 'Nenhum jogo aberto disponível no momento.'}
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {open.data.map(game => (
                <Pressable
                  key={game.id}
                  onPress={() => router.push({ pathname: '/game/[id]', params: { id: game.id } })}
                  className="bg-white rounded-xl p-4 border border-gray-200"
                >
                  <View className="flex-row items-start justify-between mb-2">
                    <View>
                      <Text className="font-semibold text-gray-900 text-base">Jogo Aberto</Text>
                      <View className="flex-row items-center gap-1 mt-1">
                        <MapPin size={16} color={palette.gray['600']} />
                        <Text className="text-sm text-gray-600">
                          {wallDate(game.scheduledAt, { day: '2-digit', month: '2-digit', year: '2-digit' })} {wallTime(game.scheduledAt)}
                        </Text>
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="font-semibold text-violet-600 text-base">R$ {Number(game.pricePerPlayer).toFixed(2)}</Text>
                      <Text className="text-xs text-gray-500">por pessoa</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-4">
                    <View className="flex-row items-center gap-1">
                      <Users size={16} color={palette.gray['600']} />
                      <Text className="text-sm text-gray-600">
                        {game.currentPlayers}/{game.maxPlayers}
                      </Text>
                    </View>
                    {!!game.skillLevel && (
                      <View className="px-2 py-1 bg-violet-100 rounded-full">
                        <Text className="text-violet-700 text-xs">{game.skillLevel}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Clubes disponíveis */}
        <View className="py-4 mb-6">
          <View className="flex-row items-center justify-between mb-4 px-6">
            <Text className="text-lg font-semibold text-gray-900">Clubes disponíveis</Text>
            <Pressable onPress={() => router.push('/courts')} hitSlop={10}>
              <Text className="text-violet-600 text-sm font-semibold">Ver todos</Text>
            </Pressable>
          </View>
          {!venues.data?.length ? (
            <View className="mx-6 bg-white rounded-xl p-6 border border-gray-200 items-center">
              <Text className="text-gray-500 text-sm text-center">{venues.isPending ? 'Carregando…' : 'Nenhum clube cadastrado ainda.'}</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-6 pb-2">
              {venues.data.map(v => (
                <Pressable
                  key={v.id}
                  onPress={() => v.firstCourtId && router.push({ pathname: '/court/[id]', params: { id: v.firstCourtId } })}
                  className="bg-white rounded-xl overflow-hidden border border-gray-200 w-44"
                >
                  <Image source={{ uri: v.image }} style={{ width: '100%', height: 112 }} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={v.name} />
                  <View className="p-3">
                    <Text className="font-semibold text-gray-900 text-sm" numberOfLines={1}>
                      {v.name}
                    </Text>
                    {!!(v.city || v.address) && (
                      <View className="flex-row items-center gap-1 mt-1">
                        <MapPin size={12} color={palette.gray['500']} />
                        <Text className="text-xs text-gray-500 flex-1" numberOfLines={1}>
                          {v.city || v.address}
                        </Text>
                      </View>
                    )}
                    <Text className="text-xs text-violet-600 font-medium mt-1">{v.courtCount === 1 ? '1 quadra' : `${v.courtCount} quadras`}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
