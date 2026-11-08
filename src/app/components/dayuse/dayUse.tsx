// Partida aberta · Day use (organizada pelo clube) no site do jogador.
// Por dentro é um "classes" com kind = 'day_use' (1 data, preço fixo por pessoa).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Sun, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CLASSES_ENABLED } from '../../lib/features';
import { formatBRL } from '../../lib/classSchedule';
import { wallDate, wallTime } from '../../lib/wallClock';

export interface DayUseCard {
  id: string;
  title: string;
  sport: string;
  venueName: string;
  courtName: string;
  courtId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  enrolled: number;
  price: number;
}

/** "Agora" em Brasília no formato dos horários gravados. */
export function wallNowText() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
}

export const SPORT_LABELS: Record<string, string> = { football: 'Society', society: 'Society', futsal: 'Futsal', futevolei: 'Futevôlei' };

/** Day uses ativos que ainda não começaram (opcional: de uma quadra / de um dia). */
export async function fetchOpenDayUses(opts: { courtId?: string; date?: string } = {}): Promise<DayUseCard[]> {
  if (!CLASSES_ENABLED) return [];
  let q = supabase.from('classes')
    .select('id, title, sport_type, capacity, enrolled_count, price, court_id, start_date, venues(name), courts(name), class_sessions(starts_at, ends_at)')
    .eq('kind', 'day_use').eq('status', 'active');
  if (opts.courtId) q = q.eq('court_id', opts.courtId);
  if (opts.date) q = q.eq('start_date', opts.date);
  else q = q.gte('start_date', wallNowText().substring(0, 10));
  const { data } = await q.order('start_date');
  const now = wallNowText();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .map(c => {
      const s = c.class_sessions?.[0];
      return s && {
        id: c.id, title: c.title, sport: c.sport_type,
        venueName: c.venues?.name ?? '', courtName: c.courts?.name ?? '', courtId: c.court_id,
        startsAt: s.starts_at, endsAt: s.ends_at,
        capacity: c.capacity, enrolled: c.enrolled_count, price: Number(c.price),
      };
    })
    .filter((d): d is DayUseCard => !!d && d.startsAt.substring(0, 19) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function useOpenDayUses(opts: { courtId?: string; date?: string } = {}) {
  const [items, setItems] = useState<DayUseCard[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchOpenDayUses(opts).then(d => { if (!cancelled) setItems(d); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.courtId, opts.date]);
  return items;
}

/** Card no mesmo estilo dos jogos abertos, com o selo "Partida aberta · Day use". */
export function DayUseListCard({ d, compact }: { d: DayUseCard; compact?: boolean }) {
  const navigate = useNavigate();
  const left = d.capacity - d.enrolled;
  return (
    <div onClick={() => navigate(`/day-use/${d.id}`)}
      className={`bg-white border border-sky-200 cursor-pointer hover:shadow-lg transition-shadow ${compact ? 'rounded-xl p-4' : 'rounded-2xl p-5'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-600 flex items-center gap-1 mb-0.5">
            <Sun className="w-3.5 h-3.5" />Partida aberta · Day use
          </p>
          <p className="font-bold text-gray-900 truncate">{d.venueName}</p>
          <p className="text-sm text-gray-500 truncate">{d.courtName}{SPORT_LABELS[d.sport] ? ` · ${SPORT_LABELS[d.sport]}` : ''}</p>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <p className="text-xl font-bold text-sky-600">{formatBRL(d.price)}</p>
          <p className="text-xs text-gray-400">por pessoa</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-3">
        <Clock className="w-4 h-4" />
        <span className="capitalize">{wallDate(d.startsAt, { weekday: 'short', day: 'numeric', month: 'short' })} · {wallTime(d.startsAt)}–{wallTime(d.endsAt)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-gray-900">{d.enrolled}/{d.capacity}</span>
          <span className="text-gray-500">jogadores</span>
        </div>
        {left > 0 ? (
          <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">{left} {left === 1 ? 'vaga' : 'vagas'}</span>
        ) : (
          <span className="px-2.5 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">Completo</span>
        )}
      </div>
      <div className="mt-3 flex gap-1">
        {Array.from({ length: d.capacity }).map((_, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${i < d.enrolled ? 'bg-sky-500' : 'bg-gray-200'}`} />
        ))}
      </div>
    </div>
  );
}

/** Aba "Jogos Abertos" da quadra: day uses do clube no dia escolhido. */
export function CourtDayUses({ courtIds, date }: { courtIds: string[]; date: string }) {
  const items = useOpenDayUses({ date }).filter(d => courtIds.includes(d.courtId));
  if (!items.length) return null;
  return <div className="space-y-3">{items.map(d => <DayUseListCard key={d.id} d={d} />)}</div>;
}
