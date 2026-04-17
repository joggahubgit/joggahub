import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Users, Clock, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface GameCard {
  id: string;
  courtName: string;
  venueName: string;
  sport: string;
  scheduledAt: string;
  date: string;
  time: string;
  currentPlayers: number;
  maxPlayers: number;
  pricePerPlayer: number;
}

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', society: 'Society', futsal: 'Futsal',
  tennis: 'Tênis', padel: 'Padel', basketball: 'Basquete',
  volleyball: 'Vôlei', beach_tennis: 'Beach Tennis',
};

export default function FindGames() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGames() {
      // Fetch open games — exclude started and full games
      const { data: allGameRows } = await supabase
        .from('games')
        .select('id, court_id, scheduled_at, current_players, max_players, price_per_player, status')
        .eq('is_open', true)
        .in('status', ['scheduled', 'confirmed_booking'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });

      // Filter out full games client-side (PostgREST can't compare two columns)
      const gameRows = (allGameRows ?? []).filter(g => g.current_players < g.max_players);

      if (!gameRows?.length) { setLoading(false); return; }

      // Fetch courts
      const courtIds = [...new Set(gameRows.map(g => g.court_id).filter(Boolean))];
      const { data: courtRows } = await supabase
        .from('courts')
        .select('id, name, sport_type, venue_id')
        .in('id', courtIds);

      // Fetch venues
      const venueIds = [...new Set((courtRows ?? []).map(c => c.venue_id).filter(Boolean))];
      const { data: venueRows } = await supabase
        .from('venues')
        .select('id, name, address')
        .in('id', venueIds);

      const courtMap: Record<string, any> = {};
      (courtRows ?? []).forEach(c => { courtMap[c.id] = c; });
      const venueMap: Record<string, any> = {};
      (venueRows ?? []).forEach(v => { venueMap[v.id] = v; });

      const cards: GameCard[] = gameRows.map(g => {
        const court = courtMap[g.court_id] ?? {};
        const venue = venueMap[court.venue_id] ?? {};
        const scheduledAt = g.scheduled_at ?? '';
        return {
          id: g.id,
          courtName: court.name ?? '—',
          venueName: venue.name ?? '—',
          sport: court.sport_type ?? '',
          scheduledAt,
          date: scheduledAt ? new Date(scheduledAt).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }) : '—',
          time: scheduledAt ? scheduledAt.substring(11, 16) : '—',
          currentPlayers: g.current_players ?? 0,
          maxPlayers: g.max_players ?? 0,
          pricePerPlayer: g.price_per_player ?? 0,
        };
      });

      setGames(cards);
      setLoading(false);
    }
    fetchGames();
  }, []);

  const spotsLeft = (g: GameCard) => g.maxPlayers - g.currentPlayers;

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <div className="bg-violet-600 text-white px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => navigate('/home')}><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-xl font-bold">Encontrar Jogos</h1>
        </div>
        <div className="bg-white rounded-xl p-3 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar jogos..." className="flex-1 outline-none text-gray-700 text-sm" />
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        <p className="text-sm font-semibold text-gray-500">
          {loading
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando jogos...</span>
            : `${games.length} ${games.length === 1 ? 'jogo encontrado' : 'jogos encontrados'}`}
        </p>

        {!loading && games.length === 0 && (
          <div className="text-center py-20 space-y-2">
            <p className="text-4xl">⚽</p>
            <p className="font-semibold text-gray-700">Nenhum jogo aberto</p>
            <p className="text-sm text-gray-400">Que tal criar o primeiro?</p>
          </div>
        )}

        {games.map(game => (
          <div
            key={game.id}
            onClick={() => navigate(`/open-game/${game.id}`)}
            className="bg-white rounded-2xl border border-gray-200 p-5 cursor-pointer hover:shadow-lg transition-shadow"
          >
            {/* Sport + venue */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-0.5">
                  {SPORT_LABELS[game.sport] ?? game.sport}
                </p>
                <p className="font-bold text-gray-900">{game.venueName}</p>
                <p className="text-sm text-gray-500">{game.courtName}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-violet-600">R$ {game.pricePerPlayer}</p>
                <p className="text-xs text-gray-400">por pessoa</p>
              </div>
            </div>

            {/* Date + time */}
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span className="capitalize">{game.date} · {game.time}</span>
              </div>
            </div>

            {/* Players bar */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="font-semibold text-gray-900">{game.currentPlayers}/{game.maxPlayers}</span>
                <span className="text-gray-500">jogadores</span>
              </div>
              {spotsLeft(game) > 0 ? (
                <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                  {spotsLeft(game)} {spotsLeft(game) === 1 ? 'vaga' : 'vagas'}
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">Completo</span>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-3 flex gap-1">
              {Array.from({ length: game.maxPlayers }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1.5 rounded-full ${i < game.currentPlayers ? 'bg-violet-600' : 'bg-gray-200'}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
