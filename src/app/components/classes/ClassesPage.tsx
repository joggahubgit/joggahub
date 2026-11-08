import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, GraduationCap, Search, CalendarDays, MapPin, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { classLevelLabel, formatBRL } from '../../lib/classSchedule';
import { normalizeText } from '../../lib/citySearch';
import BottomNav from '../BottomNav';

export interface ClassCard {
  id: string;
  title: string;
  coach_name: string;
  level: string;
  sport_type: string;
  capacity: number;
  enrolled_count: number;
  price: number;
  lesson_count: number;
  start_date: string;
  end_date: string;
  venues: { name: string; city: string | null } | null;
  courts: { name: string } | null;
}

const fmt = (d: string) => `${d.substring(8, 10)}/${d.substring(5, 7)}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function ClassesPage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data }, { data: enr }] = await Promise.all([
        supabase.from('classes')
          .select('id, title, coach_name, level, sport_type, capacity, enrolled_count, price, lesson_count, start_date, end_date, venues(name, city), courts(name)')
          .eq('status', 'active')
          .eq('kind', 'course')
          .gte('end_date', todayStr())
          .order('start_date'),
        user
          ? supabase.from('class_enrollments').select('class_id').eq('player_id', user.id).eq('status', 'active')
          : Promise.resolve({ data: [] as { class_id: string }[] }),
      ]);
      setClasses((data as unknown as ClassCard[]) ?? []);
      setMine(new Set((enr ?? []).map(e => e.class_id)));
      setLoading(false);
    })();
  }, [user]);

  // Cursos da cidade do jogador primeiro; busca por curso, professor, clube ou cidade.
  const myCity = normalizeText((profile?.location ?? '').split(',')[0] ?? '');
  const visible = useMemo(() => {
    const q = normalizeText(query);
    const list = classes.filter(c => !q || normalizeText(
      `${c.title} ${c.coach_name} ${c.venues?.name ?? ''} ${c.venues?.city ?? ''}`,
    ).includes(q));
    const local = (c: ClassCard) => (myCity && normalizeText(c.venues?.city ?? '').startsWith(myCity) ? 0 : 1);
    return [...list].sort((a, b) => local(a) - local(b) || a.start_date.localeCompare(b.start_date));
  }, [classes, query, myCity]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-violet-600 text-white px-6 pt-6 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => navigate('/home')} aria-label="Voltar"><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-xl font-bold">Aulas</h1>
        </div>
        <p className="text-sm text-violet-100 mb-4">Cursos com professor nos clubes. Inscreva-se e pague pelo app.</p>
        <div className="bg-white rounded-xl p-3 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar curso, professor, clube ou cidade"
            className="flex-1 outline-none text-gray-700 text-sm" />
        </div>
      </div>

      <div className="px-6 py-5 space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-10">Carregando...</p>
        ) : visible.length === 0 ? (
          <div className="text-center py-14">
            <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-semibold">{query ? 'Nenhum curso encontrado' : 'Nenhum curso aberto no momento'}</p>
            <p className="text-sm text-gray-400 mt-1">Quando os clubes abrirem turmas, elas aparecem aqui.</p>
          </div>
        ) : visible.map(c => <ClassListCard key={c.id} c={c} enrolled={mine.has(c.id)} onClick={() => navigate(`/aulas/${c.id}`)} />)}
      </div>
      <BottomNav />
    </div>
  );
}

export function ClassListCard({ c, enrolled, onClick }: { c: ClassCard; enrolled?: boolean; onClick: () => void }) {
  const left = c.capacity - c.enrolled_count;
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-gray-900">{c.title}</p>
          <p className="text-sm text-gray-500">Prof. {c.coach_name} · {classLevelLabel(c.level)}</p>
        </div>
        {enrolled ? (
          <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-violet-100 text-violet-700">Inscrito</span>
        ) : left <= 0 ? (
          <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-500">Lotado</span>
        ) : (
          <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-green-50 text-green-700">
            {left} {left === 1 ? 'vaga' : 'vagas'}
          </span>
        )}
      </div>
      <div className="mt-3 space-y-1.5 text-sm text-gray-600">
        <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" />{c.venues?.name}{c.venues?.city ? ` · ${c.venues.city}` : ''}</p>
        <p className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-gray-400" />{c.lesson_count} aulas · {fmt(c.start_date)} a {fmt(c.end_date)}</p>
        <p className="flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" />{c.enrolled_count}/{c.capacity} alunos</p>
      </div>
      <p className="mt-3 text-lg font-bold text-violet-600">{formatBRL(Number(c.price))} <span className="text-xs font-normal text-gray-400">o curso todo</span></p>
    </button>
  );
}
