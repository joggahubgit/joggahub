import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Star, SlidersHorizontal, Search, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CourtRow {
  id: string;
  name: string;
  venue_id: string;
  images: string[] | null;
  is_active: boolean | null;
  price_per_hour: number | null;
  sport_type: string | null;
  surface: string | null;
  rating: number | null;
  review_count: number | null;
  venue: { id: string; name: string; address: string | null; city: string | null } | null;
}

const SPORT_LABELS: Record<string, string> = {
  football: 'Society',
  futsal: 'Futsal',
  society: 'Society',
  tennis: 'Tênis',
  padel: 'Padel',
  basketball: 'Basquete',
  volleyball: 'Vôlei',
  beach_tennis: 'Beach Tennis',
};

function sportLabel(s: string | null) {
  if (!s) return '—';
  return SPORT_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

export default function FindCourts() {
  const navigate = useNavigate();

  // Data
  const [allCourts, setAllCourts] = useState<CourtRow[]>([]);
  const [minPriceByCourtId, setMinPriceByCourtId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  useEffect(() => {
    async function fetchCourts() {
      try {
        const { data: courtRows, error: courtError } = await supabase
          .from('courts')
          .select('id, name, venue_id, images, is_active, price_per_hour, sport_type, surface, rating, review_count')
          .neq('is_active', false);

        if (courtError) { setFetchError(courtError.message); setLoading(false); return; }
        if (!courtRows?.length) { setLoading(false); return; }

        const venueIds = [...new Set(courtRows.map(c => c.venue_id).filter(Boolean))];
        const { data: venueRows } = await supabase
          .from('venues')
          .select('id, name, address, city')
          .in('id', venueIds);

        const venueMap: Record<string, any> = {};
        (venueRows ?? []).forEach(v => { venueMap[v.id] = v; });

        const courts = courtRows.map(c => ({ ...c, venue: venueMap[c.venue_id] ?? null }));
        setAllCourts(courts);

        // Fetch upcoming slots (next 14 days) to compute real min price per court
        const today = new Date().toISOString().substring(0, 10);
        const future = new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10);
        const courtIds = courts.map(c => c.id);
        const { data: slotRows } = await supabase
          .from('slots')
          .select('court_id, price_override')
          .in('court_id', courtIds)
          .gte('start_time', `${today}T00:00:00`)
          .lte('start_time', `${future}T23:59:59`)
          .eq('is_available', true);

        const minMap: Record<string, number> = {};
        for (const s of slotRows ?? []) {
          if (s.price_override == null) continue;
          if (minMap[s.court_id] == null || s.price_override < minMap[s.court_id]) {
            minMap[s.court_id] = s.price_override;
          }
        }
        setMinPriceByCourtId(minMap);
      } catch (err: any) {
        setFetchError(err.message ?? 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    }
    fetchCourts();
  }, []);

  // Unique sport types from data
  const sportTypes = useMemo(() => {
    const types = new Set(allCourts.map(c => c.sport_type).filter(Boolean) as string[]);
    return [...types].sort();
  }, [allCourts]);

  // Apply all filters
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const min = priceMin ? parseFloat(priceMin) : null;
    const max = priceMax ? parseFloat(priceMax) : null;

    return allCourts.filter(c => {
      // Text search: court name, venue name, city, address
      if (q) {
        const haystack = [c.name, c.venue?.name, c.venue?.city, c.venue?.address]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Sport type
      if (selectedSport && c.sport_type !== selectedSport) return false;

      // Price range
      if (min !== null && (c.price_per_hour ?? 0) < min) return false;
      if (max !== null && (c.price_per_hour ?? Infinity) > max) return false;

      // Availability
      if (onlyAvailable && c.is_active === false) return false;

      return true;
    });
  }, [allCourts, search, selectedSport, priceMin, priceMax, onlyAvailable]);

  const hasActiveFilters = selectedSport || priceMin || priceMax || onlyAvailable;

  function clearFilters() {
    setSelectedSport(null);
    setPriceMin('');
    setPriceMax('');
    setOnlyAvailable(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <div className="bg-violet-600 text-white px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-4 mb-3">
          <button onClick={() => navigate('/home')}><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-xl font-bold">Encontrar Quadras</h1>
        </div>
        {/* Search */}
        <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar por nome, clube ou cidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 outline-none text-gray-700 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')}><X className="w-4 h-4 text-gray-400" /></button>
          )}
        </div>
      </div>

      {/* Sport type pills + filter button */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 sticky top-[116px] z-10">
        <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${
              showFilters || hasActiveFilters ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filtros
            {hasActiveFilters && <span className="bg-white text-violet-600 rounded-full w-4 h-4 text-xs flex items-center justify-center font-bold">
              {[selectedSport, priceMin || priceMax, onlyAvailable].filter(Boolean).length}
            </span>}
            {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Sport pills */}
          {sportTypes.map(sport => (
            <button key={sport}
              onClick={() => setSelectedSport(selectedSport === sport ? null : sport)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${
                selectedSport === sport ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              {sportLabel(sport)}
            </button>
          ))}
        </div>
      </div>

      {/* Expanded filter panel */}
      {showFilters && (
        <div className="bg-white border-b border-gray-200 px-6 py-4 space-y-4">
          {/* Price range */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Preço por hora (R$)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Mín"
                value={priceMin}
                onChange={e => setPriceMin(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-violet-400"
              />
              <span className="text-gray-400 text-sm">–</span>
              <input
                type="number"
                placeholder="Máx"
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-violet-400"
              />
            </div>
          </div>

          {/* Availability */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={e => setOnlyAvailable(e.target.checked)}
              className="w-4 h-4 accent-violet-600"
            />
            <span className="text-sm font-medium text-gray-700">Mostrar apenas disponíveis</span>
          </label>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-sm text-red-500 font-semibold hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Results */}
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-500">
            {loading
              ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</span>
              : `${filtered.length} ${filtered.length === 1 ? 'quadra encontrada' : 'quadras encontradas'}`}
          </p>
          {hasActiveFilters && !loading && (
            <button onClick={clearFilters} className="text-xs text-red-500 font-semibold hover:underline">
              Limpar filtros
            </button>
          )}
        </div>

        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {fetchError}
          </div>
        )}

        {!loading && !fetchError && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-gray-600">Nenhuma quadra encontrada</p>
            <p className="text-sm mt-1">Tente ajustar os filtros ou a busca</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-4 text-violet-600 font-semibold text-sm hover:underline">
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {filtered.map(court => (
          <div
            key={court.id}
            onClick={() => navigate(`/court-details/${court.id}`)}
            className="bg-white rounded-xl overflow-hidden border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="relative">
              <img
                src={court.images?.[0] || 'https://images.unsplash.com/photo-1624880357913-a8539238245b?w=400&q=80'}
                alt={court.name}
                className="w-full h-44 object-cover"
              />
              <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold ${
                court.is_active !== false ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}>
                {court.is_active !== false ? 'Disponível' : 'Indisponível'}
              </div>
              {court.sport_type && (
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold bg-black/50 text-white backdrop-blur-sm">
                  {sportLabel(court.sport_type)}
                </div>
              )}
            </div>
            <div className="p-4">
              <p className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-0.5">
                {court.venue?.name || '—'}
              </p>
              <h3 className="font-bold text-gray-900">{court.name}</h3>
              {(court.venue?.address || court.venue?.city) && (
                <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{[court.venue?.address, court.venue?.city].filter(Boolean).join(', ')}</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold text-gray-900 text-sm">{court.rating ?? '—'}</span>
                  {court.review_count ? <span className="text-xs text-gray-400">({court.review_count})</span> : null}
                </div>
                {(() => {
                  const price = minPriceByCourtId[court.id] ?? court.price_per_hour;
                  return price ? (
                    <div className="text-base font-bold text-violet-600">
                      a partir de R$ {price}<span className="text-xs font-normal text-gray-400">/h</span>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">Preço não definido</div>
                  );
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
