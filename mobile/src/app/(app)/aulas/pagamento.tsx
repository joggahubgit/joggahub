// Port of src/app/components/classes/ClassPaymentSuccess.tsx (web): volta do
// Stripe após pagar um curso. O servidor (finalize-checkout / webhook) cria a
// inscrição; aqui só esperamos, mostramos e mandamos o email de confirmação
// (o mesmo do site).
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';
import { sendClassEmail } from '@/features/classes/email';
import palette from '../../../../tailwind.palette';

type State = { kind: 'waiting' } | { kind: 'done'; classId: string } | { kind: 'failed'; error: string };

export default function ClassPaymentScreen() {
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();
  const qc = useQueryClient();
  const [state, setState] = useState<State>({ kind: 'waiting' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const sessionId = session_id ?? '';
    if (!sessionId.startsWith('cs_')) { setState({ kind: 'failed', error: 'Pagamento não encontrado.' }); return; }
    let cancelled = false;
    const deadline = Date.now() + 30_000;
    (async () => {
      while (!cancelled) {
        const { data } = await supabase.functions.invoke('finalize-checkout', { body: { sessionId } });
        if (cancelled) return;
        if (data?.status === 'done' && data.classId) {
          setState({ kind: 'done', classId: data.classId });
          qc.invalidateQueries();
          sendClassEmail(data.classId, sessionId);
          return;
        }
        if (data?.status === 'failed') {
          setState({ kind: 'failed', error: `${data.error ?? 'Não foi possível concluir a inscrição.'} O valor foi devolvido no seu cartão.` });
          return;
        }
        if (Date.now() > deadline) {
          setState({ kind: 'failed', error: 'Seu pagamento está sendo processado. Confira o curso em alguns minutos.' });
          return;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    })();
    return () => { cancelled = true; };
  }, [session_id, qc]);

  return (
    <View className="flex-1 bg-gray-50 items-center justify-center p-6">
      <View className="bg-white rounded-3xl border border-gray-200 p-8 w-full items-center">
        {state.kind === 'waiting' && (
          <>
            <ActivityIndicator size="large" color={palette.violet['600']} />
            <Text className="font-bold text-gray-900 text-lg mt-4">Confirmando sua inscrição…</Text>
            <Text className="text-sm text-gray-500 mt-1">Só um instante.</Text>
          </>
        )}
        {state.kind === 'done' && (
          <>
            <View className="w-16 h-16 rounded-full bg-green-100 items-center justify-center mb-4">
              <CheckCircle size={36} color={palette.green['600']} />
            </View>
            <Text className="font-bold text-gray-900 text-xl">Inscrição confirmada!</Text>
            <Text className="text-sm text-gray-500 mt-1 text-center">Sua vaga está garantida em todas as aulas.</Text>
            <Pressable
              onPress={() => router.replace({ pathname: '/aulas/[id]', params: { id: state.classId } })}
              className="mt-6 w-full bg-violet-600 py-3 rounded-xl items-center"
            >
              <Text className="text-white font-bold text-base">Ver o curso</Text>
            </Pressable>
          </>
        )}
        {state.kind === 'failed' && (
          <>
            <XCircle size={48} color={palette.red['500']} />
            <Text className="font-bold text-gray-900 text-lg mt-4">Inscrição não concluída</Text>
            <Text className="text-sm text-gray-500 mt-1 text-center">{state.error}</Text>
            <Pressable onPress={() => router.replace('/aulas')} className="mt-6 w-full bg-gray-900 py-3 rounded-xl items-center">
              <Text className="text-white font-bold text-base">Ver cursos</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
