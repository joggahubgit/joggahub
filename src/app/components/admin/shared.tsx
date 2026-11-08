// Utilitários da administração: formatação, período e dados das transações.
import { useEffect, useState } from 'react';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const day = (iso: string) => `${iso.substring(8, 10)}/${iso.substring(5, 7)}`;
export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const TIPO: Record<string, { label: string; color: string }> = {
  partida_fechada: { label: 'Partida fechada', color: 'bg-purple-100 text-purple-700' },
  reserva:         { label: 'Partida fechada', color: 'bg-purple-100 text-purple-700' },
  partida_aberta:  { label: 'Partida aberta',  color: 'bg-blue-100 text-blue-700' },
  day_use:         { label: 'Day use',         color: 'bg-sky-100 text-sky-700' },
  aula:            { label: 'Aula',            color: 'bg-amber-100 text-amber-700' },
  outro:           { label: 'Outro',           color: 'bg-gray-100 text-gray-600' },
};

export const TX_STATUS: Record<string, { label: string; color: string; stripe: string }> = {
  pago:                { label: 'Pago',                 color: 'bg-green-100 text-green-700', stripe: 'Bem-sucedido' },
  retido:              { label: 'Retido',               color: 'bg-blue-100 text-blue-700',   stripe: 'Não capturado' },
  reembolsado:         { label: 'Reembolsado',          color: 'bg-gray-100 text-gray-600',   stripe: 'Reembolsado' },
  reembolsado_parcial: { label: 'Reembolso parcial',    color: 'bg-gray-100 text-gray-600',   stripe: 'Reembolsado parcialmente' },
  liberado:            { label: 'Liberado (cancelado)', color: 'bg-gray-100 text-gray-500',   stripe: 'Cancelado' },
  incompleto:          { label: 'Incompleto',           color: 'bg-amber-100 text-amber-700', stripe: 'Incompleto' },
};

export interface Tx {
  id: string; session_id: string; created_at: string; tipo: string;
  venue_id: string | null; venue_name: string; court_name: string; player: string; description: string | null;
  gross: number; charged: number; held: number; refunded: number;
  club_share: number; platform_fee: number; stripe_fee: number; net_platform: number;
  status: string; livemode: boolean;
}

export type PeriodKey = 'today' | '7d' | 'month' | 'last_month' | 'custom';
export interface Period { key: PeriodKey; from: string; to: string }

export function periodFor(key: PeriodKey, custom?: { from: string; to: string }): Period {
  const now = new Date();
  if (key === 'today') return { key, from: ymd(now), to: ymd(now) };
  if (key === '7d') { const f = new Date(now); f.setDate(f.getDate() - 6); return { key, from: ymd(f), to: ymd(now) }; }
  if (key === 'last_month') {
    const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const t = new Date(now.getFullYear(), now.getMonth(), 0);
    return { key, from: ymd(f), to: ymd(t) };
  }
  if (key === 'custom' && custom) return { key, ...custom };
  return { key: 'month', from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

export function PeriodPicker({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const opts: [PeriodKey, string][] = [['today', 'Hoje'], ['7d', '7 dias'], ['month', 'Este mês'], ['last_month', 'Mês passado'], ['custom', 'Personalizado']];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {opts.map(([k, l]) => (
        <button key={k} onClick={() => onChange(periodFor(k, { from: period.from, to: period.to }))}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${period.key === k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          {l}
        </button>
      ))}
      {period.key === 'custom' && (
        <span className="flex items-center gap-1 text-xs">
          <input type="date" value={period.from} onChange={e => onChange({ ...period, from: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1" />
          até
          <input type="date" value={period.to} onChange={e => onChange({ ...period, to: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1" />
        </span>
      )}
    </div>
  );
}

/** Cobranças do Stripe no período (função admin-transactions). */
export function useTransactions(period: Period) {
  const [data, setData] = useState<{ transactions: Tx[]; truncated: boolean; hidden?: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let off = false;
    setData(null);
    setError('');
    supabase.functions.invoke('admin-transactions', { body: { from: period.from, to: period.to } }).then(async ({ data: d, error: e }) => {
      if (off) return;
      if (e) {
        const body = await (e as { context?: Response }).context?.json?.().catch(() => null);
        setError(body?.error ?? e.message);
        setData({ transactions: [], truncated: false });
        return;
      }
      setData(d as { transactions: Tx[]; truncated: boolean; hidden?: number });
    });
    return () => { off = true; };
  }, [period.from, period.to]);
  return { data, error };
}

export function Stat({ label, value, hint, tone = 'gray', money = true }: { label: string; value: number; hint?: string; tone?: string; money?: boolean }) {
  const tones: Record<string, string> = {
    gray: 'text-gray-900', green: 'text-emerald-700', blue: 'text-blue-700', red: 'text-red-600', purple: 'text-purple-700',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${tones[tone]}`}>{money ? brl(value) : value.toLocaleString('pt-BR')}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const money = (v: number) => v.toFixed(2).replace('.', ',');
