// Financeiro do gestor. Os números vêm de venue_finance() no banco (extrato único
// com o valor do clube, sem a taxa do JoggaHub): reservas, partidas abertas,
// day use e aulas, por mês do jogo/aula. Mais ocupação, potencial e repasse.
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle, ShieldCheck, Clock, TrendingUp, ChevronLeft, ChevronRight, Download, Banknote,
  CalendarCheck, Users, Sun, GraduationCap, Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface SimpleRevenueProps { venueId: string | null }

type Kind = 'reserva' | 'partida_aberta' | 'day_use' | 'aula';
type Status = 'recebido' | 'a_cobrar' | 'reservado' | 'pendente' | 'aguardando' | 'cancelado';

interface Entry {
  kind: Kind; ref_id: string; event_at: string; court_id: string; court_name: string;
  who: string; title: string; amount: number; status: Status;
}
interface Capacity {
  court_id: string; court_name: string; hours_created: number; hours_sold: number;
  hours_blocked: number; hours_free_future: number; potential: number;
}
interface Finance {
  entries: Entry[]; capacity: Capacity[];
  received_to_date: number; paid_out: number;
  last_payout: { amount: number; paid_at: string } | null;
}

const KIND: Record<Kind, { label: string; icon: typeof CalendarCheck; color: string }> = {
  reserva:        { label: 'Reservas',        icon: CalendarCheck, color: 'text-purple-600 bg-purple-50' },
  partida_aberta: { label: 'Partidas abertas', icon: Users,        color: 'text-blue-600 bg-blue-50' },
  day_use:        { label: 'Day use',          icon: Sun,          color: 'text-sky-600 bg-sky-50' },
  aula:           { label: 'Aulas',            icon: GraduationCap, color: 'text-amber-600 bg-amber-50' },
};

const ENTRY_LABEL: Record<Kind, string> = { reserva: 'Reserva', partida_aberta: 'Partida aberta', day_use: 'Day use', aula: 'Aula' };

