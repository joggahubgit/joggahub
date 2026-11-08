// Visão geral: números do período a partir das cobranças reais do Stripe.
import { useMemo, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { PeriodPicker, Stat, TIPO, brl, day, periodFor, useTransactions, type Period } from './shared';

export default function OverviewTab() {
  const [period, setPeriod] = useState<Period>(periodFor('month'));
  const { data, error } = useTransactions(period);
  const txs = data?.transactions ?? [];

  const k = useMemo(() => {
    const sum = (f: (t: typeof txs[number]) => number) => txs.reduce((s, t) => s + f(t), 0);
    const real = txs.filter(t => t.status !== 'liberado' && t.status !== 'incompleto');
    return {
      gmv: sum(t => t.charged),
      held: sum(t => t.held),
      refunded: sum(t => t.refunded),
      platformFee: sum(t => t.platform_fee),
      stripeFee: sum(t => t.stripe_fee),
      club: sum(t => t.club_share),
      refundCost: txs.filter(t => t.refunded > 0).reduce((s, t) => s + t.stripe_fee, 0),
      count: real.length,
      players: new Set(real.map(t => t.player)).size,
      venues: new Set(real.map(t => t.venue_id).filter(Boolean)).size,
    };
  }, [txs]);

  const byDay = useMemo(() => {
    const m = new Map<string, { gross: number; fee: number }>();
    for (const t of txs) {
      const d = t.created_at.substring(0, 10);
      const cur = m.get(d) ?? { gross: 0, fee: 0 };
      cur.gross += t.charged + t.held - t.refunded;
      cur.fee += t.platform_fee;
      m.set(d, cur);
    }
    // Todos os dias do período (zero onde não houve venda), até 62 barras
    const out: [string, { gross: number; fee: number }][] = [];
    const start = new Date(`${period.from}T12:00:00`);
    const end = new Date(`${period.to}T12:00:00`);
    for (let d = new Date(start); d <= end && out.length < 62; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push([key, m.get(key) ?? { gross: 0, fee: 0 }]);
    }
    return out;
  }, [txs, period.from, period.to]);
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v.gross));

  const byVenue = useMemo(() => {
    const m = new Map<string, { name: string; gross: number; club: number; fee: number; count: number }>();
    for (const t of txs) {
      if (t.status === 'liberado' || t.status === 'incompleto') continue;
      const key = t.venue_id ?? '—';
      const cur = m.get(key) ?? { name: t.venue_name, gross: 0, club: 0, fee: 0, count: 0 };
      cur.gross += t.charged + t.held - t.refunded; cur.club += t.club_share; cur.fee += t.platform_fee; cur.count++;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.gross - a.gross);
  }, [txs]);

  const byTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs) m.set(TIPO[t.tipo]?.label ?? t.tipo, (m.get(TIPO[t.tipo]?.label ?? t.tipo) ?? 0) + t.charged + t.held - t.refunded);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [txs]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Visão geral</h2>
        <PeriodPicker period={period} onChange={setPeriod} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}
      {!data ? (
        <p className="flex items-center justify-center gap-2 text-gray-400 py-16"><Loader2 className="w-5 h-5 animate-spin" />Buscando no Stripe…</p>
      ) : (
        <>
          {data.truncated && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">Período muito grande: mostrando as 1.000 cobranças mais recentes.</p>}
          {!!data.hidden && <p className="text-[11px] text-gray-400">{data.hidden} cobrança(s) do Stripe sem registro no app (testes antigos ou feitas fora do app) não entram nestes números.</p>}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Volume cobrado (GMV)" value={k.gmv} hint="Tudo que foi cobrado no cartão (inclui o que depois foi reembolsado)" />
            <Stat label="Receita JoggaHub (taxas)" value={k.platformFee} tone="purple" hint="8% + R$ 2,50 por pagamento" />
            <Stat label="Custo do Stripe" value={k.stripeFee} tone="red" hint="Taxa do cartão cobrada pelo Stripe" />
            <Stat label="Receita líquida" value={k.platformFee - k.stripeFee} tone={k.platformFee - k.stripeFee >= 0 ? 'green' : 'red'} hint="Taxas JoggaHub − custo do Stripe" />
            <Stat label="Parte dos clubes" value={k.club} tone="green" hint="A repassar aos clubes (cobrado + retido)" />
            <Stat label="Retido no cartão" value={k.held} tone="blue" hint="Ainda não cobrado; pode voltar ao jogador" />
            <Stat label="Reembolsado" value={k.refunded} hint="Devolvido aos jogadores" />
            <Stat label="Custo de reembolsos" value={k.refundCost} tone="red" hint="Taxa do Stripe que não volta quando há reembolso" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Pagamentos" value={k.count} money={false} />
            <Stat label="Jogadores pagantes" value={k.players} money={false} />
            <Stat label="Arenas com movimento" value={k.venues} money={false} />
          </div>

          {/* Por dia */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="font-semibold text-gray-900 mb-4">Volume por dia</p>
            {byDay.length === 0 ? <p className="text-sm text-gray-400">Nenhuma cobrança no período.</p> : (
              <div className="flex items-end gap-1 h-40">
                {byDay.map(([d, v]) => (
                  <div key={d} className="flex-1 min-w-[10px] flex flex-col items-center justify-end gap-1 group relative">
                    <div className={`w-full rounded-t ${v.gross > 0 ? 'bg-gray-900' : 'bg-gray-100'}`} style={{ height: `${Math.max(2, (v.gross / maxDay) * 130)}px` }} />
                    <span className="text-[9px] text-gray-400">{byDay.length <= 14 || Number(d.substring(8, 10)) % 5 === 1 ? day(d) : ''}</span>
                    <span className="absolute -top-8 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-[11px] rounded px-2 py-1">
                      {brl(v.gross)} · taxa {brl(v.fee)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="font-semibold text-gray-900 mb-3">Arenas</p>
              {byVenue.length === 0 ? <p className="text-sm text-gray-400">Sem movimento.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-[11px] text-gray-400 uppercase"><tr><th className="text-left font-semibold pb-2">Arena</th><th className="text-right font-semibold">Volume</th><th className="text-right font-semibold">Clube</th><th className="text-right font-semibold">Taxas</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {byVenue.map(v => (
                      <tr key={v.name}><td className="py-2">{v.name} <span className="text-gray-400 text-xs">· {v.count}</span></td>
                        <td className="text-right tabular-nums">{brl(v.gross)}</td><td className="text-right tabular-nums">{brl(v.club)}</td><td className="text-right tabular-nums text-purple-700">{brl(v.fee)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="font-semibold text-gray-900 mb-3">Por tipo</p>
              {byTipo.length === 0 ? <p className="text-sm text-gray-400">Sem movimento.</p> : byTipo.map(([l, v]) => (
                <div key={l} className="mb-3">
                  <div className="flex justify-between text-sm mb-1"><span>{l}</span><span className="font-semibold tabular-nums">{brl(v)}</span></div>
                  <div className="h-2 bg-gray-100 rounded-full"><div className="h-2 bg-gray-900 rounded-full" style={{ width: `${(v / Math.max(1, byTipo[0][1])) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          {k.refundCost > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-sm text-amber-900">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <p><b>Sugestão:</b> reembolsos custaram {brl(k.refundCost)} em taxas do Stripe neste período (o Stripe não devolve a taxa dele).
                É comum em marketplaces manter a taxa de serviço quando o jogador desiste, ou cobrar uma pequena taxa de cancelamento.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
