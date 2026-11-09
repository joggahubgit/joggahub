// Port of src/app/components/PaymentsPage.tsx (web) — read-only history + info.
// Deviation: times use the stored wall-clock (the web shifts them by the viewer's timezone).
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, Clock, CreditCard, MapPin, ShieldCheck, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { formatBRL, wallDate, wallTime } from '@/lib/shared';
import palette from '../../../tailwind.palette';

type GameRow = {
  scheduled_at: string | null;
  court_price: number | null;
  price_per_player: number | null;
  current_players: number;
  pay_mode: string | null;
  is_open: boolean;
  status: string;
  stripe_split_captured: boolean;
  courts: { name: string; venues: { name: string } | null } | null;
};
type Entry = { game_id: string; games: GameRow | null };

async function fetchPayments(userId: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('game_players')
    .select(
      'game_id, games!game_id (scheduled_at, court_price, price_per_player, current_players, pay_mode, is_open, status, stripe_split_captured, courts!court_id (name, venues!venue_id (name)))',
    )
    .eq('player_id', userId)
    .eq('paid', true)
    .limit(40);
  if (error) throw error;
  return ((data as unknown as Entry[]) ?? []).sort((a, b) => (b.games?.scheduled_at ?? '').localeCompare(a.games?.scheduled_at ?? ''));
}

const typeLabel = (g: GameRow | null) => (!g ? 'Partida' : g.is_open ? 'Partida Aberta' : g.pay_mode === 'split' ? 'Privada · Divisão' : 'Privada · Total');

function calcAmount(g: GameRow | null): number {
  if (!g) return 0;
  const cp = g.court_price ?? 0;
  if (cp <= 0) return Math.round(((g.price_per_player ?? 0) * 1.08 + 2.5) * 100) / 100;
  if (g.pay_mode === 'full') return Math.round((cp * 1.08 + 2.5) * 100) / 100;
  const n = Math.max(g.current_players, g.is_open ? 1 : 10);
  return Math.round(((cp / n) * 1.08 + 2.5) * 100) / 100;
}

function payStatus(g: GameRow | null): 'paid' | 'hold' | 'refunded' | 'released' {
  if (!g) return 'hold';
  if (g.status === 'cancelled' || g.status === 'expired') return g.stripe_split_captured ? 'refunded' : 'released';
  return g.stripe_split_captured ? 'paid' : 'hold';
}

const BADGE = {
  paid: { label: 'Pago', bg: 'bg-green-100', fg: 'text-green-700' },
  hold: { label: 'Bloqueado', bg: 'bg-blue-100', fg: 'text-blue-700' },
  refunded: { label: 'Reembolsado', bg: 'bg-orange-100', fg: 'text-orange-700' },
  released: { label: 'Liberado', bg: 'bg-gray-100', fg: 'text-gray-600' },
};