const STATUS: Record<Status, { label: string; pill: string }> = {
  recebido:   { label: 'Recebido',              pill: 'bg-green-100 text-green-700' },
  a_cobrar:   { label: 'A cobrar',              pill: 'bg-teal-100 text-teal-700' },
  reservado:  { label: 'Reservado',             pill: 'bg-blue-100 text-blue-700' },
  pendente:   { label: 'Aguardando pagamento',  pill: 'bg-amber-100 text-amber-700' },
  aguardando: { label: 'Aguardando jogadores',  pill: 'bg-orange-100 text-orange-700' },
  cancelado:  { label: 'Cancelado',             pill: 'bg-gray-100 text-gray-500' },
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = (n: number) => String(n).padStart(2, '0');
const wallDay = (iso: string) => `${iso.substring(8, 10)}/${iso.substring(5, 7)}`;
const wallHour = (iso: string) => iso.substring(11, 16);

export function SimpleRevenue({ venueId }: SimpleRevenueProps) {
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [court, setCourt] = useState<string>('all');
  const [showCancelled, setShowCancelled] = useState(false);
  const [data, setData] = useState<Finance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const from = `${month.y}-${pad(month.m + 1)}-01`;
  const to = `${month.y}-${pad(month.m + 1)}-${pad(new Date(month.y, month.m + 1, 0).getDate())}`;

  useEffect(() => {
    if (!venueId) return;
    setLoading(true);
    setError('');
    supabase.rpc('venue_finance', { p_from: from, p_to: to }).then(({ data: d, error: e }) => {
      if (e) setError(e.message);
      setData((d as Finance) ?? null);
      setLoading(false);
    });
  }, [venueId, from, to]);

  const shift = (n: number) => setMonth(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const entries = useMemo(
    () => (data?.entries ?? []).filter(e => court === 'all' || e.court_id === court).map(e => ({ ...e, amount: Number(e.amount) })),
    [data, court],
  );
  const capacity = useMemo(
    () => (data?.capacity ?? []).filter(c => court === 'all' || c.court_id === court),
    [data, court],
  );

  const sum = (st: Status[]) => entries.filter(e => st.includes(e.status)).reduce((s, e) => s + e.amount, 0);
  const count = (st: Status[]) => entries.filter(e => st.includes(e.status)).length;
  const received = sum(['recebido']);
  const toCharge = sum(['a_cobrar']);
  const reserved = sum(['reservado']);
  const waiting = sum(['pendente', 'aguardando']);
  const potential = capacity.reduce((s, c) => s + Number(c.potential), 0);
  const balance = Math.max(0, Number(data?.received_to_date ?? 0) - Number(data?.paid_out ?? 0));

  const byKind = (Object.keys(KIND) as Kind[]).map(k => {
    const list = entries.filter(e => e.kind === k && e.status !== 'cancelado');
    return {
      k,
      count: list.length,
      received: list.filter(e => e.status === 'recebido').reduce((s, e) => s + e.amount, 0),
      future: list.filter(e => e.status !== 'recebido').reduce((s, e) => s + e.amount, 0),
    };
  });
  const kindMax = Math.max(1, ...byKind.map(b => b.received + b.future));

  const listed = entries.filter(e => showCancelled || e.status !== 'cancelado');
  const cancelledCount = count(['cancelado']);
  const courts = data?.capacity ?? [];

  function exportCsv() {
    const rows = [
      ['Data', 'Hora', 'Tipo', 'Jogador/aluno', 'Descrição', 'Quadra', 'Valor do clube (R$)', 'Situação'],
      ...listed.map(e => [
        wallDay(e.event_at) + '/' + e.event_at.substring(0, 4), wallHour(e.event_at), KIND[e.kind].label,
        e.who, e.title, e.court_name, e.amount.toFixed(2).replace('.', ','), STATUS[e.status].label,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-${month.y}-${pad(month.m + 1)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Financeiro</h2>
        <div className="flex items-center bg-white border border-gray-200 rounded-xl">
          <button onClick={() => shift(-1)} className="p-2 hover:bg-gray-50 rounded-l-xl" aria-label="Mês anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-3 text-sm font-semibold capitalize min-w-[130px] text-center">{MONTHS[month.m]} {month.y}</span>
          <button onClick={() => shift(1)} className="p-2 hover:bg-gray-50 rounded-r-xl" aria-label="Próximo mês"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {courts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ court_id: 'all', court_name: 'Todas as quadras' }, ...courts].map(c => (
            <button key={c.court_id} onClick={() => setCourt(c.court_id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${court === c.court_id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {c.court_name}
            </button>
          ))}
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : (
        <>
          {/* Indicadores do mês */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={CheckCircle} tone="green" label="Recebido" value={received} hint={`Já cobrado no cartão · ${count(['recebido'])} lançamentos`} />
            <Kpi icon={ShieldCheck} tone="teal" label="A cobrar" value={toCharge} hint="Prazo de cancelamento já passou; cobrado até 2h antes do jogo" />
            <Kpi icon={Wallet} tone="blue" label="Reservado" value={reserved} hint="Retido no cartão; o jogador ainda pode cancelar até 24h antes" />
            <Kpi icon={Clock} tone="amber" label="Aguardando" value={waiting} hint="Pagamento do jogador ou mínimo de jogadores" />
            <Kpi icon={TrendingUp} tone="gray" label="Potencial" value={potential} hint="Horários livres que você criou, se forem vendidos" />
          </div>

          {/* Repasse */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-wrap items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center"><Banknote className="w-6 h-6 text-emerald-600" /></div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm text-gray-500">Saldo a repassar pelo JoggaHub</p>
              <p className="text-2xl font-bold text-gray-900">{brl(balance)}</p>
              <p className="text-xs text-gray-400">Recebido de jogos e aulas que já aconteceram, menos o que já foi repassado.</p>
            </div>
            <div className="text-sm text-gray-500">
              {data?.last_payout
                ? <>Último repasse: <b className="text-gray-900">{brl(Number(data.last_payout.amount))}</b> em {wallDay(data.last_payout.paid_at)}</>
                : 'Nenhum repasse registrado ainda.'}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Por tipo */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="font-semibold text-gray-900 mb-4">Por tipo</p>
              <div className="space-y-4">
                {byKind.map(b => {
                  const K = KIND[b.k];
                  return (
                    <div key={b.k}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="flex items-center gap-2 font-medium text-gray-700">
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${K.color}`}><K.icon className="w-4 h-4" /></span>
                          {K.label} <span className="text-gray-400 font-normal">· {b.count}</span>
                        </span>
                        <span className="font-semibold text-gray-900">{brl(b.received + b.future)}</span>
                      </div>
                      <div className="flex h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="bg-green-500" style={{ width: `${(b.received / kindMax) * 100}%` }} />
                        <div className="bg-blue-300" style={{ width: `${(b.future / kindMax) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-4 flex gap-3">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />recebido</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-300" />a receber</span>
              </p>
            </div>

            {/* Ocupação por quadra */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="font-semibold text-gray-900 mb-4">Ocupação e potencial por quadra</p>
              {capacity.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum horário criado neste mês.</p>
              ) : (
                <div className="space-y-4">
                  {capacity.map(c => {
                    const created = Number(c.hours_created) || 0;
                    const sold = Number(c.hours_sold) || 0;
                    const blocked = Number(c.hours_blocked) || 0;
                    const pct = created > 0 ? Math.round((sold / created) * 100) : 0;
                    return (
                      <div key={c.court_id}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="font-medium text-gray-700">{c.court_name}</span>
                          <span className="font-semibold text-gray-900">{pct}%</span>
                        </div>
                        <div className="flex h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="bg-purple-600" style={{ width: `${created ? (sold / created) * 100 : 0}%` }} />
                          <div className="bg-gray-300" style={{ width: `${created ? (blocked / created) * 100 : 0}%` }} />
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {sold}h vendidas de {created}h criadas{blocked ? ` · ${blocked}h bloqueadas` : ''} · {Number(c.hours_free_future)}h livres pela frente
                          {Number(c.potential) > 0 && <> · potencial <b className="text-gray-700">{brl(Number(c.potential))}</b></>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Lançamentos */}
          <div className="bg-white rounded-2xl border border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-gray-100">
              <p className="font-semibold text-gray-900">Lançamentos <span className="text-gray-400 font-normal text-sm">· {listed.length}</span></p>
              <div className="flex items-center gap-3">
                {cancelledCount > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
                    Mostrar cancelados ({cancelledCount})
                  </label>
                )}
                <button onClick={exportCsv} disabled={!listed.length}
                  className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:underline disabled:opacity-40">
                  <Download className="w-4 h-4" /> Exportar planilha
                </button>
              </div>
            </div>
            {listed.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">Nenhum lançamento neste mês.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {listed.map(e => {
                  const K = KIND[e.kind];
                  return (
                    <div key={`${e.kind}-${e.ref_id}-${e.event_at}`} className="flex items-center gap-3 px-5 py-3">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${K.color}`}><K.icon className="w-4 h-4" /></span>
                      <div className="w-16 flex-shrink-0 text-sm">
                        <p className="font-semibold text-gray-900 tabular-nums">{wallDay(e.event_at)}</p>
                        <p className="text-xs text-gray-400 tabular-nums">{wallHour(e.event_at)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${e.status === 'cancelado' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{e.who}</p>
                        <p className="text-xs text-gray-500 truncate">{ENTRY_LABEL[e.kind]}{e.kind === 'aula' || e.kind === 'day_use' ? ` · ${e.title}` : ''} · {e.court_name}</p>
                      </div>
                      <span className={`hidden sm:inline text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS[e.status].pill}`}>{STATUS[e.status].label}</span>
                      <span className={`w-24 text-right text-sm font-bold tabular-nums ${e.status === 'cancelado' ? 'text-gray-300' : 'text-gray-900'}`}>{brl(e.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center px-2">
            Valores do clube (preço da quadra, do curso ou do day use), sem a taxa de serviço do JoggaHub. Cada lançamento entra no mês do jogo ou da aula.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, tone, label, value, hint }: { icon: typeof CheckCircle; tone: 'green' | 'teal' | 'blue' | 'amber' | 'gray'; label: string; value: number; hint: string }) {
  const t = {
    green: 'bg-green-100 text-green-600',
    teal: 'bg-teal-100 text-teal-600',
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
    gray: 'bg-gray-100 text-gray-500',
  }[tone];
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${t}`}><Icon className="w-5 h-5" /></div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900">{brl(value)}</p>
      <p className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</p>
    </div>
  );
}
