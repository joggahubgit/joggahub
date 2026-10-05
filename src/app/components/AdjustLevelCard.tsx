import { useState } from 'react';
import { ChevronDown, Loader2, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FUTEVOLEI_LEVELS } from '@/app/lib/futevoleiLevels';

const MIN_RATING = 1.0;

/**
 * Lets a player lower their own futevôlei rating (e.g. they overestimated
 * themselves). Raising only happens through match results — enforced by the
 * lower_my_rating database function, not just this UI.
 */
export function AdjustLevelCard({ currentRating, onLowered }: { currentRating: number; onLowered: (rating: number) => void }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Self-declared bands below the current rating, plus the floor
  const options = FUTEVOLEI_LEVELS
    .filter(l => l.rating < currentRating)
    .map(l => ({ key: l.key, label: l.label, description: l.description, rating: l.rating }));
  if (currentRating > MIN_RATING && !options.some(o => o.rating === MIN_RATING)) {
    options.unshift({ key: 'minimo', label: 'Mínimo', description: 'Começar do zero', rating: MIN_RATING });
  }

  if (options.length === 0) return null;

  async function confirm() {
    if (choice == null) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('lower_my_rating', { p_sport: 'futevolei', p_rating: choice });
    setBusy(false);
    if (err) {
      setError(err.message || 'Não foi possível ajustar seu nível.');
      return;
    }
    setOpen(false);
    setChoice(null);
    onLowered(choice);
  }

  return (
    <div className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3.5 text-left">
        <span className="flex items-center gap-2 text-sm text-gray-600">
          <TrendingDown className="w-4 h-4 text-gray-400" />
          Seu nível está acima do que você joga? <span className="font-semibold text-violet-600">Ajustar</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-2">
          <p className="text-xs text-gray-500 mb-1">
            Atual: <b className="text-gray-900">{currentRating.toFixed(2)}</b>. Você pode reduzir seu nível a qualquer momento,
            mas <b>não pode aumentar manualmente</b> — ele só sobe vencendo partidas.
          </p>
          {options.map(o => (
            <button key={o.key} onClick={() => setChoice(o.rating)} disabled={busy}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-left transition-colors ${choice === o.rating ? 'border-violet-600 bg-violet-50' : 'border-gray-200 hover:border-violet-300'}`}>
              <div>
                <div className="font-semibold text-sm text-gray-900">{o.label}</div>
                <div className="text-xs text-gray-400">{o.description}</div>
              </div>
              <span className="text-sm font-bold text-gray-700 tabular-nums">{o.rating.toFixed(1)}</span>
            </button>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={confirm} disabled={busy || choice == null}
            className="w-full mt-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:bg-gray-100 disabled:text-gray-400 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {choice == null ? 'Escolha um nível' : `Reduzir para ${choice.toFixed(1)}`}
          </button>
        </div>
      )}
    </div>
  );
}
