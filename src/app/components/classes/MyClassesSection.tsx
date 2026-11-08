// Seção "Cursos" em Minhas Reservas: os cursos do jogador (ativos, encerrados,
// cancelados). Componente separado para não mexer na lógica das reservas.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CLASSES_ENABLED } from '../../lib/features';
import { formatBRL } from '../../lib/classSchedule';

interface Row {
  id: string;
  status: string;
  refunded: boolean;
  amount_paid: number;
  service_fee: number;
  classes: {
    id: string; kind?: string; title: string; coach_name: string; lesson_count: number;
    start_date: string; end_date: string; status: string;
    venues: { name: string } | null;
  } | null;
}

const fmt = (d: string) => `${d.substring(8, 10)}/${d.substring(5, 7)}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Retorna null se não houver cursos (a tela segue igual a antes). */
export default function MyClassesSection({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!CLASSES_ENABLED) return;
    supabase.from('class_enrollments')
      .select('id, status, refunded, amount_paid, service_fee, classes(id, kind, title, coach_name, lesson_count, start_date, end_date, status, venues(name))')
      .eq('player_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows(((data as unknown as Row[]) ?? []).filter(r => r.classes)));
  }, [userId]);

  if (!rows.length) return null;
  const today = todayStr();

  return (
    <section>
      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Cursos e day use</h2>
      <div className="space-y-3">
        {rows.map(r => {
          const c = r.classes!;
          const du = c.kind === 'day_use';
          const badge =
            r.status !== 'active'
              ? (c.status === 'cancelled' ? (du ? 'Day use cancelado' : 'Curso cancelado') : 'Você desistiu') + (r.refunded ? ' · reembolsado' : '')
              : c.end_date < today ? 'Concluído' : 'Inscrito';
          const tone = r.status !== 'active' ? 'bg-gray-100 text-gray-500' : c.end_date < today ? 'bg-green-100 text-green-700' : 'bg-violet-100 text-violet-700';
          return (
            <button key={r.id} onClick={() => navigate(du ? `/day-use/${c.id}` : `/aulas/${c.id}`)}
              className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3 hover:shadow-sm">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{c.title}</p>
                <p className="text-xs text-gray-500 truncate">{c.venues?.name} · {du ? `Day use · ${fmt(c.start_date)}` : `${c.lesson_count} aulas · ${fmt(c.start_date)} a ${fmt(c.end_date)}`}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tone}`}>{badge}</span>
                  <span className="text-xs font-semibold text-gray-700">{formatBRL(Number(r.amount_paid) + Number(r.service_fee))}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
