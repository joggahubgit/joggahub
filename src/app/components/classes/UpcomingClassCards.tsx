// Card "próxima aula" na área de Próximas partidas da Home: um por curso em
// que o jogador está inscrito, mostrando a aula seguinte.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Sun } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CLASSES_ENABLED } from '../../lib/features';
import { wallDate, wallTime } from '../../lib/wallClock';

export interface UpcomingClass {
  classId: string;
  title: string;
  coach: string;
  venueName: string;
  courtName: string;
  startsAt: string;
  endsAt: string;
  lessonNumber: number;
  lessonCount: number;
  dayUse: boolean;
}

/** "Agora" em Brasília no formato gravado ("YYYY-MM-DDTHH:MM:SS"), para comparar com os horários. */
function wallNowText() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
}

export function useUpcomingClasses(userId: string | undefined) {
  const [items, setItems] = useState<UpcomingClass[]>([]);

  useEffect(() => {
    if (!CLASSES_ENABLED || !userId) return;
    let cancelled = false;
    (async () => {
      const { data: enr } = await supabase
        .from('class_enrollments')
        .select('class_id, classes(id, kind, title, coach_name, lesson_count, status, venues(name), courts(name))')
        .eq('player_id', userId)
        .eq('status', 'active');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const active = (enr ?? []).map((e: any) => e.classes).filter((c: any) => c?.status === 'active');
      if (!active.length) { if (!cancelled) setItems([]); return; }

      const { data: sessions } = await supabase
        .from('class_sessions')
        .select('class_id, starts_at, ends_at')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in('class_id', active.map((c: any) => c.id))
        .order('starts_at');
      const now = wallNowText();
      const out: UpcomingClass[] = [];
      for (const c of active) {
        const list = (sessions ?? []).filter(s => s.class_id === c.id);
        const idx = list.findIndex(s => s.ends_at.substring(0, 19) > now);
        if (idx === -1) continue; // curso já terminou
        out.push({
          classId: c.id,
          title: c.title,
          coach: c.coach_name,
          venueName: c.venues?.name ?? '',
          courtName: c.courts?.name ?? '',
          startsAt: list[idx].starts_at,
          endsAt: list[idx].ends_at,
          lessonNumber: idx + 1,
          lessonCount: list.length,
          dayUse: c.kind === 'day_use',
        });
      }
      if (!cancelled) setItems(out);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return items;
}

export function UpcomingClassCard({ item }: { item: UpcomingClass }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(item.dayUse ? `/day-use/${item.classId}` : `/aulas/${item.classId}`)}
      className="flex-shrink-0 w-72 bg-white rounded-2xl border border-gray-200 overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
    >
      <div className={`h-1.5 w-full ${item.dayUse ? 'bg-sky-500' : 'bg-amber-500'}`} />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">
              {wallDate(item.startsAt)} · {wallTime(item.startsAt)} – {wallTime(item.endsAt)}
            </p>
            <p className="text-sm font-semibold text-gray-700 truncate">{item.title}</p>
            <p className="text-xs text-gray-400 truncate">{item.venueName} · {item.courtName}</p>
          </div>
          <div className={`px-2 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ml-2 ${item.dayUse ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
            {item.dayUse ? 'Day use' : `Aula ${item.lessonNumber}/${item.lessonCount}`}
          </div>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <div className="flex items-center gap-1.5 min-w-0">
            {item.dayUse
              ? <Sun className="w-4 h-4 flex-shrink-0 text-sky-500" />
              : <GraduationCap className="w-4 h-4 flex-shrink-0 text-amber-500" />}
            <span className="text-xs text-gray-500 truncate">{item.dayUse ? 'Partida aberta · Day use' : `Aula · Prof. ${item.coach}`}</span>
          </div>
          <span className="text-[11px] font-bold text-green-700 flex-shrink-0">Inscrito</span>
        </div>
      </div>
    </div>
  );
}
