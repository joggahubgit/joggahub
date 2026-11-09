// Aviso antes de pagar: reserva com mais de 6 dias de antecedência só salva o
// cartão agora; o valor é reservado automaticamente 6 dias antes do início.
import { CalendarClock } from 'lucide-react';
import { formatBRL, scheduledHold } from '../../lib/classSchedule';

export default function ScheduledHoldNotice({ startIso, amount, chargeText, className = '' }: {
  /** Início em wall clock: "YYYY-MM-DDTHH:MM" */
  startIso: string;
  amount: number;
  /** Ex.: "cobrado 2h antes da partida" */
  chargeText: string;
  className?: string;
}) {
  const plan = scheduledHold(startIso);
  if (!plan.scheduled) return null;
  return (
    <div className={`bg-sky-50 border border-sky-200 rounded-2xl p-4 flex gap-3 ${className}`}>
      <CalendarClock className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-sky-900 space-y-1">
        <p><b>Nada é cobrado agora.</b> Seu cartão fica salvo e a vaga já é sua.</p>
        <p>Em <b>{plan.holdOn}</b> reservamos <b>{formatBRL(amount)}</b> no cartão ({chargeText}).</p>
        <p className="text-xs text-sky-700">Se o banco recusar, você recebe um aviso e tem 24h para pagar por aqui.</p>
      </div>
    </div>
  );
}
