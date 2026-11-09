// Situação do pagamento com cartão salvo nesta partida/curso, para o próprio
// jogador: "agendado" (nada cobrado ainda) ou "pendente" (banco recusou → Pagar agora).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatBRL, wallDateTimeLabel } from '../../lib/classSchedule';
import { deadlineLabel, type MyScheduledPayment } from './PendingPaymentPage';

export function useMyScheduledPayment(ref: { gameId?: string | null; classId?: string | null }, refreshKey?: unknown) {
  const [p, setP] = useState<MyScheduledPayment | null>(null);
  useEffect(() => {
    if (!ref.gameId && !ref.classId) return;
    let alive = true;
    supabase.rpc('my_scheduled_payments').then(({ data }) => {
      if (!alive) return;
      const all = (data ?? []) as MyScheduledPayment[];
      setP(all.find(x => (ref.gameId && x.game_id === ref.gameId) || (ref.classId && x.class_id === ref.classId)) ?? null);
    });
    return () => { alive = false; };
  }, [ref.gameId, ref.classId, refreshKey]);
  return p;
}

export default function ScheduledStatusBanner({ payment, className = '' }: { payment: MyScheduledPayment | null; className?: string }) {
  const navigate = useNavigate();
  if (!payment) return null;
  if (payment.status === 'failed') {
    return (
      <div className={`bg-amber-50 border border-amber-200 rounded-2xl p-4 ${className}`}>
        <p className="flex gap-2 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>O banco recusou a reserva de <b>{formatBRL(Number(payment.amount))}</b> no seu cartão. Pague até <b>{payment.pay_deadline ? deadlineLabel(payment.pay_deadline) : '—'}</b> para manter a vaga.</span>
        </p>
        <button onClick={() => navigate(`/pagamento-pendente/${payment.id}`)}
          className="mt-3 w-full bg-amber-500 text-white py-2.5 rounded-xl font-bold text-sm">Pagar agora</button>
      </div>
    );
  }
  return (
    <div className={`bg-sky-50 border border-sky-200 rounded-2xl p-4 flex gap-3 ${className}`}>
      <CalendarClock className="w-5 h-5 text-sky-600 flex-shrink-0" />
      <p className="text-sm text-sky-900">
        <b>Pagamento agendado.</b> Nada foi cobrado ainda: em <b>{wallDateTimeLabel(payment.hold_at)}</b> reservamos {formatBRL(Number(payment.amount))} no seu cartão salvo.
      </p>
    </div>
  );
}
