// "Cidade" field with suggestions from the IBGE list. Always ends in the
// stored "Nome, UF" format (see lib/citySearch.ts), so the city ranking in
// Comunidade groups players correctly.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, LocateFixed, MapPin } from 'lucide-react';
import { canonicalCity, parseCities, searchCities, type City } from '@/app/lib/citySearch';
import { detectCity } from '@/app/lib/profileFields';

// The list (~100 KB) only loads when a city field is shown, once per session.
let citiesPromise: Promise<City[]> | null = null;
function loadCities() {
  citiesPromise ??= import('@/app/lib/brCities.json').then(m => parseCities(m.default as string[]));
  return citiesPromise;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** true when value is a city from the list ("Nome, UF") */
  onValidChange?: (valid: boolean) => void;
  inputClassName: string;
}

export function CityInput({ value, onChange, onValidChange, inputClassName }: Props) {
  const [cities, setCities] = useState<City[] | null>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadCities().then(setCities).catch(() => setCities([])); }, []);

  const valid = useMemo(() => !!cities?.some(c => c.label === value), [cities, value]);
  useEffect(() => { onValidChange?.(valid); }, [valid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Old free-text values ("campinas") become "Campinas, SP" as soon as the list loads
  useEffect(() => {
    if (!cities || !value || valid) return;
    const fixed = canonicalCity(cities, value);
    if (fixed && fixed !== value) onChange(fixed);
  }, [cities]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = useMemo(
    () => (cities && focused && !valid ? searchCities(cities, value) : []),
    [cities, focused, valid, value],
  );
  useEffect(() => { setActive(0); }, [value]);

  function pick(city: City) {
    onChange(city.label);
    setError('');
    inputRef.current?.blur();
  }

  function handleBlur() {
    setFocused(false);
    if (cities && value && !valid) {
      const fixed = canonicalCity(cities, value);
      if (fixed) onChange(fixed);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(suggestions[active]); }
    else if (e.key === 'Escape') { inputRef.current?.blur(); }
  }

  async function locate() {
    setLocating(true);
    setError('');
    try {
      const found = await detectCity();
      const list = cities ?? await loadCities();
      const fixed = canonicalCity(list, found);
      if (fixed) onChange(fixed);
      else setError(`Não reconhecemos "${found}" como cidade do Brasil. Digite o nome da sua cidade.`);
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível identificar sua cidade.');
    } finally {
      setLocating(false);
    }
  }

  const showHint = !focused && !!value.trim() && cities !== null && !valid && !error;

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setError(''); }}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua cidade"
          autoComplete="off"
          maxLength={80}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-autocomplete="list"
          className={inputClassName}
        />
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          title="Usar minha localização"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-600 hover:text-violet-800 disabled:text-gray-300 transition-colors"
        >
          {locating ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
        </button>
      </div>

      {suggestions.length > 0 && (
        <ul role="listbox" className="absolute z-20 left-0 right-0 mt-1.5 bg-white border-2 border-gray-100 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((c, i) => (
            <li
              key={c.label}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(c); }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i === active ? 'bg-violet-50' : ''}`}
            >
              <MapPin className="w-4 h-4 text-violet-500 flex-shrink-0" />
              <span className="text-base text-gray-900">{c.name}</span>
              <span className="text-sm text-gray-400 ml-auto">{c.uf}</span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
      {showHint && <p className="text-xs text-amber-600 mt-1.5">Escolha sua cidade na lista de sugestões.</p>}
    </div>
  );
}
