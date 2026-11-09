// "Pagar agora": o banco recusou a retenção automática do cartão salvo e o
// jogador tem 24h para pagar (pode usar outro cartão), senão perde a vaga.
// /pagamento-pendente/:id (link do email) ou /pagamento-pendente (todos).
// Na volta do Stripe (?session_id=…) o servidor registra o pagamento.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle, CreditCard, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import BottomNav from '../BottomNav';
import { formatBRL, wallDateTimeLabel } from '../../lib/classSchedule';

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

async function fnError(err: unknown, fallback: string) {
  try {
    const body = await (err as { context?: Response }).context?.json();
    if (body?.error) return body.error as string;
  } catch { /* ignore */ }
  return (err as Error)?.message ?? fallback;
}

type Done = { gameId: string | null; classId: string | null };

export default function PendingPaymentPage() {
  const { id } = useParams<{ id?: string }>();
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const navigate = useNavigate();
  const [items, setItems] = useState<MyScheduledPayment[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const [confirming, setConfirming] = useState(!!sessionId);
  const tries = useRef(0);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_scheduled_payments');
    const all = (data ?? []) as MyScheduledPayment[];
    setItems(id ? all.filter(p => p.id === id) : all.filter(p => p.status === 'failed'));
  }, [id]);

  useEffect(() => { if (!sessionId) load(); }, [load, sessionId]);

  // Volta do Stripe: espera o servidor registrar
  useEffect(() => {
    if (!sessionId) return;
    let stop = false;
    async function poll() {
      if (stop) return;
      tries.current += 1;
      const { data } = await supabase.functions.invoke('finalize-checkout', { body: { sessionId } });
      if (stop) return;
      if (data?.status === 'done') {
        setDone({ gameId: data.gameId ?? null, classId: data.classId ?? null });
        setConfirming(false);
        return;
      }
      if (data?.status === 'failed') {
        setError(`${data.error ?? 'Não foi possível concluir o pagamento.'} O valor foi liberado no seu cartão.`);
        setConfirming(false);
        load();
        return;
      }
      if (tries.current >= 20) {
        setError('Seu pagamento está sendo processado. Confira em alguns minutos.');
        setConfirming(false);
        return;
      }
      setTimeout(poll, 1500);
    }
    poll();
    return () => { stop = true; };
  }, [sessionId, load]);

  async function pay(p: MyScheduledPayment) {
    setBusy(p.id);
    setError('');
    const back = `${window.location.origin}/pagamento-pendente/${p.id}`;
    const { data, error: fnErr } = await supabase.functions.invoke('create-retry-checkout-session', {
      body: { scheduledPaymentId: p.id, successUrl: back, cancelUrl: back },
    });
    if (fnErr || !data?.url) {
      setError(fnErr ? await fnError(fnErr, 'Não foi possível abrir o pagamento.') : 'Não foi possível abrir o pagamento.');
      setBusy(null);
      load();
      return;
    }
    window.location.href = data.url;
  }

  const open = (g: string | null, c: string | null) =>
    navigate(c ? `/aulas/${c}` : g ? `/open-game/${g}` : '/home', { replace: true });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-violet-600 text-white px-6 pt-6 pb-8 rounded-b-3xl">
        <button onClick={() => navigate('/home')} aria-label="Voltar" className="mb-4"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-2xl font-bold">Pagamento pendente</h1>
        <p className="text-violet-100 mt-1">Pague dentro do prazo para manter sua vaga.</p>
      </div>

      <div className="px-6 -mt-4 space-y-3">
        {confirming && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <Loader2 className="w-10 h-10 text-violet-600 animate-spin mx-auto mb-3" />
            <p className="font-semibold text-gray-900">Confirmando seu pagamento…</p>
          </div>
        )}

        {done && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-9 h-9 text-green-600" /></div>
            <p className="font-bold text-gray-900 text-xl">Pagamento confirmado!</p>
            <p className="text-sm text-gray-500 mt-1">Sua vaga está mantida. O valor fica reservado no cartão e é cobrado perto do horário, como nas outras reservas.</p>
            <button onClick={() => open(done.gameId, done.classId)} className="mt-6 w-full bg-violet-600 text-white py-3 rounded-xl font-bold">Ver a reserva</button>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm">{error}</div>}

        {!confirming && !done && items === null && <p className="text-center text-gray-400 py-8">Carregando…</p>}

        {!confirming && !done && items?.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-sm text-gray-600">
            Nenhum pagamento pendente. Se você já pagou, sua vaga está mantida.
            <button onClick={() => navigate('/home')} className="block mx-auto mt-4 text-violet-600 font-semibold">Ir para o início</button>
          </div>
        )}

        {!confirming && !done && items?.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <p className="font-semibold text-gray-900">{p.description}</p>
            <p className="text-sm text-gray-600">Início: <b className="text-gray-900">{wallDateTimeLabel(p.starts_at)}</b></p>
            {p.status === 'failed' ? (
              <>
                <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>O banco recusou a reserva no seu cartão. Pague até <b>{p.pay_deadline ? deadlineLabel(p.pay_deadline) : '—'}</b>, senão a vaga é cancelada. Você pode usar outro cartão.</span>
                </div>
                <button onClick={() => pay(p)} disabled={busy === p.id}
                  className="w-full bg-violet-600 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                  <CreditCard className="w-5 h-5" />{busy === p.id ? 'Abrindo pagamento…' : `Pagar agora · ${formatBRL(Number(p.amount))}`}
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-600">Cartão salvo. Vamos reservar <b className="text-gray-900">{formatBRL(Number(p.amount))}</b> no seu cartão em <b className="text-gray-900">{wallDateTimeLabel(p.hold_at)}</b>. Nada foi cobrado ainda.</p>
            )}
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
