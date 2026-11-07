// Aba "Aulas" da página da quadra: cursos abertos nesta quadra.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ClassListCard, type ClassCard } from './ClassesPage';

export default function CourtClassesTab({ courtId }: { courtId: string }) {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassCard[] | null>(null);

  useEffect(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    supabase.from('classes')
      .select('id, title, coach_name, level, sport_type, capacity, enrolled_count, price, lesson_count, start_date, end_date, venues(name, city), courts(name)')
      .eq('court_id', courtId).eq('status', 'active').gte('end_date', today).order('start_date')
      .then(({ data }) => setClasses((data as unknown as ClassCard[]) ?? []));
  }, [courtId]);

  if (classes === null) return <p className="text-center text-sm text-gray-400 py-10">Carregando...</p>;
  if (!classes.length) {
    return (
      <div className="text-center py-10 text-gray-500">
        <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm">Nenhuma aula disponível nesta quadra.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {classes.map(c => <ClassListCard key={c.id} c={c} onClick={() => navigate(`/aulas/${c.id}`)} />)}
    </div>
  );
}
