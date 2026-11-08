// Repasses: o que está devido por arena (registrar), calendário de repasses
// previstos por dia/semana e histórico.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { brl, day, ymd } from './shared';

interface Item { kind: string; ref_id: string; event_at: string; court_name: string; who: string; title: string; amount: number }
interface Summary {
  schedule: 'per_game' | 'weekly';
  covered_until: string | null;
  due_amount: number;
  due_items: Item[];
  upcoming_amount: number;
  upcoming_held_amount: number;
  upcoming_count: number;
  history: { amount: number; paid_at: string; covers_until: string | null; note: string | null }[];
}
interface VenueRow { venue_id: string; venue_name: string; city: string | null; summary: Summary }
interface ForecastRow { due_date: string; venue_id: string; venue_name: string; schedule: string; paid: number | null; held: number | null; items: number }

const KIND: Record<string, string> = { partida_fechada: 'Partida fechada', reserva: 'Partida fechada', partida_aberta: 'Partida aberta', day_use: 'Day use', aula: 'Aula' };
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export default function PayoutsTab() {
  const [rows, setRows] = useState<VenueRow[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_payouts_overview');
    if (e) { setError(e.message); setRows([]); return; }
    setRows((data as VenueRow[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const totalDue = (rows ?? []).reduce((s, r) => s + Number(r.summary.due_amount), 0);

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-gray-900">Repasses</h2>
      {rows === null ? (
        <p className="flex items-center justify-center gap-2 text-gray-400 py-16"><Loader2 className="w-5 h-5 animate-spin" />Carregando…</p>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center"><Banknote className="w-6 h-6 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total a repassar agora (todas as arenas)</p>
              <p className="text-2xl font-bold text-emerald-700">{brl(totalDue)}</p>
            </div>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}

          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Devido agora, por arena</p>
            {rows.map(r => (
              <VenueCard key={r.venue_id} row={r} expanded={open === r.venue_id}
                onToggle={() => setOpen(o => (o === r.venue_id ? null : r.venue_id))} onChanged={load} />
            ))}
          </div>

          <Forecast />
        </>
      )}
    </div>
  );
}

// ── Calendário de repasses previstos ────────────────────────────────────────
function Forecast() {
  const [view, setView] = useState<'day' | 'week'>('day');
  const [rows, setRows] = useState<ForecastRow[] | null>(null);
  const [error, setError] = useState('');
  const from = ymd(new Date());
  const to = ymd(new Date(Date.now() + 60 * 86400_000));

  useEffect(() => {
    supabase.rpc('admin_payout_forecast', { p_from: from, p_to: to }).then(({ data, error: e }) => {
      if (e) setError(e.message);
      setRows((data as ForecastRow[]) ?? []);
    });
  }, [from, to]);

  const groups = useMemo(() => {
    const keyOf = (d: string) => {
      if (view === 'day') return d;
      const dt = new Date(`${d}T12:00:00`);
      const monday = new Date(dt); monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      return ymd(monday);
    };
    const m = new Map<string, { paid: number; held: number; venues: Map<string, { name: string; paid: number; held: number }> }>();
    for (const r of rows ?? []) {
      const k = keyOf(r.due_date);
      const g = m.get(k) ?? { paid: 0, held: 0, venues: new Map() };
      g.paid += Number(r.paid ?? 0); g.held += Number(r.held ?? 0);
      const v = g.venues.get(r.venue_id) ?? { name: r.venue_name, paid: 0, held: 0 };
      v.paid += Number(r.paid ?? 0); v.held += Number(r.held ?? 0);
      g.venues.set(r.venue_id, v);
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, view]);

  const label = (k: string) => {
    const d = new Date(`${k}T12:00:00`);
    if (view === 'day') return `${WEEKDAYS[d.getDay()]}, ${day(k)}`;
    const end = new Date(d); end.setDate(d.getDate() + 6);
    return `Semana ${day(k)} a ${day(ymd(end))}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-gray-100">
        <div>
          <p className="font-semibold text-gray-900">Repasses previstos (próximos 60 dias)</p>
          <p className="text-xs text-gray-500">Pela regra de cada arena: por partida = no dia do jogo; semanal = na segunda seguinte.</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-semibold">
          {(['day', 'week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              {v === 'day' ? 'Por dia' : 'Por semana'}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600 p-4">{error}</p>}
      {rows === null ? <p className="text-sm text-gray-400 p-6 text-center">Carregando…</p>
        : groups.length === 0 ? <p className="text-sm text-gray-400 p-6 text-center">Nenhum repasse previsto.</p> : (
          <div className="divide-y divide-gray-100">
            {groups.map(([k, g]) => (
              <div key={k} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900 capitalize">{label(k)}</p>
                  <p className="text-sm tabular-nums">
                    <b className="text-emerald-700">{brl(g.paid)}</b>
                    {g.held > 0 && <span className="text-blue-700"> + {brl(g.held)} retido</span>}
                  </p>
                </div>
                <div className="mt-1 space-y-0.5">
                  {[...g.venues.values()].map(v => (
                    <p key={v.name} className="flex justify-between text-xs text-gray-500">
                      <span>{v.name}</span>
                      <span className="tabular-nums">{brl(v.paid)}{v.held > 0 ? ` + ${brl(v.held)} retido` : ''}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      <p className="px-5 py-3 border-t border-gray-100 text-[11px] text-gray-400">
        "Retido" ainda pode voltar ao jogador se ele cancelar a tempo; só entra no repasse depois de cobrado e realizado.
      </p>
    </div>
  );
}

function VenueCard({ row, expanded, onToggle, onChanged }: { row: VenueRow; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  const s = row.summary;
  const due = Number(s.due_amount);
  const last = s.history[0];
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function register() {
    setBusy(true); setErr(''); setMsg('');
    const { data, error } = await supabase.rpc('admin_register_payout', { p_venue: row.venue_id, p_note: note || null });
    setBusy(false); setConfirming(false);
    if (error) { setErr(error.message); return; }
    setMsg(`Repasse de ${brl(Number(data))} registrado. O clube já vê no Financeiro.`);
    setNote('');
    onChanged();
  }

  async function setSchedule(v: string) {
    setErr('');
    const { error } = await supabase.rpc('admin_set_payout_schedule', { p_venue: row.venue_id, p_schedule: v });
    if (error) setErr(error.message); else onChanged();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200">
      <button onClick={onToggle} className="w-full text-left p-5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[180px]">
          <p className="font-bold text-gray-900">{row.venue_name}</p>
          <p className="text-xs text-gray-500">{row.city ?? ''}{row.city ? ' · ' : ''}{s.schedule === 'weekly' ? 'Repasse semanal' : 'Repasse por partida'}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">A repassar agora</p>
          <p className={`text-lg font-bold ${due > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{brl(due)}</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">Previsto</p>
          <p className="text-sm font-semibold text-gray-700">{brl(Number(s.upcoming_amount))}</p>
        </div>
        <div className="text-right hidden md:block w-36">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">Último repasse</p>
          <p className="text-sm text-gray-700">{last ? `${brl(Number(last.amount))} · ${day(last.paid_at)}` : '—'}</p>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-500">Regra de repasse:</span>
            <select value={s.schedule} onChange={e => setSchedule(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="per_game">Por partida (logo depois que acontece)</option>
              <option value="weekly">Semanal (segunda, jogos da semana anterior)</option>
            </select>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">O que entra no repasse agora</p>
            {s.due_items.length === 0 ? (
              <p className="text-sm text-gray-400">Nada pendente.</p>
            ) : (
              <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
                {s.due_items.map(i => (
                  <div key={`${i.kind}-${i.ref_id}-${i.event_at}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-12 text-gray-500 tabular-nums">{day(i.event_at)}</span>
                    <span className="flex-1 truncate">{i.who} <span className="text-gray-400">· {KIND[i.kind] ?? i.kind} · {i.court_name}</span></span>
                    <span className="font-semibold tabular-nums">{brl(Number(i.amount))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {due > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
              {!confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Observação (ex.: PIX 08/11)"
                    className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
                  <button onClick={() => setConfirming(true)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">
                    Registrar repasse de {brl(due)}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-emerald-900">
                    Confirme que você <b>já transferiu {brl(due)}</b> para {row.venue_name}. Depois de registrar, esses itens saem do "A repassar agora" do clube.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirming(false)} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold">Voltar</button>
                    <button onClick={register} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-60">
                      {busy ? 'Registrando…' : 'Sim, já transferi'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {msg && <p className="text-sm text-green-700 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />{msg}</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Histórico de repasses</p>
            {s.history.length === 0 ? <p className="text-sm text-gray-400">Nenhum repasse registrado.</p> : (
              <div className="space-y-1 text-sm">
                {s.history.map((h, i) => (
                  <p key={i} className="flex justify-between gap-3">
                    <span className="text-gray-600">{day(h.paid_at)}/{h.paid_at.substring(0, 4)}{h.covers_until ? ` · jogos até ${day(h.covers_until)}` : ''}{h.note ? ` · ${h.note}` : ''}</span>
                    <b className="tabular-nums">{brl(Number(h.amount))}</b>
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
