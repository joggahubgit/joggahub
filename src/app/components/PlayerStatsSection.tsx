import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Coins } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PROVISIONAL_MATCHES_THRESHOLD } from '@/app/lib/futevoleiLevels';

interface Props {
  userId: string;
}

interface PersonRef {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number | null;
}

type ResultStatus = 'pending' | 'confirmed' | 'disputed' | 'invalid' | 'draw';

interface MatchSummary {
  gameId: string;
  date: string | null;
  venueName: string;
  sets: { a: number; b: number }[];
  status: ResultStatus;
  won: boolean | null; // only meaningful when status === 'confirmed'
  teammate: PersonRef | null;
  opponents: PersonRef[];
  ratingAfter: number | null;
  ratingDelta: number | null;
}

const STATUS_BADGE: Record<ResultStatus, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-blue-100 text-blue-700' },
  disputed: { label: 'Em disputa', className: 'bg-red-100 text-red-700' },
  draw: { label: 'Empate', className: 'bg-gray-200 text-gray-600' },
  invalid: { label: 'Inválido', className: 'bg-gray-200 text-gray-600' },
  confirmed: { label: '', className: '' }, // handled separately (Vitória/Derrota)
};

interface HistoryPoint {
  rating: number;
  createdAt: string;
}

function initialsCircle(person: PersonRef | null | undefined, size = 'w-9 h-9', textSize = 'text-xs') {
  if (!person) return null;
  return person.avatarUrl ? (
    <img src={person.avatarUrl} alt={person.name} className={`${size} rounded-full object-cover border-2 border-white`} />
  ) : (
    <div className={`${size} rounded-full bg-violet-600 flex items-center justify-center text-white font-bold ${textSize} border-2 border-white`}>
      {person.name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatDateTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

function PlayerCell({ person }: { person: PersonRef | null | undefined }) {
  if (!person) {
    return (
      <div className="flex flex-col items-center gap-1 w-16">
        <div className="w-11 h-11 rounded-full bg-gray-100 border-2 border-white" />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 w-16">
      {initialsCircle(person, 'w-11 h-11', 'text-sm')}
      <p className="text-[11px] text-gray-700 font-medium truncate w-full text-center">{person.name.split(' ')[0]}</p>
      {person.rating != null && (
        <span className="text-[10px] font-bold bg-lime-100 text-lime-700 px-1.5 py-0.5 rounded">
          {person.rating.toFixed(1).replace('.', ',')}
        </span>
      )}
    </div>
  );
}

/** Small inline SVG line chart — no charting library needed for a handful of points. */
function RatingChart({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) {
    return <p className="text-xs text-gray-400 text-center py-8">Jogue mais partidas pra ver sua evolução aqui.</p>;
  }
  const W = 300;
  const H = 100;
  const PAD = 8;
  const values = points.map(p => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((p.rating - min) / range) * (H - PAD * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L${coords[coords.length - 1][0].toFixed(1)},${H - PAD} L${coords[0][0].toFixed(1)},${H - PAD} Z`;
  const last = coords[coords.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24">
        <path d={areaPath} fill="url(#ratingGradient)" opacity={0.15} />
        <path d={path} fill="none" stroke="#7c3aed" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r={4} fill="#7c3aed" stroke="white" strokeWidth={2} />
        <defs>
          <linearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>{min.toFixed(2)}</span>
        <span className="font-semibold text-violet-600">{values[values.length - 1].toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function PlayerStatsSection({ userId }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<{ rating: number; matches_played: number } | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [matches, setMatches] = useState<MatchSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const [{ data: ratingRow }, { data: historyRows }, { data: myRows }] = await Promise.all([
        supabase.from('player_ratings').select('rating, matches_played').eq('player_id', userId).eq('sport_type', 'futevolei').maybeSingle(),
        supabase.from('player_rating_history').select('rating, created_at').eq('player_id', userId).eq('sport_type', 'futevolei').order('created_at', { ascending: true }),
        supabase.from('game_players').select('game_id, team').eq('player_id', userId),
      ]);

      if (cancelled) return;
      setRating(ratingRow ?? null);
      setHistory((historyRows ?? []).map(h => ({ rating: h.rating, createdAt: h.created_at })));

      const gameIds = (myRows ?? []).map(r => r.game_id);
      if (gameIds.length === 0) { setMatches([]); setLoading(false); return; }

      const myTeamByGame: Record<string, string> = {};
      (myRows ?? []).forEach(r => { myTeamByGame[r.game_id] = r.team; });

      const { data: resultsRows } = await supabase
        .from('game_results').select('game_id, sets, status, winner_ids, confirmed_at')
        .in('game_id', gameIds);

      if (cancelled || !resultsRows?.length) { setMatches([]); setLoading(false); return; }

      const resultGameIds = resultsRows.map(r => r.game_id);

      const [{ data: gamesRows }, { data: allPlayers }, { data: historyForGames }] = await Promise.all([
        supabase.from('games').select('id, scheduled_at, court_id, courts(name, venue_id, venues(name))').in('id', resultGameIds),
        supabase.from('game_players').select('game_id, player_id, player_name, team').in('game_id', resultGameIds),
        supabase.from('player_rating_history').select('game_id, rating').eq('player_id', userId).in('game_id', resultGameIds),
      ]);

      if (cancelled) return;

      const allPlayerIds = [...new Set((allPlayers ?? []).map(p => p.player_id))];
      const [{ data: profilesRows }, { data: ratingsRows }] = await Promise.all([
        supabase.from('profiles').select('id, avatar_url').in('id', allPlayerIds),
        supabase.from('player_ratings').select('player_id, rating').eq('sport_type', 'futevolei').in('player_id', allPlayerIds),
      ]);
      const avatarMap: Record<string, string | null> = {};
      (profilesRows ?? []).forEach(p => { avatarMap[p.id] = p.avatar_url ?? null; });
      const ratingMap: Record<string, number> = {};
      (ratingsRows ?? []).forEach(r => { ratingMap[r.player_id] = r.rating; });

      const gameMap: Record<string, any> = {};
      (gamesRows ?? []).forEach(g => { gameMap[g.id] = g; });

      const playersByGame: Record<string, { player_id: string; player_name: string; team: string }[]> = {};
      (allPlayers ?? []).forEach(p => {
        if (!playersByGame[p.game_id]) playersByGame[p.game_id] = [];
        playersByGame[p.game_id].push(p);
      });

      const ratingAfterByGame: Record<string, number> = {};
      (historyForGames ?? []).forEach(h => { if (h.game_id) ratingAfterByGame[h.game_id] = h.rating; });

      const summaries: MatchSummary[] = resultsRows.map(r => {
        const myTeam = myTeamByGame[r.game_id] ?? 'a';
        const roster = playersByGame[r.game_id] ?? [];
        const toPerson = (p: { player_id: string; player_name: string }): PersonRef =>
          ({ id: p.player_id, name: p.player_name, avatarUrl: avatarMap[p.player_id] ?? null, rating: ratingMap[p.player_id] ?? null });
        const teammate = roster.find(p => p.team === myTeam && p.player_id !== userId);
        const opponents = roster.filter(p => p.team !== myTeam);
        const game = gameMap[r.game_id];
        const ratingAfter = ratingAfterByGame[r.game_id] ?? null;

        return {
          gameId: r.game_id,
          date: game?.scheduled_at ?? null,
          venueName: game?.courts?.venues?.name ?? game?.courts?.name ?? '',
          sets: r.sets ?? [],
          status: r.status as ResultStatus,
          won: r.status === 'confirmed' ? (r.winner_ids ?? []).includes(userId) : null,
          teammate: teammate ? toPerson(teammate) : null,
          opponents: opponents.map(toPerson),
          ratingAfter,
          ratingDelta: null, // filled below once sorted
        };
      }).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

      // Compute deltas by walking the (ascending) history alongside chronologically sorted matches
      const chrono = [...summaries].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      let prevRating = historyRows?.[0]?.rating ?? ratingRow?.rating ?? 1.5; // RATING_DEFAULT — mirrors submit-game-result
      const deltaByGame: Record<string, number> = {};
      for (const m of chrono) {
        if (m.ratingAfter != null) {
          deltaByGame[m.gameId] = m.ratingAfter - prevRating;
          prevRating = m.ratingAfter;
        }
      }
      summaries.forEach(m => { m.ratingDelta = deltaByGame[m.gameId] ?? null; });

      setMatches(summaries);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const confirmedMatches = matches.filter(m => m.status === 'confirmed');
  const totalMatches = confirmedMatches.length;
  const wins = confirmedMatches.filter(m => m.won).length;
  const last10 = confirmedMatches.slice(0, 10);
  const last10Wins = last10.filter(m => m.won).length;
  const efficacy = last10.length ? Math.round((last10Wins / last10.length) * 100) : 0;

  const partnerStats = (() => {
    const byPartner: Record<string, { person: PersonRef; games: number; wins: number }> = {};
    for (const m of confirmedMatches) {
      if (!m.teammate) continue;
      const entry = byPartner[m.teammate.id] ?? { person: m.teammate, games: 0, wins: 0 };
      entry.games++;
      if (m.won) entry.wins++;
      byPartner[m.teammate.id] = entry;
    }
    return Object.values(byPartner).sort((a, b) => b.games - a.games).slice(0, 5);
  })();

  const me: PersonRef = { id: userId, name: 'Você', avatarUrl: null, rating: rating?.rating ?? null };

  return (
    <div className="mx-5 mb-3 space-y-3">
      {/* Rating + nível */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Pontuação · Futevôlei</p>
        {rating === null ? (
          <p className="text-sm text-gray-500">Ainda sem partidas de futevôlei registradas.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black text-gray-900">{rating.rating.toFixed(2)}</span>
                {rating.matches_played < PROVISIONAL_MATCHES_THRESHOLD && (
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Provisório</span>
                )}
              </div>
              <p className="text-xs text-gray-400">{rating.matches_played} {rating.matches_played === 1 ? 'partida' : 'partidas'}</p>
            </div>
            <RatingChart points={history} />
          </>
        )}
      </div>

      {/* Recent games carousel */}
      {matches.length > 0 && (
        <div>
          <h2 className="text-lg font-black text-gray-900 mb-3">Jogos</h2>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5 snap-x snap-mandatory">
            {matches.slice(0, 10).map(m => (
              <div
                key={m.gameId}
                onClick={() => navigate(`/open-game/${m.gameId}`)}
                className="relative flex-shrink-0 w-[280px] snap-start rounded-2xl border border-gray-200 bg-white p-3 flex items-stretch gap-3 cursor-pointer hover:border-violet-200 transition-colors"
              >
                {m.status === 'pending' && (
                  <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
                )}
                <div className="grid grid-cols-2 gap-x-2 gap-y-2 flex-shrink-0">
                  <PlayerCell person={me} />
                  <PlayerCell person={m.teammate} />
                  <PlayerCell person={m.opponents[0]} />
                  <PlayerCell person={m.opponents[1]} />
                </div>
                <div className="border-l border-gray-100 pl-3 flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-xs text-gray-500">{formatDateTime(m.date)}</p>
                  <div className="my-1.5">
                    {m.status === 'confirmed' ? (
                      <span className={`inline-block text-xs font-bold px-2 py-1 rounded-lg ${m.won ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {m.won ? 'Vitória' : 'Derrota'}
                      </span>
                    ) : m.status === 'pending' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600">
                        <Coins className="w-3.5 h-3.5" /> Pendente
                      </span>
                    ) : (
                      <span className={`inline-block text-xs font-bold px-2 py-1 rounded-lg ${STATUS_BADGE[m.status].className}`}>
                        {STATUS_BADGE[m.status].label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{m.venueName}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      {totalMatches > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-4">Estatísticas</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-2xl font-black text-gray-900">{totalMatches}</p>
              <p className="text-xs text-gray-400">Totais</p>
            </div>
            <div>
              <p className="text-2xl font-black text-green-600">{wins}</p>
              <p className="text-xs text-gray-400">Vitórias</p>
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900">{last10.length}</p>
              <p className="text-xs text-gray-400">Últimas 10</p>
            </div>
            <div>
              <p className="text-2xl font-black text-green-600">{last10Wins}</p>
              <p className="text-xs text-gray-400">Vencidas</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none" stroke="#7c3aed" strokeWidth="3"
                  strokeDasharray={`${(efficacy / 100) * 97.4} 97.4`} strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-900">{efficacy}%</div>
            </div>
            <p className="text-xs text-gray-500">Eficácia nas últimas {last10.length} partidas</p>
          </div>
        </div>
      )}

      {/* Partner combinations */}
      {partnerStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Combinações</p>
          <div className="space-y-2">
            {partnerStats.map(p => (
              <div key={p.person.id} className="flex items-center gap-3">
                {initialsCircle(p.person)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.person.name}</p>
                  <p className="text-xs text-gray-400">{p.games} {p.games === 1 ? 'jogo' : 'jogos'} · {p.wins} {p.wins === 1 ? 'vitória' : 'vitórias'}</p>
                </div>
                <p className="text-sm font-bold text-violet-600">{Math.round((p.wins / p.games) * 100)}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
