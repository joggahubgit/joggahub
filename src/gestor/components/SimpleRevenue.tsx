// Financeiro do gestor. Os números vêm de venue_finance() no banco (extrato único
// com o valor do clube, sem a taxa do JoggaHub): partidas fechadas, partidas
// abertas, day use e aulas, por mês do jogo/aula. Mais ocupação, potencial e
// repasse. Nomes e situações iguais aos do Stripe; clicar abre o extrato.
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle, ShieldCheck, Clock, TrendingUp, ChevronLeft, ChevronRight, Download, Banknote,
  CalendarCheck, Users, Sun, GraduationCap, Wallet, X, Loader2, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { GestorBookingDetail } from './GestorBookingDetail';
import { ClassDetailModal } from './ClassesPanel';

interface SimpleRevenueProps {
  venueId: string | null;
  /** Abre a Agenda no dia do lançamento (YYYY-MM-DD). */
  onOpenAgenda?: (date: string) => void;
}

type Kind = 'partida_fechada' | 'partida_aberta' | 'day_use' | 'aula' | 'reserva';
type ShownKind = Exclude<Kind, 'reserva'>;
/** Reserva antiga (sem partida ligada) aparece como partida fechada. */
const shownKind = (k: Kind): ShownKind => (k === 'reserva' ? 'partida_fechada' : k);
type Status = 'recebido' | 'a_cobrar' | 'reservado' | 'pendente' | 'aguardando' | 'cancelado';

interface Entry {
  kind: Kind; ref_id: string; event_at: string; court_id: string; court_name: string;
  who: string; title: string; amount: number; status: Status;
}
interface Capacity {
  court_id: string; court_name: string; hours_created: number; hours_sold: number;
  hours_blocked: number; hours_free_future: number; potential: number;
}
interface Payout {
  schedule: 'per_game' | 'weekly';
  covered_until: string | null;
  due_amount: number;
  due_items: Entry[];
  upcoming_amount: number;
  upcoming_held_amount: number;
  upcoming_count: number;
  next_upcoming_at: string | null;
  history: { amount: number; paid_at: string; covers_until: string | null; note: string | null }[];
}
interface Finance {
  entries: Entry[]; capacity: Capacity[];
  payout: Payout;
}

const KIND: Record<ShownKind, { label: string; icon: typeof CalendarCheck; color: string }> = {
  partida_fechada: { label: 'Partidas fechadas', icon: CalendarCheck, color: 'text-purple-600 bg-purple-50' },
  partida_aberta: { label: 'Partidas abertas', icon: Users,        color: 'text-blue-600 bg-blue-50' },
  day_use:        { label: 'Day use',          icon: Sun,          color: 'text-sky-600 bg-sky-50' },
  aula:           { label: 'Aulas',            icon: GraduationCap, color: 'text-amber-600 bg-amber-50' },
};

const ENTRY_LABEL: Record<ShownKind, string> = { partida_fechada: 'Partida fechada', partida_aberta: 'Partida aberta', day_use: 'Day use', aula: 'Aula' };

