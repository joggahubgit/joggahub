// Port de src/app/components/payments/PendingPaymentPage.tsx: pagamentos com
// cartão salvo que o banco recusou. O jogador tem 24h para "Pagar agora".
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { wallDateTimeLabel } from '@/lib/shared';
import { ScheduledStatusBanner, fetchMyScheduledPayments, type MyScheduledPayment } from '@/features/payments/scheduled';

export default function PendingPaymentsScreen() {
  const [items, setItems] = useState<MyScheduledPayment[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const all = await fetchMyScheduledPayments();
    setItems(all.filter(p => p.status === 'failed'));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-violet-600 rounded-b-3xl">
        <View className="px-6 pt-4 pb-8">
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} className="mb-4" hitSlop={12}>
            <ArrowLeft size={24} color="#ffffff" />
          </Pressable>
          <Text className="text-2xl font-bold text-white">Pagamento pendente</Text>
          <Text className="text-violet-100 mt-1">Pague dentro do prazo para manter sua vaga.</Text>
        </View>
      </SafeAreaView>
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {items === null && <Text className="text-center text-gray-400 py-8">Carregando…</Text>}
        {items?.length === 0 && (
          <View className="bg-white rounded-2xl border border-gray-200 p-6">
            <Text className="text-sm text-gray-600 text-center">Nenhum pagamento pendente. Se você já pagou, sua vaga está mantida.</Text>
          </View>
        )}
        {items?.map(p => (
          <View key={p.id} className="bg-white rounded-2xl border border-gray-200 p-5 gap-3">
            <Text className="font-semibold text-gray-900">{p.description}</Text>
            <Text className="text-sm text-gray-600">Início: <Text className="text-sm font-bold text-gray-900">{wallDateTimeLabel(p.starts_at)}</Text></Text>
            <ScheduledStatusBanner payment={p} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
