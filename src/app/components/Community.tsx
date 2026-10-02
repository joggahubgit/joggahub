import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Search, Users, User, Home as HomeIcon, Send, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/app/contexts/AuthContext';
import { PROVISIONAL_MATCHES_THRESHOLD } from '@/app/lib/futevoleiLevels';
import ComingSoonBanner from './ComingSoonBanner';

type RankingScope = 'geral' | 'cidade' | 'clube';

interface RankingRow {
  position: number;
  id: string;
  name: string;
  rating: number;
  matches_played: number;
  avatar: string;
  avatarUrl: string | null;
  location: string | null;
}

interface VenueOption {
  id: string;
  name: string;
  city: string | null;
}

interface FeedPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface FeedItem {
  id: string;
  gameId: string;
  date: string | null;
  venueName: string;
  sets: { a: number; b: number }[];
  teamA: FeedPerson[];
  teamB: FeedPerson[];
  winningTeam: 'a' | 'b' | null;
}

function avatarCircle(name: string, avatarUrl: string | null | undefined, size = 'w-10 h-10', textSize = 'text-sm') {
  return avatarUrl ? (
    <img src={avatarUrl} alt={name} className={`${size} rounded-full object-cover border-2 border-white`} />
  ) : (
    <div className={`${size} rounded-full bg-violet-600 flex items-center justify-center text-white font-bold ${textSize} border-2 border-white`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatFeedDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Community() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('feed');
  const [activeBottomTab, setActiveBottomTab] = useState('community');

  // ── Ranking: geral (base list every scope derives from) ──
  const [rankingScope, setRankingScope] = useState<RankingScope>('geral');
  const [allRankings, setAllRankings] = useState<RankingRow[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<string>('');

  // ── Ranking: clube ──
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(true);
  const [selectedVenueId, setSelectedVenueId] = useState<string>('');
  const [clubRankings, setClubRankings] = useState<RankingRow[]>([]);
  const [clubRankingsLoading, setClubRankingsLoading] = useState(false);

  // ── Feed ──
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('player_ratings')
      .select('player_id, rating, matches_played, profiles(name, avatar_url, location)')
      .eq('sport_type', 'futevolei')
      .order('rating', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        const rows: RankingRow[] = (data ?? []).map((r: any, i: number) => {
          const name = r.profiles?.name ?? 'Jogador';
          return {
            position: i + 1,
            id: r.player_id,
            name,
            rating: r.rating,
            matches_played: r.matches_played,
            avatar: name.charAt(0).toUpperCase(),
            avatarUrl: r.profiles?.avatar_url ?? null,
            location: r.profiles?.location ?? null,
          };
        });
        setAllRankings(rows);
        setRankingsLoading(false);
        if (profile?.location && rows.some(r => r.location === profile.location)) {
          setSelectedCity(profile.location);
        } else {
          const firstCity = rows.find(r => r.location)?.location;
          if (firstCity) setSelectedCity(firstCity);
        }
      });
  }, [profile?.location]);

  useEffect(() => {
    if (!user) { setVenuesLoading(false); return; }
    supabase
      .from('game_players')
      .select('games(sport_type, courts(venue_id, venues(id, name, city)))')
      .eq('player_id', user.id)
      .then(({ data }) => {
        const byId: Record<string, VenueOption> = {};
        (data ?? []).forEach((row: any) => {
          const g = row.games;
          if (g?.sport_type !== 'futevolei') return;
          const venue = g?.courts?.venues;
          if (venue?.id) byId[venue.id] = { id: venue.id, name: venue.name, city: venue.city ?? null };
        });
        const options = Object.values(byId);
        setVenueOptions(options);
        if (options.length > 0) setSelectedVenueId(options[0].id);
        setVenuesLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!selectedVenueId) { setClubRankings([]); return; }
    let cancelled = false;
    setClubRankingsLoading(true);

    async function load() {
      const { data: gamesAtVenue } = await supabase
        .from('games')
        .select('id, courts(venue_id)')
        .eq('sport_type', 'futevolei');
      const gameIds = (gamesAtVenue ?? [])
        .filter((g: any) => g.courts?.venue_id === selectedVenueId)
        .map((g: any) => g.id);
      if (cancelled) return;
      if (gameIds.length === 0) { setClubRankings([]); setClubRankingsLoading(false); return; }

      const { data: rosterRows } = await supabase
        .from('game_players').select('player_id').in('game_id', gameIds);
      const playerIds = [...new Set((rosterRows ?? []).map((r: any) => r.player_id))];
      if (cancelled || playerIds.length === 0) { setClubRankings([]); setClubRankingsLoading(false); return; }

      const { data: ratingRows } = await supabase
        .from('player_ratings')
        .select('player_id, rating, matches_played, profiles(name, avatar_url, location)')
        .eq('sport_type', 'futevolei')
        .in('player_id', playerIds)
        .gte('matches_played', PROVISIONAL_MATCHES_THRESHOLD)
        .order('rating', { ascending: false });
      if (cancelled) return;

      const rows: RankingRow[] = (ratingRows ?? []).map((r: any, i: number) => {
        const name = r.profiles?.name ?? 'Jogador';
        return {
          position: i + 1,
          id: r.player_id,
          name,
          rating: r.rating,
          matches_played: r.matches_played,
          avatar: name.charAt(0).toUpperCase(),
          avatarUrl: r.profiles?.avatar_url ?? null,
          location: r.profiles?.location ?? null,
        };
      });
      setClubRankings(rows);
      setClubRankingsLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [selectedVenueId]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeed() {
      setFeedLoading(true);
      const { data: results } = await supabase
        .from('game_results')
        .select('id, game_id, sets, winner_ids, confirmed_at')
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false })
        .limit(20);

      if (cancelled || !results?.length) { setFeedItems([]); setFeedLoading(false); return; }

      const gameIds = results.map(r => r.game_id);
      const [{ data: gamesRows }, { data: playersRows }] = await Promise.all([
        supabase.from('games').select('id, scheduled_at, court_id, courts(name, venue_id, venues(name))').in('id', gameIds),
        supabase.from('game_players').select('game_id, player_id, player_name, team').in('game_id', gameIds),
      ]);
      if (cancelled) return;

      const playerIds = [...new Set((playersRows ?? []).map(p => p.player_id))];
      const { data: profilesRows } = await supabase.from('profiles').select('id, avatar_url').in('id', playerIds);
      const avatarMap: Record<string, string | null> = {};
      (profilesRows ?? []).forEach(p => { avatarMap[p.id] = p.avatar_url ?? null; });

      const gameMap: Record<string, any> = {};
      (gamesRows ?? []).forEach(g => { gameMap[g.id] = g; });

      const playersByGame: Record<string, { player_id: string; player_name: string; team: string }[]> = {};
      (playersRows ?? []).forEach(p => {
        if (!playersByGame[p.game_id]) playersByGame[p.game_id] = [];
        playersByGame[p.game_id].push(p);
      });

      const items: FeedItem[] = results.map(r => {
        const roster = playersByGame[r.game_id] ?? [];
        const toPerson = (p: { player_id: string; player_name: string }): FeedPerson =>
          ({ id: p.player_id, name: p.player_name, avatarUrl: avatarMap[p.player_id] ?? null });
        const game = gameMap[r.game_id];
        const winnerIds: string[] = r.winner_ids ?? [];
        const teamA = roster.filter(p => p.team === 'a').map(toPerson);
        const teamB = roster.filter(p => p.team === 'b').map(toPerson);
        const winningTeam: 'a' | 'b' | null = winnerIds.length === 0
          ? null
          : teamA.some(p => winnerIds.includes(p.id)) ? 'a' : 'b';

        return {
          id: r.id,
          gameId: r.game_id,
          date: game?.scheduled_at ?? null,
          venueName: game?.courts?.venues?.name ?? game?.courts?.name ?? '',
          sets: r.sets ?? [],
          teamA,
          teamB,
          winningTeam,
        };
      });

      setFeedItems(items);
      setFeedLoading(false);
    }

    loadFeed();
    return () => { cancelled = true; };
  }, []);

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    allRankings.forEach(r => { if (r.location) set.add(r.location); });
    return Array.from(set).sort();
  }, [allRankings]);

  const cityRankings = useMemo(() => {
    if (!selectedCity) return [];
    return allRankings
      .filter(r => r.location === selectedCity)
      .map((r, i) => ({ ...r, position: i + 1 }));
  }, [allRankings, selectedCity]);

  const activeRankings = rankingScope === 'geral' ? allRankings : rankingScope === 'cidade' ? cityRankings : clubRankings;
  const activeRankingsLoading = rankingScope === 'clube' ? clubRankingsLoading : rankingsLoading;
  const myRanking = user ? activeRankings.find(r => r.id === user.id) : undefined;

  const messages = [
    { id: 1, type: 'group', name: 'Arena Sports Center', lastMessage: 'Confirmado para hoje às 19h!', time: '10 min', unread: 3, avatar: 'A' },
    { id: 2, type: 'group', name: 'Clube do Futebol - Quinta', lastMessage: 'Alguém tem uma bola extra?', time: '1 h', unread: 0, avatar: 'C' },
    { id: 3, type: 'direct', name: 'Carlos Silva', lastMessage: 'Bora jogar amanhã?', time: '3 h', unread: 1, avatar: 'C' }
  ];

  const totalUnread = messages.reduce((acc, m) => acc + m.unread, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-violet-600 text-white px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Comunidade</h1>
          <Search className="w-6 h-6 cursor-pointer" />
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6 sticky top-[76px] z-10">
        <div className="flex gap-6">
          {['feed', 'ranking', 'messages'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`py-4 border-b-2 font-semibold transition-colors relative ${activeTab === tab ? 'border-violet-600 text-violet-600' : 'border-transparent text-gray-500'}`}>
              {tab === 'feed' ? 'Feed' : tab === 'ranking' ? 'Ranking' : 'Mensagens'}
              {tab === 'messages' && totalUnread > 0 && <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{totalUnread}</span>}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'feed' && (
        <div className="px-6 py-6 space-y-4">
          {feedLoading ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : feedItems.length === 0 ? (
            <p className="text-sm text-gray-500">Ainda não há partidas de futevôlei confirmadas na comunidade.</p>
          ) : (
            feedItems.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 flex items-center gap-1 mb-3">
                  <MapPin className="w-3.5 h-3.5" />
                  {item.venueName}{item.date ? ` · ${formatFeedDate(item.date)}` : ''}
                </p>
                <div className="flex items-center gap-3">
                  <div className={`flex-1 rounded-lg p-3 ${item.winningTeam === 'a' ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <div className="flex -space-x-2 mb-2">
                      {item.teamA.map(p => <span key={p.id}>{avatarCircle(p.name, p.avatarUrl)}</span>)}
                    </div>
                    <p className="text-xs font-semibold text-gray-900 truncate">{item.teamA.map(p => p.name.split(' ')[0]).join(' & ')}</p>
                    {item.winningTeam === 'a' && <p className="text-[10px] font-bold text-green-600 mt-0.5">VENCEDOR</p>}
                  </div>
                  <span className="text-xs font-bold text-gray-400 flex-shrink-0">vs</span>
                  <div className={`flex-1 rounded-lg p-3 ${item.winningTeam === 'b' ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <div className="flex -space-x-2 mb-2">
                      {item.teamB.map(p => <span key={p.id}>{avatarCircle(p.name, p.avatarUrl)}</span>)}
                    </div>
                    <p className="text-xs font-semibold text-gray-900 truncate">{item.teamB.map(p => p.name.split(' ')[0]).join(' & ')}</p>
                    {item.winningTeam === 'b' && <p className="text-[10px] font-bold text-green-600 mt-0.5">VENCEDOR</p>}
                  </div>
                </div>
                <p className="text-sm font-bold text-gray-900 text-center mt-3">
                  {item.sets.map(s => `${s.a}-${s.b}`).join(', ')}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'ranking' && (
        <div className="py-6">
          <div className="px-6 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ranking · Futevôlei</p>
            <div className="flex gap-2">
              {(['geral', 'cidade', 'clube'] as RankingScope[]).map(scope => (
                <button
                  key={scope}
                  onClick={() => setRankingScope(scope)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${rankingScope === scope ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {scope === 'geral' ? 'Geral' : scope === 'cidade' ? 'Cidade' : 'Clube'}
                </button>
              ))}
            </div>

            {rankingScope === 'cidade' && (
              cityOptions.length === 0 ? (
                <p className="text-sm text-gray-400 mt-3">Nenhuma cidade cadastrada entre os jogadores ranqueados ainda.</p>
              ) : (
                <select
                  value={selectedCity}
                  onChange={e => setSelectedCity(e.target.value)}
                  className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700"
                >
                  {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )
            )}

            {rankingScope === 'clube' && (
              venuesLoading ? null : venueOptions.length === 0 ? (
                <p className="text-sm text-gray-400 mt-3">Você ainda não jogou futevôlei em nenhum clube.</p>
              ) : (
                <>
                  <select
                    value={selectedVenueId}
                    onChange={e => setSelectedVenueId(e.target.value)}
                    className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700"
                  >
                    {venueOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-2">Só aparecem jogadores com {PROVISIONAL_MATCHES_THRESHOLD}+ partidas de futevôlei confirmadas.</p>
                </>
              )
            )}
          </div>

          {activeRankingsLoading ? (
            <p className="px-6 text-sm text-gray-400">Carregando...</p>
          ) : activeRankings.length === 0 ? (
            <p className="px-6 text-sm text-gray-500">
              {rankingScope === 'clube' && venueOptions.length === 0 ? '' : 'Nenhum jogador encontrado nesse recorte.'}
            </p>
          ) : (
            <>
              {activeRankings.length >= 3 && (
                <div className="px-6 mb-6">
                  <div className="flex items-end justify-center gap-2 mb-6">
                    <div onClick={() => navigate(`/player/${activeRankings[1].id}`)} className="flex-1 text-center cursor-pointer">
                      <div className="bg-gray-300 rounded-t-xl p-4 pt-8">
                        <div className="w-16 h-16 bg-violet-600 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-2 overflow-hidden">
                          {activeRankings[1].avatarUrl ? <img src={activeRankings[1].avatarUrl} alt="" className="w-full h-full object-cover" /> : activeRankings[1].avatar}
                        </div>
                        <div className="font-semibold text-gray-900 text-sm">{activeRankings[1].name.split(' ')[0]}</div>
                        <div className="text-xs text-gray-600">{activeRankings[1].rating.toFixed(2)}</div>
                        <div className="text-2xl font-bold text-gray-600 mt-2">2°</div>
                      </div>
                    </div>
                    <div onClick={() => navigate(`/player/${activeRankings[0].id}`)} className="flex-1 text-center cursor-pointer">
                      <div className="bg-yellow-400 rounded-t-xl p-4 pt-4">
                        <Trophy className="w-6 h-6 text-yellow-700 mx-auto mb-2" />
                        <div className="w-20 h-20 bg-violet-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-2 overflow-hidden">
                          {activeRankings[0].avatarUrl ? <img src={activeRankings[0].avatarUrl} alt="" className="w-full h-full object-cover" /> : activeRankings[0].avatar}
                        </div>
                        <div className="font-bold text-gray-900">{activeRankings[0].name.split(' ')[0]}</div>
                        <div className="text-xs text-gray-700">{activeRankings[0].rating.toFixed(2)}</div>
                        <div className="text-3xl font-bold text-yellow-700 mt-2">1°</div>
                      </div>
                    </div>
                    <div onClick={() => navigate(`/player/${activeRankings[2].id}`)} className="flex-1 text-center cursor-pointer">
                      <div className="bg-orange-300 rounded-t-xl p-4 pt-12">
                        <div className="w-14 h-14 bg-violet-600 rounded-full flex items-center justify-center text-white text-lg font-bold mx-auto mb-2 overflow-hidden">
                          {activeRankings[2].avatarUrl ? <img src={activeRankings[2].avatarUrl} alt="" className="w-full h-full object-cover" /> : activeRankings[2].avatar}
                        </div>
                        <div className="font-semibold text-gray-900 text-sm">{activeRankings[2].name.split(' ')[0]}</div>
                        <div className="text-xs text-gray-600">{activeRankings[2].rating.toFixed(2)}</div>
                        <div className="text-xl font-bold text-orange-700 mt-2">3°</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="px-6 space-y-2">
                {activeRankings.slice(activeRankings.length >= 3 ? 3 : 0).map((player) => (
                  <div key={player.id} onClick={() => navigate(`/player/${player.id}`)} className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-3 cursor-pointer hover:border-violet-200 transition-colors">
                    <div className="text-lg font-bold text-gray-400 w-8 text-center">{player.position}°</div>
                    <div className="w-12 h-12 bg-violet-600 rounded-full flex items-center justify-center text-white text-lg font-bold overflow-hidden">
                      {player.avatarUrl ? <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" /> : player.avatar}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                        {player.name}
                        {player.matches_played < PROVISIONAL_MATCHES_THRESHOLD && (
                          <span className="text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1 py-0.5 rounded">Provisório</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">{player.matches_played} partidas</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-violet-600">{player.rating.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {myRanking && (
                <div className="px-6 mt-6">
                  <div onClick={() => navigate('/profile')} className="bg-violet-600 text-white rounded-xl p-4 flex items-center gap-3 cursor-pointer">
                    <div className="text-lg font-bold w-8 text-center">{myRanking.position}°</div>
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-lg font-bold overflow-hidden">
                      {myRanking.avatarUrl ? <img src={myRanking.avatarUrl} alt="" className="w-full h-full object-cover" /> : myRanking.avatar}
                    </div>
                    <div className="flex-1"><div className="font-semibold">Você</div><div className="text-sm text-violet-100">{myRanking.matches_played} partidas</div></div>
                    <div className="text-right"><div className="font-bold">{myRanking.rating.toFixed(2)}</div></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'messages' && (
        <div className="px-6 py-6 space-y-3">
          <ComingSoonBanner />
          {messages.map((message) => (
            <div key={message.id} className="bg-white rounded-xl p-4 border border-gray-200 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-violet-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">{message.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <div><h3 className="font-semibold text-gray-900">{message.name}</h3>{message.type === 'group' && <span className="text-xs text-gray-500">Grupo</span>}</div>
                    <span className="text-xs text-gray-500">{message.time}</span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{message.lastMessage}</p>
                </div>
                {message.unread > 0 && <div className="bg-violet-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{message.unread}</div>}
              </div>
            </div>
          ))}
          <button className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-violet-700 transition-colors mt-6"><Send className="w-5 h-5" />Nova mensagem</button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 max-w-md mx-auto">
        <div className="flex items-center justify-around">
          <button onClick={() => { setActiveBottomTab('home'); navigate('/home'); }} className={`flex flex-col items-center gap-1 ${activeBottomTab === 'home' ? 'text-violet-600' : 'text-gray-400'}`}><HomeIcon className="w-6 h-6" /><span className="text-xs">Início</span></button>
          <button onClick={() => { setActiveBottomTab('community'); navigate('/community'); }} className={`flex flex-col items-center gap-1 ${activeBottomTab === 'community' ? 'text-violet-600' : 'text-gray-400'}`}><Users className="w-6 h-6" /><span className="text-xs">Comunidade</span></button>
          <button onClick={() => { setActiveBottomTab('profile'); navigate('/profile'); }} className={`flex flex-col items-center gap-1 ${activeBottomTab === 'profile' ? 'text-violet-600' : 'text-gray-400'}`}><User className="w-6 h-6" /><span className="text-xs">Perfil</span></button>
        </div>
      </div>
    </div>
  );
}