// Situações com o termo equivalente do Stripe (painel em português)
const STATUS: Record<Status, { label: string; pill: string; stripe: string }> = {
  recebido:   { label: 'Pago',                     pill: 'bg-green-100 text-green-700',  stripe: 'Bem-sucedido' },
  a_cobrar:   { label: 'Retido · será cobrado',    pill: 'bg-teal-100 text-teal-700',    stripe: 'Não capturado' },
  reservado:  { label: 'Retido · pode cancelar',   pill: 'bg-blue-100 text-blue-700',    stripe: 'Não capturado' },
  pendente:   { label: 'Aguardando pagamento',     pill: 'bg-amber-100 text-amber-700',  stripe: '—' },
  aguardando: { label: 'Aguardando jogadores',     pill: 'bg-orange-100 text-orange-700', stripe: 'Não capturado' },
  cancelado:  { label: 'Cancelado / reembolsado',  pill: 'bg-gray-100 text-gray-500',    stripe: 'Cancelado / Reembolsado' },
};
type Filter = 'recebido' | 'a_cobrar' | 'reservado' | 'aguardando_all' | null;
const FILTER_STATUSES: Record<Exclude<Filter, null>, Status[]> = {
  recebido: ['recebido'], a_cobrar: ['a_cobrar'], reservado: ['reservado'], aguardando_all: ['pendente', 'aguardando'],
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = (n: number) => String(n).padStart(2, '0');
const wallDay = (iso: string) => `${iso.substring(8, 10)}/${iso.substring(5, 7)}`;
const wallHour = (iso: string) => iso.substring(11, 16);

export function SimpleRevenue({ venueId, onOpenAgenda }: SimpleRevenueProps) {
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [court, setCourt] = useState<string>('all');
  const [showCancelled, setShowCancelled] = useState(false);
  const [filter, setFilter] = useState<Filter>(null);
  const [statement, setStatement] = useState<Entry | null>(null);
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

  const byKind = (Object.keys(KIND) as ShownKind[]).map(k => {
    const list = entries.filter(e => shownKind(e.kind) === k && e.status !== 'cancelado');
    return {
      k,
      count: list.length,
      received: list.filter(e => e.status === 'recebido').reduce((s, e) => s + e.amount, 0),
      future: list.filter(e => e.status !== 'recebido').reduce((s, e) => s + e.amount, 0),
    };
  });
  const kindMax = Math.max(1, ...byKind.map(b => b.received + b.future));

  const listed = entries
    .filter(e => !filter || FILTER_STATUSES[filter].includes(e.status))
    .filter(e => showCancelled || filter || e.status !== 'cancelado');

  function pick(f: Exclude<Filter, null>) {
    setFilter(cur => (cur === f ? null : f));
    setTimeout(() => document.getElementById('lancamentos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  const cancelledCount = count(['cancelado']);
  const courts = data?.capacity ?? [];

  function exportCsv() {
    const rows = [
      ['Data', 'Hora', 'Tipo', 'Jogador/aluno', 'Descrição', 'Quadra', 'Valor do clube (R$)', 'Situação', 'Situação no Stripe'],
      ...listed.map(e => [
        wallDay(e.event_at) + '/' + e.event_at.substring(0, 4), wallHour(e.event_at), ENTRY_LABEL[shownKind(e.kind)],
        e.who, e.title, e.court_name, e.amount.toFixed(2).replace('.', ','), STATUS[e.status].label, STATUS[e.status].stripe,
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
            <Kpi icon={CheckCircle} tone="green" label="Pago" value={received} active={filter === 'recebido'} onClick={() => pick('recebido')}
              hint={`Cobrado no cartão · no Stripe: Bem-sucedido · ${count(['recebido'])} lançamentos`} />
            <Kpi icon={ShieldCheck} tone="teal" label="Retido · será cobrado" value={toCharge} active={filter === 'a_cobrar'} onClick={() => pick('a_cobrar')}
              hint="Prazo de cancelamento passou; cobrado até 2h antes · no Stripe: Não capturado" />
            <Kpi icon={Wallet} tone="blue" label="Retido · pode cancelar" value={reserved} active={filter === 'reservado'} onClick={() => pick('reservado')}
              hint="O jogador ainda pode cancelar até 24h antes · no Stripe: Não capturado" />
            <Kpi icon={Clock} tone="amber" label="Aguardando" value={waiting} active={filter === 'aguardando_all'} onClick={() => pick('aguardando_all')}
              hint="Pagamento do jogador ou mínimo de jogadores" />
            <Kpi icon={TrendingUp} tone="gray" label="Potencial" value={potential} hint="Horários livres que você criou, se forem vendidos" />
          </div>

          {/* Repasses */}
          {data?.payout && <PayoutCard payout={data.payout} onOpen={setStatement} />}

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
          <div id="lancamentos" className="bg-white rounded-2xl border border-gray-200 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900">Lançamentos <span className="text-gray-400 font-normal text-sm">· {listed.length}</span></p>
                {filter && (
                  <button onClick={() => setFilter(null)} className="flex items-center gap-1 text-xs font-semibold bg-gray-900 text-white rounded-full pl-2.5 pr-1.5 py-1">
                    {filter === 'aguardando_all' ? 'Aguardando' : STATUS[FILTER_STATUSES[filter][0]].label}<X className="w-3 h-3" />
                  </button>
                )}
                <span className="text-xs text-gray-400 hidden md:inline">Clique num lançamento para ver o extrato</span>
              </div>
              <div className="flex items-center gap-3">
                {cancelledCount > 0 && !filter && (
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
                  const K = KIND[shownKind(e.kind)];
                  return (
                    <button key={`${e.kind}-${e.ref_id}-${e.event_at}`} onClick={() => setStatement(e)}
                      className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${K.color}`}><K.icon className="w-4 h-4" /></span>
                      <div className="w-16 flex-shrink-0 text-sm">
                        <p className="font-semibold text-gray-900 tabular-nums">{wallDay(e.event_at)}</p>
                        <p className="text-xs text-gray-400 tabular-nums">{wallHour(e.event_at)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${e.status === 'cancelado' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{e.who}</p>
                        <p className="text-xs text-gray-500 truncate">{ENTRY_LABEL[shownKind(e.kind)]}{e.kind === 'aula' || e.kind === 'day_use' ? ` · ${e.title}` : ''} · {e.court_name}</p>
                      </div>
                      <span className={`hidden sm:inline text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS[e.status].pill}`}>{STATUS[e.status].label}</span>
                      <span className={`w-24 text-right text-sm font-bold tabular-nums ${e.status === 'cancelado' ? 'text-gray-300' : 'text-gray-900'}`}>{brl(e.amount)}</span>
                    </button>
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
      {statement && (
        <StatementModal
          entry={statement}
          onClose={() => setStatement(null)}
          onOpenAgenda={onOpenAgenda ? (d) => { setStatement(null); onOpenAgenda(d); } : undefined}
        />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, tone, label, value, hint, onClick, active }: {
  icon: typeof CheckCircle; tone: 'green' | 'teal' | 'blue' | 'amber' | 'gray'; label: string; value: number; hint: string;
  onClick?: () => void; active?: boolean;
}) {
  const t = {
    green: 'bg-green-100 text-green-600',
    teal: 'bg-teal-100 text-teal-600',
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
    gray: 'bg-gray-100 text-gray-500',
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`text-left bg-white rounded-2xl border p-4 transition-all ${active ? 'border-gray-900 ring-2 ring-gray-900/10' : 'border-gray-200'} ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${t}`}><Icon className="w-5 h-5" /></div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900">{brl(value)}</p>
      <p className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</p>
      {onClick && <p className="text-[11px] font-semibold text-purple-600 mt-2">{active ? 'Mostrando na lista ↓' : 'Ver lançamentos →'}</p>}
    </button>
  );
}

// ── Repasses do JoggaHub ao clube ───────────────────────────────────────────
// Não depende do mês escolhido: mostra o que já pode ser repassado, o previsto
// e o histórico, com a regra escrita para não criar expectativa errada.

function nextMonday() {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

function PayoutCard({ payout, onOpen }: { payout: Payout; onOpen: (e: Entry) => void }) {
  const [showItems, setShowItems] = useState(false);
  const due = Number(payout.due_amount);
  const upcoming = Number(payout.upcoming_amount);
  const held = Number(payout.upcoming_held_amount);
  const rule = payout.schedule === 'weekly'
    ? `Repasse semanal: toda segunda-feira, com os jogos e aulas da semana anterior (segunda a domingo). Próximo: ${nextMonday()}.`
    : 'Repasse por partida: o JoggaHub transfere o valor de cada partida ou aula logo depois que ela acontece.';
  const last = payout.history[0];

  return (
    <div className="bg-white rounded-2xl border border-gray-200">
      <div className="p-5 flex flex-wrap items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0"><Banknote className="w-6 h-6 text-emerald-600" /></div>
        <div className="flex-1 min-w-[220px]">
          <p className="font-semibold text-gray-900">Repasses do JoggaHub</p>
          <p className="text-xs text-gray-500 mt-0.5">{rule}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-px bg-gray-100 border-t border-gray-100">
        <div className="bg-white p-5">
          <p className="text-sm text-gray-500">A repassar agora</p>
          <p className="text-2xl font-bold text-emerald-700">{brl(due)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {payout.due_items.length
              ? `${payout.due_items.length} ${payout.due_items.length === 1 ? 'partida/aula já realizada e paga' : 'partidas/aulas já realizadas e pagas'}${payout.covered_until ? ` desde o último repasse` : ''}.`
              : 'Nada pendente: tudo o que já aconteceu foi repassado.'}
          </p>
          {payout.due_items.length > 0 && (
            <button onClick={() => setShowItems(v => !v)} className="text-xs font-semibold text-purple-600 mt-2">
              {showItems ? 'Esconder itens' : 'Ver o que entra →'}
            </button>
          )}
        </div>
        <div className="bg-white p-5">
          <p className="text-sm text-gray-500">Previsto nos próximos repasses</p>
          <p className="text-2xl font-bold text-gray-900">{brl(upcoming)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {upcoming > 0
              ? <>De {payout.upcoming_count} {payout.upcoming_count === 1 ? 'partida/aula futura' : 'partidas/aulas futuras'}. Entra no repasse depois que acontecer
                  {held > 0 ? <>; {brl(held)} ainda está só retido no cartão e pode voltar ao jogador se ele cancelar a tempo</> : ''}.</>
              : 'Nenhuma partida futura paga ainda.'}
          </p>
        </div>
      </div>

      {showItems && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {payout.due_items.map(e => (
            <button key={`${e.kind}-${e.ref_id}-${e.event_at}`} onClick={() => onOpen(e)}
              className="w-full text-left flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 text-sm">
              <span className="w-14 text-gray-500 tabular-nums">{wallDay(e.event_at)}</span>
              <span className="flex-1 truncate text-gray-900">{e.who} <span className="text-gray-400">· {ENTRY_LABEL[shownKind(e.kind)]} · {e.court_name}</span></span>
              <span className="font-semibold tabular-nums">{brl(Number(e.amount))}</span>
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
        {last ? (
          <details>
            <summary className="cursor-pointer">
              Último repasse: <b className="text-gray-900">{brl(Number(last.amount))}</b> em {wallDay(last.paid_at)}
              {last.covers_until ? ` (jogos até ${wallDay(last.covers_until)} ${wallHour(last.covers_until)})` : ''} · ver histórico
            </summary>
            <div className="mt-2 space-y-1">
              {payout.history.map((h, i) => (
                <p key={i} className="flex justify-between gap-3">
                  <span>{wallDay(h.paid_at)}/{h.paid_at.substring(0, 4)}{h.covers_until ? ` · jogos até ${wallDay(h.covers_until)}` : ''}{h.note ? ` · ${h.note}` : ''}</span>
                  <b className="text-gray-900 tabular-nums">{brl(Number(h.amount))}</b>
                </p>
              ))}
            </div>
          </details>
        ) : 'Nenhum repasse registrado ainda.'}
      </div>
    </div>
  );
}

// ── Extrato de um lançamento (direto do Stripe) ─────────────────────────────

interface StatementLine {
  who: string; role: string; paymentId: string | null; stripeStatus: string;
  charged: number; held: number; refunded: number; clubShare: number; fee: number; date: string | null;
}
interface Statement {
  header: { title?: string; court?: string; when?: string; courtPrice?: number; lessons?: number; bookingId?: string | null; classId?: string; gameId?: string };
  lines: StatementLine[];
  total: { charged: number; held: number; refunded: number; clubShare: number; fee: number };
}

function StatementModal({ entry, onClose, onOpenAgenda }: { entry: Entry; onClose: () => void; onOpenAgenda?: (date: string) => void }) {
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<'booking' | 'class' | null>(null);

  useEffect(() => {
    supabase.functions.invoke('finance-statement', { body: { kind: entry.kind, refId: entry.ref_id } })
      .then(async ({ data: d, error: e }) => {
        if (e) {
          const body = await (e as any).context?.json?.().catch(() => null);
          setError(body?.error ?? e.message ?? 'Não foi possível carregar o extrato.');
          return;
        }
        setData(d as Statement);
      });
  }, [entry]);

  const pill = (st: string) =>
    st === 'Bem-sucedido' ? 'bg-green-100 text-green-700'
      : st === 'Não capturado' ? 'bg-blue-100 text-blue-700'
        : st.startsWith('Reembolsado') || st === 'Cancelado' ? 'bg-gray-100 text-gray-500'
          : 'bg-amber-100 text-amber-700';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Extrato</p>
            <h3 className="text-lg font-bold text-gray-900 truncate">{data?.header.title ?? ENTRY_LABEL[shownKind(entry.kind)]}</h3>
            <p className="text-sm text-gray-500">
              {entry.court_name} · {wallDay(data?.header.when ?? entry.event_at)} {wallHour(data?.header.when ?? entry.event_at)}
              {data?.header.lessons && data.header.lessons > 1 ? ` · curso de ${data.header.lessons} aulas (valores do curso inteiro)` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="overflow-y-auto flex-1">
          {error ? (
            <p className="text-sm text-red-600 p-6">{error}</p>
          ) : !data ? (
            <p className="flex items-center justify-center gap-2 text-sm text-gray-400 py-12"><Loader2 className="w-4 h-4 animate-spin" />Buscando no Stripe…</p>
          ) : data.lines.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Nenhum pagamento nesta partida.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-gray-400 bg-gray-50">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Quem pagou</th>
                  <th className="text-left font-semibold px-2 py-2">No Stripe</th>
                  <th className="text-right font-semibold px-2 py-2">No cartão</th>
                  <th className="text-right font-semibold px-2 py-2">Taxa JoggaHub</th>
                  <th className="text-right font-semibold px-4 py-2">Parte do clube</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.lines.map((l, i) => (
                  <tr key={i} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{l.who}</p>
                      <p className="text-[11px] text-gray-400">{l.role}{l.date ? ` · ${new Date(l.date).toLocaleDateString('pt-BR')}` : ''}</p>
                      {l.paymentId && <p className="text-[11px] text-gray-400 font-mono">{l.paymentId}</p>}
                    </td>
                    <td className="px-2 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${pill(l.stripeStatus)}`}>{l.stripeStatus}</span></td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {l.charged > 0 && <p className="text-gray-900">{brl(l.charged)}</p>}
                      {l.held > 0 && <p className="text-blue-700">{brl(l.held)} <span className="text-[10px]">retido</span></p>}
                      {l.refunded > 0 && <p className="text-gray-400">−{brl(l.refunded)} <span className="text-[10px]">reemb.</span></p>}
                      {!l.charged && !l.held && !l.refunded && <p className="text-gray-300">—</p>}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-gray-500">{l.fee ? brl(l.fee) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{l.clubShare ? brl(l.clubShare) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {data.total.charged > 0 && <p>{brl(data.total.charged)}</p>}
                    {data.total.held > 0 && <p className="text-blue-700">{brl(data.total.held)} <span className="text-[10px]">retido</span></p>}
                    {data.total.refunded > 0 && <p className="text-gray-400">−{brl(data.total.refunded)}</p>}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-gray-500">{brl(data.total.fee)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(data.total.clubShare)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
          {data?.header.bookingId && (
            <button onClick={() => setDetail('booking')}
              className="px-3 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700">Ver detalhes da partida</button>
          )}
          {data?.header.classId && (
            <button onClick={() => setDetail('class')}
              className="px-3 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700">
              {entry.kind === 'day_use' ? 'Ver detalhes do day use' : 'Ver detalhes do curso'}
            </button>
          )}
          {onOpenAgenda && (
            <button onClick={() => onOpenAgenda((data?.header.when ?? entry.event_at).substring(0, 10))}
              className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50">Ver na agenda</button>
          )}
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5 ml-auto">
            <ExternalLink className="w-3.5 h-3.5" />Valores lidos do Stripe agora; confira pelo código pi_… no painel do Stripe.
          </p>
        </div>
      </div>
      {detail === 'booking' && data?.header.bookingId && (
        <div onClick={e => e.stopPropagation()}>
          <GestorBookingDetail bookingId={data.header.bookingId} onClose={() => setDetail(null)} onChanged={() => setDetail(null)} />
        </div>
      )}
      {detail === 'class' && data?.header.classId && (
        <div onClick={e => e.stopPropagation()}>
          <ClassDetailModal classId={data.header.classId} onClose={() => setDetail(null)} onCancelled={() => { setDetail(null); onClose(); }} />
        </div>
      )}
    </div>
  );
}
