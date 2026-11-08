// Transações: cada cobrança do Stripe no período, com filtros, busca e planilha.
import { useMemo, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { PeriodPicker, TIPO, TX_STATUS, brl, downloadCsv, money, periodFor, useTransactions, type Period } from './shared';

export default function TransactionsTab() {
  const [period, setPeriod] = useState<Period>(periodFor('month'));
  const { data, error } = useTransactions(period);
  const [q, setQ] = useState('');
  const [venue, setVenue] = useState('all');
  const [tipo, setTipo] = useState('all');
  const [status, setStatus] = useState('all');

  const txs = data?.transactions ?? [];
  const venues = useMemo(() => [...new Map(txs.filter(t => t.venue_id).map(t => [t.venue_id!, t.venue_name])).entries()], [txs]);
  const list = txs.filter(t =>
    (venue === 'all' || t.venue_id === venue) &&
    (tipo === 'all' || (TIPO[t.tipo]?.label ?? t.tipo) === tipo) &&
    (status === 'all' || t.status === status) &&
    (!q || `${t.player} ${t.id} ${t.venue_name} ${t.description ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  );
  const tot = list.reduce((a, t) => ({
    gross: a.gross + t.charged + t.held - t.refunded, fee: a.fee + t.platform_fee, stripe: a.stripe + t.stripe_fee, club: a.club + t.club_share,
  }), { gross: 0, fee: 0, stripe: 0, club: 0 });

  function exportCsv() {
    downloadCsv(`transacoes-${period.from}-a-${period.to}.csv`, [
      ['Data', 'Hora', 'Arena', 'Quadra', 'Tipo', 'Jogador', 'Valor cobrado', 'Retido', 'Reembolsado', 'Parte do clube', 'Taxa JoggaHub', 'Taxa Stripe', 'Líquido JoggaHub', 'Situação', 'Situação no Stripe', 'Código Stripe'],
      ...list.map(t => [
        new Date(t.created_at).toLocaleDateString('pt-BR'), new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        t.venue_name, t.court_name, TIPO[t.tipo]?.label ?? t.tipo, t.player,
        money(t.charged), money(t.held), money(t.refunded), money(t.club_share), money(t.platform_fee), money(t.stripe_fee), money(t.net_platform),
        TX_STATUS[t.status]?.label ?? t.status, TX_STATUS[t.status]?.stripe ?? '', t.id,
      ]),
    ]);
  }

  const sel = 'border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Transações</h2>
        <PeriodPicker period={period} onChange={setPeriod} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] border border-gray-200 rounded-lg px-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar jogador, arena ou código pi_…" className="flex-1 py-1.5 text-sm outline-none" />
        </div>
        <select value={venue} onChange={e => setVenue(e.target.value)} className={sel}>
          <option value="all">Todas as arenas</option>
          {venues.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select value={tipo} onChange={e => setTipo(e.target.value)} className={sel}>
          <option value="all">Todos os tipos</option>
          {['Partida fechada', 'Partida aberta', 'Day use', 'Aula'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className={sel}>
          <option value="all">Todas as situações</option>
          {Object.entries(TX_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={exportCsv} disabled={!list.length} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-40">
          <Download className="w-4 h-4" />Planilha
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}
      {!data ? (
        <p className="flex items-center justify-center gap-2 text-gray-400 py-16"><Loader2 className="w-5 h-5 animate-spin" />Buscando no Stripe…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400 bg-gray-50">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Data</th>
                <th className="text-left font-semibold px-2 py-2">Arena · tipo</th>
                <th className="text-left font-semibold px-2 py-2">Jogador</th>
                <th className="text-left font-semibold px-2 py-2">Situação</th>
                <th className="text-right font-semibold px-2 py-2">Cobrado</th>
                <th className="text-right font-semibold px-2 py-2">Clube</th>
                <th className="text-right font-semibold px-2 py-2">Taxa JH</th>
                <th className="text-right font-semibold px-2 py-2">Stripe</th>
                <th className="text-right font-semibold px-4 py-2">Líquido JH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-10">Nenhuma transação.</td></tr>}
              {list.map(t => (
                <tr key={t.session_id} className="align-top hover:bg-gray-50">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <p className="text-gray-900">{new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                    <p className="text-[11px] text-gray-400">{new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{!t.livemode ? ' · teste' : ''}</p>
                  </td>
                  <td className="px-2 py-2.5">
                    <p className="text-gray-900">{t.venue_name}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TIPO[t.tipo]?.color ?? ''}`}>{TIPO[t.tipo]?.label ?? t.tipo}</span>
                    <span className="text-[11px] text-gray-400"> · {t.court_name}</span>
                  </td>
                  <td className="px-2 py-2.5">
                    <p className="text-gray-900">{t.player}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{t.id}</p>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${TX_STATUS[t.status]?.color ?? ''}`}>{TX_STATUS[t.status]?.label ?? t.status}</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">Stripe: {TX_STATUS[t.status]?.stripe}</p>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {t.charged > 0 && <p>{brl(t.charged)}</p>}
                    {t.held > 0 && <p className="text-blue-700">{brl(t.held)} <span className="text-[10px]">retido</span></p>}
                    {t.refunded > 0 && <p className="text-gray-400">−{brl(t.refunded)}</p>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{brl(t.club_share)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-purple-700">{brl(t.platform_fee)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-red-600">{t.stripe_fee ? `−${brl(t.stripe_fee)}` : '—'}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${t.net_platform < 0 ? 'text-red-600' : 'text-gray-900'}`}>{brl(t.net_platform)}</td>
                </tr>
              ))}
            </tbody>
            {list.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-2.5" colSpan={4}>Total · {list.length} transações</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{brl(tot.gross)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{brl(tot.club)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-purple-700">{brl(tot.fee)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-red-600">−{brl(tot.stripe)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{brl(tot.fee - tot.stripe)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
