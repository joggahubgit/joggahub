// Jogador pediu para sair depois do prazo de desistência grátis (24h antes) e
// o clube autoriza: ele recebe tudo de volta menos a taxa de serviço JoggaHub.
// Só aparece entre o fim do prazo grátis e o início.
import { useState } from 'react';
import { Loader2, UserMinus } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { wallMs, wallNowMs } from '@/app/lib/wallClock';

const FREE_CANCEL_HOURS = 24;

/** Entre o fim do prazo grátis e o início: só o clube pode liberar a saída. */
export function inLateCancelWindow(startIso: string | null | undefined) {
  if (!startIso) return false;
  const left = wallMs(startIso) - wallNowMs();
  return left > 0 && left <= FREE_CANCEL_HOURS * 3600_000;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function AuthorizeLateCancel({ body, who, label = 'Autorizar saída', compact = false, onDone }: {
  body: { enrollmentId?: string; gameId?: string; playerId?: string; whole?: boolean };
  /** Ex.: "Maria" ou "a reserva de João" */
  who: string;
  label?: string;
  compact?: boolean;
  onDone: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('club-authorize-cancel', { body });
    setBusy(false);
    if (fnErr) {
      const parsed = await (fnErr as { context?: Response }).context?.json?.().catch(() => null);
      setError(parsed?.error ?? 'Não foi possível autorizar.');
      return;
    }
    setOpen(false);
    onDone(data?.fee > 0
      ? `Saída autorizada. ${who} recebe ${brl(Number(data.refunded))} de volta; a taxa de serviço (${brl(Number(data.fee))}) não é devolvida.`
      : `Saída autorizada. Nada tinha sido cobrado de ${who}.`);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className={compact
          ? 'text-xs font-semibold text-red-600 hover:underline flex-shrink-0'
          : 'w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-amber-200 text-amber-700 font-semibold hover:bg-amber-50 text-sm'}>
        {!compact && <UserMinus className="w-4 h-4" />}{label}
      </button>
    );
  }
  return (
    <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 text-left">
      <p className="text-sm font-semibold text-amber-900">Autorizar a saída de {who}?</p>
      <p className="text-xs text-amber-800">
        Use quando o jogador pedir para sair depois do prazo de desistência grátis (24h antes).
        Ele recebe tudo de volta, menos a taxa de serviço JoggaHub (8% + R$ 2,50). A vaga é liberada.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} disabled={busy}
          className="flex-1 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm font-semibold">Voltar</button>
        <button onClick={confirm} disabled={busy}
          className="flex-1 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Autorizar'}
        </button>
      </div>
    </div>
  );
}