export default function Payments() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [tab, setTab] = useState<'history' | 'methods'>('history');
  const q = useQuery({ queryKey: ['payments', userId], queryFn: () => fetchPayments(userId) });
  const entries = q.data ?? [];

  // "This month" by the game's wall-clock date (YYYY-MM), compared with the device's current month.
  const now = new Date(q.dataUpdatedAt || 0);
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const committed = entries.filter(e => e.games?.scheduled_at?.startsWith(ym) && ['paid', 'hold'].includes(payStatus(e.games)));
  const total = committed.reduce((s, e) => s + calcAmount(e.games), 0);
  const avg = committed.length ? total / committed.length : 0;

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-white border-b border-gray-200">
        <View className="px-6 py-4 flex-row items-center gap-4">
          <Pressable onPress={() => router.back()} accessibilityLabel="Voltar" hitSlop={12}>
            <ArrowLeft size={24} color={palette.gray['600']} />
          </Pressable>
          <Text className="text-xl font-bold text-gray-900">Pagamentos</Text>
        </View>
        <View className="flex-row border-t border-gray-200">
          {(['history', 'methods'] as const).map(t => (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} className={`flex-1 py-3 items-center ${tab === t ? 'border-b-2 border-violet-600' : ''}`}>
              <Text className={`text-sm font-semibold ${tab === t ? 'text-violet-600' : 'text-gray-500'}`}>{t === 'history' ? 'Histórico' : 'Sobre pagamentos'}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerClassName="px-6 py-6 gap-4"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={palette.violet['600']} />}
      >
        {tab === 'history' ? (
          <>
            <LinearGradient colors={[palette.violet['600'], palette.violet['700']]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16, padding: 24 }}>
              <Text className="text-sm text-violet-100 mb-1">Total comprometido este mês</Text>
              {q.isPending ? (
                <ActivityIndicator color="#ffffff" style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
              ) : (
                <>
                  <Text className="text-3xl font-bold mb-4 text-white">{formatBRL(total)}</Text>
                  <View className="flex-row gap-6">
                    <View>
                      <Text className="text-sm text-violet-100">Partidas</Text>
                      <Text className="text-sm font-semibold text-white">{committed.length}</Text>
                    </View>
                    {committed.length > 0 && (
                      <View>
                        <Text className="text-sm text-violet-100">Média por partida</Text>
                        <Text className="text-sm font-semibold text-white">{formatBRL(avg)}</Text>
                      </View>
                    )}
                  </View>
                </>
              )}
            </LinearGradient>

            {q.isPending ? (
              <View className="items-center py-12">
                <ActivityIndicator size="large" color={palette.violet['500']} />
              </View>
            ) : entries.length === 0 ? (
              <View className="items-center py-12">
                <View style={{ opacity: 0.4 }} className="mb-3">
                  <CreditCard size={48} color={palette.gray['400']} />
                </View>
                <Text className="font-medium text-gray-500 text-base">{q.isError ? 'Não foi possível carregar' : 'Nenhum pagamento encontrado'}</Text>
                <Text className="text-sm mt-1 text-gray-400">Suas reservas e partidas aparecerão aqui</Text>
              </View>
            ) : (
              <View className="gap-3">
                <Text className="font-semibold text-gray-900 px-1 text-base">Transações</Text>
                {entries.map(e => {
                  const g = e.games;
                  const s = payStatus(g);
                  const b = BADGE[s];
                  return (
                    <View key={e.game_id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                      <View className="flex-row items-start justify-between mb-3">
                        <View className="flex-1 pr-3">
                          <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                            <Text className="font-semibold text-gray-900 text-base" numberOfLines={1}>
                              {g?.courts?.name ?? '—'}
                            </Text>
                            <View className={`px-2.5 py-0.5 rounded-full ${b.bg}`}>
                              <Text className={`text-xs font-semibold ${b.fg}`}>{b.label}</Text>
                            </View>
                          </View>
                          {!!g?.courts?.venues?.name && (
                            <View className="flex-row items-center gap-1 mb-1">
                              <MapPin size={12} color={palette.gray['500']} />
                              <Text className="text-sm text-gray-500" numberOfLines={1}>
                                {g.courts.venues.name}
                              </Text>
                            </View>
                          )}
                          {!!g?.scheduled_at && (
                            <View className="flex-row items-center gap-1">
                              <Calendar size={12} color={palette.gray['500']} />
                              <Text className="text-sm text-gray-500">
                                {wallDate(g.scheduled_at)} às {wallTime(g.scheduled_at)}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View className="items-end">
                          <Text className={`text-lg font-bold ${s === 'refunded' ? 'text-orange-600' : s === 'released' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {s === 'refunded' ? '–' : ''}{formatBRL(calcAmount(g))}
                          </Text>
                          <Text className="text-xs text-gray-500">{typeLabel(g)}</Text>
                        </View>
                      </View>
                      <View className="pt-3 border-t border-gray-100 flex-row items-center gap-4">
                        {g && (
                          <View className="flex-row items-center gap-1">
                            <Users size={16} color={palette.gray['500']} />
                            <Text className="text-sm text-gray-500">
                              {g.current_players} {g.current_players === 1 ? 'jogador' : 'jogadores'}
                            </Text>
                          </View>
                        )}
                        {s === 'hold' && (
                          <View className="flex-row items-center gap-1">
                            <Clock size={16} color={palette.blue['600']} />
                            <Text className="text-sm text-blue-600">Aguardando cobrança</Text>
                          </View>
                        )}
                        {s === 'released' && <Text className="text-sm text-gray-400">Bloqueio liberado, sem cobrança</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {entries.length > 0 && <Text className="text-center text-xs text-gray-400 pt-2">Valores estimados com base no número atual de jogadores. O valor final pode variar.</Text>}
          </>
        ) : (
          <>
            <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 gap-4">
              <View className="flex-row items-center gap-3">
                <View className="w-12 h-12 bg-violet-100 rounded-xl items-center justify-center">
                  <ShieldCheck size={24} color={palette.violet['600']} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900 text-base">Pagamentos via Stripe</Text>
                  <Text className="text-sm text-gray-500">Seus dados nunca passam pelos nossos servidores</Text>
                </View>
              </View>
              <Text className="text-sm text-gray-600 leading-relaxed">
                Todas as transações são processadas com segurança pelo Stripe. Seus dados de cartão são criptografados e armazenados diretamente pelo Stripe, nunca pelo JoggaHub.
              </Text>
            </View>
            <View className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 gap-3">
              <Text className="font-semibold text-gray-900 text-base">Como funciona o bloqueio</Text>
              {[
                'Ao se inscrever, reservamos o valor no seu cartão (bloqueio temporário — sem cobrança ainda).',
                'A cobrança efetiva ocorre quando a partida for confirmada: 24h antes (privada) ou 2h antes (aberta/split).',
                'Se a partida for cancelada antes da cobrança, o bloqueio é liberado sem nenhuma taxa.',
              ].map((t, i) => (
                <View key={t} className="flex-row gap-3">
                  <View className="w-6 h-6 bg-blue-100 rounded-full items-center justify-center mt-0.5">
                    <Text className="text-blue-700 text-xs font-bold">{i + 1}</Text>
                  </View>
                  <Text className="text-sm text-gray-600 flex-1">{t}</Text>
                </View>
              ))}
            </View>
            <View className="bg-violet-50 border border-violet-200 rounded-xl p-4">
              <Text className="text-sm text-violet-900 leading-relaxed">
                <Text className="text-sm font-bold text-violet-900">Taxa de serviço:</Text> 8% + R$ 2,50 por transação, incluída no valor mostrado no momento da reserva.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
