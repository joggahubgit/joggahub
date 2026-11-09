// Cartão salvo + retenção automática 6 dias antes (port de
// src/app/components/payments/* do site).
//  - ScheduledHoldNotice: aviso antes de pagar (reserva com mais de 6 dias)
//  - useMyScheduledPayment / ScheduledStatusBanner: "agendado" ou "pendente"
//  - payScheduledNow: "Pagar agora" quando o banco recusou (prazo de 24h)
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AlertTriangle, CalendarClock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { formatBRL, scheduledHold, wallDateTimeLabel } from '@/lib/shared';
import palette from '../../../tailwind.palette';

export interface MyScheduledPayment {
  id: string; kind: string; player_id: string | null; game_id: string | null; class_id: string | null;
  amount: number; description: string; starts_at: string; hold_at: string; status: 'scheduled' | 'failed';
  pay_deadline: string | null;
}

/** Prazo em hora real → "seg, 10/11 às 19:05" (Brasília). */
export function deadlineLabel(iso: string) {
  const s = new Date(iso).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
  return wallDateTimeLabel(s);
}

export async function fetchMyScheduledPayments(): Promise<MyScheduledPayment[]> {
  const { data } = await supabase.rpc('my_scheduled_payments');
  return (data ?? []) as MyScheduledPayment[];
}

export function useMyScheduledPayment(ref: { gameId?: string | null; classId?: string | null }, refreshKey?: unknown) {
  const [p, setP] = useState<MyScheduledPayment | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!ref.gameId && !ref.classId) return;
    let alive = true;
    fetchMyScheduledPayments().then(all => {
      if (alive) setP(all.find(x => (ref.gameId && x.game_id === ref.gameId) || (ref.classId && x.class_id === ref.classId)) ?? null);
    });
    return () => { alive = false; };
  }, [ref.gameId, ref.classId, refreshKey, tick]);
  return { payment: p, refresh: () => setTick(t => t + 1) };
}

async function fnError(error: unknown, fallback: string) {
  try {
    const body = await (error as { context?: Response }).context?.json();
    if (body?.error) return String(body.error);
  } catch { /* ignore */ }
  return fallback;
}

/** "Pagar agora": abre o Stripe e espera o servidor registrar. */
export async function payScheduledNow(id: string): Promise<'paid' | 'cancelled'> {
  const back = Linking.createURL(`pagamento-pendente`, { queryParams: { id } });
  const { data, error } = await supabase.functions.invoke('create-retry-checkout-session', {
    body: { scheduledPaymentId: id, successUrl: back, cancelUrl: back },
  });
  if (error) throw new Error(await fnError(error, 'Não foi possível abrir o pagamento.'));
  if (!data?.url) throw new Error('Não foi possível abrir o pagamento.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, Linking.createURL(''));
  if (result.type !== 'success') return 'cancelled';
  const { queryParams } = Linking.parse(result.url);
  const sessionId = typeof queryParams?.session_id === 'string' ? queryParams.session_id : '';
  if (!sessionId) return 'cancelled';
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { data: f } = await supabase.functions.invoke('finalize-checkout', { body: { sessionId } });
    if (f?.status === 'done') return 'paid';
    if (f?.status === 'failed') throw new Error(`${f.error ?? 'Não foi possível concluir o pagamento.'} O valor foi liberado no seu cartão.`);
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('Seu pagamento está sendo processado. Confira em alguns minutos.');
}

export function ScheduledHoldNotice({ startIso, amount, chargeText, className = '' }: {
  startIso: string; amount: number; chargeText: string; className?: string;
}) {
  const plan = scheduledHold(startIso);
  if (!plan.scheduled) return null;
  return (
    <View className={`bg-sky-50 border border-sky-200 rounded-2xl p-4 flex-row gap-3 ${className}`}>
      <CalendarClock size={20} color={palette.sky['600']} />
      <View className="flex-1 gap-1">
        <Text className="text-sm text-sky-900"><Text className="text-sm font-bold text-sky-900">Nada é cobrado agora.</Text> Seu cartão fica salvo e a vaga já é sua.</Text>
        <Text className="text-sm text-sky-900">
          Em <Text className="text-sm font-bold text-sky-900">{plan.holdOn}</Text> reservamos <Text className="text-sm font-bold text-sky-900">{formatBRL(amount)}</Text> no cartão ({chargeText}).
        </Text>
        <Text className="text-xs text-sky-700">Se o banco recusar, você recebe um aviso e tem 24h para pagar pelo app.</Text>
      </View>
    </View>
  );
}

export function ScheduledStatusBanner({ payment, onPaid, className = '' }: {
  payment: MyScheduledPayment | null; onPaid?: () => void; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  if (!payment) return null;
  if (paid) {
    return (
      <View className={`bg-green-50 border border-green-200 rounded-2xl p-4 ${className}`}>
        <Text className="text-sm text-green-800">Pagamento confirmado! Sua vaga está mantida.</Text>
      </View>
    );
  }
  if (payment.status === 'failed') {
    return (
      <View className={`bg-amber-50 border border-amber-200 rounded-2xl p-4 ${className}`}>
        <View className="flex-row gap-2">
          <AlertTriangle size={16} color={palette.amber['700']} />
          <Text className="text-sm text-amber-900 flex-1">
            O banco recusou a reserva de <Text className="text-sm font-bold text-amber-900">{formatBRL(Number(payment.amount))}</Text> no seu cartão. Pague até{' '}
            <Text className="text-sm font-bold text-amber-900">{payment.pay_deadline ? deadlineLabel(payment.pay_deadline) : '—'}</Text> para manter a vaga.
          </Text>
        </View>
        {!!error && <Text className="text-xs text-red-600 mt-2">{error}</Text>}
        <Pressable
          disabled={busy}
          onPress={async () => {
            setBusy(true); setError('');
            try {
              if ((await payScheduledNow(payment.id)) === 'paid') { setPaid(true); onPaid?.(); }
            } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}
          className={`mt-3 bg-amber-500 py-2.5 rounded-xl items-center ${busy ? 'opacity-60' : ''}`}
        >
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text className="text-white font-bold text-sm">Pagar agora</Text>}
        </Pressable>
      </View>
    );
  }
  return (
    <View className={`bg-sky-50 border border-sky-200 rounded-2xl p-4 flex-row gap-3 ${className}`}>
      <CalendarClock size={20} color={palette.sky['600']} />
      <Text className="text-sm text-sky-900 flex-1">
        <Text className="text-sm font-bold text-sky-900">Pagamento agendado.</Text> Nada foi cobrado ainda: em{' '}
        <Text className="text-sm font-bold text-sky-900">{wallDateTimeLabel(payment.hold_at)}</Text> reservamos {formatBRL(Number(payment.amount))} no seu cartão salvo.
      </Text>
    </View>
  );
}
