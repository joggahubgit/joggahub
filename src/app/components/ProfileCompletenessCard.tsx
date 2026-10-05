import { BadgeCheck, ChevronRight } from 'lucide-react';
import type { profileCompleteness, ProfileSection } from '@/app/lib/profileFields';

/** "Perfil 67% completo — falta: X, Y" with shortcuts; a "Perfil completo" badge when done. */
export function ProfileCompletenessCard({ completeness: c, onPick }: {
  completeness: ReturnType<typeof profileCompleteness>;
  onPick: (section: ProfileSection) => void;
}) {
  if (c.complete) {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
        <BadgeCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-bold text-green-800 text-sm">Perfil completo</p>
          <p className="text-xs text-green-700">Outros jogadores veem todas as suas informações.</p>
        </div>
      </div>
    );
  }

  // One shortcut per section, in display order
  const sections = [...new Map(c.missing.map(m => [m.section, m])).values()];

  return (
    <div className="bg-white border border-violet-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="font-bold text-gray-900 text-sm">Perfil {c.pct}% completo</p>
        <span className="text-xs text-gray-400">{c.done}/{c.total}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-violet-600 rounded-full transition-all duration-500" style={{ width: `${c.pct}%` }} />
      </div>
      <p className="text-xs text-gray-500 mt-3 mb-2">Falta:</p>
      <div className="flex flex-wrap gap-2">
        {sections.map(m => (
          <button key={m.section} onClick={() => onPick(m.section)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-100 hover:bg-violet-100">
            {c.missing.filter(x => x.section === m.section).map(x => x.label).join(' e ')}
            <ChevronRight className="w-3 h-3" />
          </button>
        ))}
      </div>
    </div>
  );
}
