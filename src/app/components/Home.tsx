import { useNavigate, useLocation } from 'react-router-dom';
import { Search, MapPin, Users, Trophy, GraduationCap, User, Home as HomeIcon, Menu, Bell, Calendar, Zap, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface VenueCard {
  id: string;
  name: string;
  city: string;
  address: string;
  image: string;
  firstCourtId: string | null;
  courtCount: number;
}

interface UpcomingGame {
  id: string;
  courtName: string;
  venueName: string;
  sportType: string;
  scheduledAt: string;
  endTime: string | null;
  currentPlayers: number;
  maxPlayers: number;
  players: { name: string; paid: boolean }[];
  isOrganizer: boolean;
  isOpen: boolean;
  organizerPaid: boolean;
  status: string;
}

interface UpcomingBooking {
  id: string;
  courtName: string;
  venueName: string;
  startTime: string;
  endTime: string | null;
  totalPrice: number;
  paymentStatus: string;
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('home');
  const [showWelcome, setShowWelcome] = useState(
    (location.state as { firstLogin?: boolean } | null)?.firstLogin === true
  );
  const { profile, signOut, user } = useAuth();
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const [venues, setVenues] = useState<VenueCard[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<UpcomingGame[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    let gamesChannel: ReturnType<typeof supabase.channel> | null = null;
    let bookingsChannel: ReturnType<typeof supabase.channel> | null = null;
    let notifChannel: ReturnType<typeof supabase.channel> | null = null;
    let refetchBookings: (() => void) | null = null;
    let refetchGames: (() => void) | null = null;

    // Visibility fallback: re-fetch when user returns to the tab/app
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        refetchBookings?.();
        refetchGames?.();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    // Unread notifications count + realtime badge update
    const refreshUnread = () =>
        supabase.from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('read', false)
          .then(({ count }) => setUnreadCount(count ?? 0));

      refreshUnread();

      notifChannel = supabase
        .channel(`home-notif-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `user_id=eq.${userId}` }, () => {
          refreshUnread();
        })
        .subscribe();

      // Upcoming games — extracted so it can be re-run on realtime changes
      async function fetchUpcomingGames() {
        const now = new Date().toISOString();

        const activeStatuses = ['scheduled', 'confirmed_booking'];
        const [{ data: asOrganizer }, { data: asPlayer }] = await Promise.all([
          supabase.from('games').select('id, court_id, scheduled_at, current_players, max_players, organizer_id, is_open, status')
            .eq('organizer_id', userId).in('status', activeStatuses).gte('scheduled_at', now).order('scheduled_at'),
          supabase.from('game_players').select('game_id').eq('player_id', userId),
        ]);

        const playerGameIds = (asPlayer ?? []).map(p => p.game_id);
        const organizerGameIds = new Set((asOrganizer ?? []).map(g => g.id));

        let playerGames: any[] = [];
        if (playerGameIds.length > 0) {
          const { data } = await supabase.from('games')
            .select('id, court_id, scheduled_at, current_players, max_players, organizer_id, is_open, status')
            .in('id', playerGameIds).in('status', activeStatuses).gte('scheduled_at', now).order('scheduled_at');
          playerGames = data ?? [];
        }

        const seenIds = new Set<string>();
        const allGames = [...(asOrganizer ?? []), ...playerGames.filter(g => !organizerGameIds.has(g.id))]
          .filter(g => { if (seenIds.has(g.id)) return false; seenIds.add(g.id); return true; });

        if (allGames.length > 0) {
          const courtIds = [...new Set(allGames.map(g => g.court_id).filter(Boolean))];
          const { data: courts } = await supabase
            .from('courts').select('id, name, venue_id, sport_type').in('id', courtIds);
          const venueIds = [...new Set((courts ?? []).map((c: any) => c.venue_id).filter(Boolean))];
          const { data: venueRows } = await supabase.from('venues').select('id, name').in('id', venueIds);

          const courtMap = Object.fromEntries((courts ?? []).map((c: any) => [c.id, c]));
          const venueMap = Object.fromEntries((venueRows ?? []).map((v: any) => [v.id, v]));

          const { data: gamePlayers } = await supabase.from('game_players')
            .select('game_id, player_id, player_name, paid').in('game_id', allGames.map(g => g.id)).order('joined_at');

          const playersByGame: Record<string, { name: string; paid: boolean }[]> = {};
          const orgPaidMap: Record<string, boolean> = {};
          (gamePlayers ?? []).forEach((p: any) => {
            if (!playersByGame[p.game_id]) playersByGame[p.game_id] = [];
            playersByGame[p.game_id].push({ name: p.player_name, paid: p.paid });
            // Track organizer paid status per game
            const parentGame = allGames.find(g => g.id === p.game_id);
            if (parentGame && p.player_id === parentGame.organizer_id) {
              orgPaidMap[p.game_id] = p.paid;
            }
          });

          const organizerIds = [...new Set(allGames.map(g => g.organizer_id).filter(Boolean))];
          const { data: orgProfiles } = await supabase.from('profiles').select('id, name').in('id', organizerIds);
          const orgNameMap = Object.fromEntries((orgProfiles ?? []).map((p: any) => [p.id, p.name]));

          const upcoming: UpcomingGame[] = allGames.map(g => {
            const court = courtMap[g.court_id];
            const venue = court ? venueMap[court.venue_id] : null;
            const orgName = orgNameMap[g.organizer_id] ?? 'Organizador';
            const joined = playersByGame[g.id] ?? [];
            const orgPaid = g.id in orgPaidMap ? orgPaidMap[g.id] : true;
            const allPlayers = [{ name: orgName, paid: orgPaid }, ...joined.filter(p => p.name !== orgName)];
            const sportType = court?.sport_type ?? '';

            // Retroactive confirmation: if a futsal game already has enough players
            // but status wasn't updated (created before this logic was deployed),
            // update it now silently.
            let gameStatus = g.status ?? 'scheduled';
            if (gameStatus === 'scheduled' && sportType === 'futsal' && g.current_players >= 2) {
              gameStatus = 'confirmed_booking';
              supabase.from('games')
                .update({ status: 'confirmed_booking' })
                .eq('id', g.id)
                .eq('status', 'scheduled')
                .then(() => {});
            }

            return {
              id: g.id,
              courtName: court?.name ?? 'Quadra',
              venueName: venue?.name ?? '',
              sportType,
              scheduledAt: g.scheduled_at,
              endTime: null,
              currentPlayers: g.current_players,
              maxPlayers: g.max_players,
              players: allPlayers,
              isOrganizer: g.organizer_id === userId,
              isOpen: g.is_open ?? true,
              organizerPaid: orgPaid,
              status: gameStatus,
            };
          });

          setUpcomingGames(upcoming.slice(0, 5));
        } else {
          setUpcomingGames([]);
        }
      }

      refetchGames = fetchUpcomingGames;
      fetchUpcomingGames();

      // Realtime: re-fetch when any game is updated (e.g. cancellation sets is_open=false)
      gamesChannel = supabase
        .channel(`home-games-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
          fetchUpcomingGames();
        })
        .subscribe();

      // Upcoming slot bookings — extracted for realtime re-fetch
      async function fetchUpcomingBookings() {
        const now = new Date().toISOString();
        const { data: rawBookingRows } = await supabase
          .from('bookings')
          .select('id, slot_id, total_price, payment_status')
          .eq('created_by', userId)
          .eq('status', 'confirmed')
          .not('slot_id', 'is', null);

        if (!rawBookingRows?.length) { setUpcomingBookings([]); return; }

        // Exclude bookings that belong to a private game (shown as game card instead)
        const rawIds = rawBookingRows.map((b: any) => b.id);
        const { data: privateGameBookings } = await supabase
          .from('games').select('booking_id').in('booking_id', rawIds).not('booking_id', 'is', null);
        const privateSet = new Set((privateGameBookings ?? []).map((g: any) => g.booking_id));

        const seenSlots = new Set<string>();
        const bookingRows = rawBookingRows.filter((b: any) => {
          if (privateSet.has(b.id)) return false;
          if (seenSlots.has(b.slot_id)) return false;
          seenSlots.add(b.slot_id);
          return true;
        });

        if (!bookingRows.length) {
          setUpcomingBookings([]);
          return;
        }

        const slotIds = bookingRows.map((b: any) => b.slot_id).filter(Boolean);
        const { data: slotRows } = await supabase
          .from('slots')
          .select('id, start_time, end_time, court_id')
          .in('id', slotIds)
          .gte('start_time', now)
          .order('start_time', { ascending: true });

        if (!slotRows?.length) {
          setUpcomingBookings([]);
          return;
        }

        const courtIds = [...new Set(slotRows.map((s: any) => s.court_id).filter(Boolean))];
        const { data: courtRows } = await supabase
          .from('courts').select('id, name, venue_id').in('id', courtIds);
        const venueIds = [...new Set((courtRows ?? []).map((c: any) => c.venue_id).filter(Boolean))];
        const { data: venueRows } = await supabase
          .from('venues').select('id, name').in('id', venueIds);

        const slotMap = Object.fromEntries((slotRows ?? []).map((s: any) => [s.id, s]));
        const courtMap2 = Object.fromEntries((courtRows ?? []).map((c: any) => [c.id, c]));
        const venueMap2 = Object.fromEntries((venueRows ?? []).map((v: any) => [v.id, v]));

        const bookings: UpcomingBooking[] = bookingRows
          .filter((b: any) => slotMap[b.slot_id])
          .map((b: any) => {
            const slot = slotMap[b.slot_id];
            const court = courtMap2[slot.court_id];
            const venue = court ? venueMap2[court.venue_id] : null;
            return {
              id: b.id,
              courtName: court?.name ?? 'Quadra',
              venueName: venue?.name ?? '',
              startTime: slot.start_time,
              endTime: slot.end_time ?? null,
              totalPrice: b.total_price ?? 0,
              paymentStatus: b.payment_status ?? 'pending',
            };
          })
          .sort((a: UpcomingBooking, b: UpcomingBooking) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          )
          .slice(0, 5);

        setUpcomingBookings(bookings);
      }

      refetchBookings = fetchUpcomingBookings;
      fetchUpcomingBookings();

      // Realtime: re-fetch on any booking change (INSERT for new bookings, UPDATE for cancellations)
      bookingsChannel = supabase
        .channel(`home-bookings-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
          fetchUpcomingBookings();
        })
        .subscribe();

    // Games — flat query only (exclude full and already-started games)
    const nowIso = new Date().toISOString();
    supabase
      .from('games')
      .select('id, court_id, price_per_player, max_players, current_players, skill_level, is_open, scheduled_at, status')
      .eq('is_open', true)
      .in('status', ['scheduled', 'confirmed_booking'])
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(10) // fetch extra so we still have 3 after filtering out full ones
      .then(({ data }) => {
        if (data) {
          const available = data.filter(g => g.current_players < g.max_players);
          setRecentGames(available.slice(0, 3));
        }
      });

    // Clubs — fetch venues then their courts separately
    async function fetchVenues() {
      const { data: venueRows } = await supabase
        .from('venues')
        .select('id, name, city, address');

      if (!venueRows?.length) return;

      const { data: courtRows } = await supabase
        .from('courts')
        .select('id, venue_id, images')
        .in('venue_id', venueRows.map(v => v.id));

      const courtsByVenue: Record<string, any[]> = {};
      (courtRows ?? []).forEach(c => {
        if (!courtsByVenue[c.venue_id]) courtsByVenue[c.venue_id] = [];
        courtsByVenue[c.venue_id].push(c);
      });

      const cards: VenueCard[] = venueRows.map(v => {
        const courts = courtsByVenue[v.id] ?? [];
        const firstImage = courts.find(c => c.images?.length > 0)?.images?.[0]
          ?? 'https://images.unsplash.com/photo-1624880357913-a8539238245b?w=400&q=80';
        return {
          id: v.id,
          name: v.name,
          city: v.city ?? '',
          address: v.address ?? '',
          image: firstImage,
          firstCourtId: courts[0]?.id ?? null,
          courtCount: courts.length,
        };
      });

      setVenues(cards);
    }
    fetchVenues();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (gamesChannel) supabase.removeChannel(gamesChannel);
      if (bookingsChannel) supabase.removeChannel(bookingsChannel);
      if (notifChannel) supabase.removeChannel(notifChannel);
    };
  }, [user?.id]);

  const firstName = profile?.name?.split(' ')[0] ?? 'Jogador';

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-violet-600 text-white px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="JoggaHub" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
            <div>
              <p className="text-sm text-violet-100">Olá,</p>
              <h1 className="text-xl font-bold">{firstName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/notifications')} className="bg-white/20 backdrop-blur-sm rounded-full p-2 relative">
              <Bell className="w-6 h-6" />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
            </button>
            <button onClick={() => navigate('/menu')} className="bg-white/20 backdrop-blur-sm rounded-full p-2">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div onClick={() => navigate('/find-courts')} className="bg-white rounded-xl p-3 flex items-center gap-3 cursor-pointer">
          <Search className="w-5 h-5 text-gray-400" />
          <span className="flex-1 text-gray-400">Buscar quadras, jogos...</span>
        </div>
      </div>

      {/* Welcome banner — shown only after first onboarding */}
      {showWelcome && (
        <div className="mx-6 mt-5 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl p-4 flex items-center gap-3 shadow">
          <div className="bg-white/20 rounded-full p-2 flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">Bem-vindo, {profile?.name?.split(' ')[0]}! +20 XP</p>
            <p className="text-xs text-white/80">Perfil criado com sucesso. Bora jogar!</p>
          </div>
          <button onClick={() => setShowWelcome(false)} className="text-white/70 hover:text-white flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Próximas partidas + reservas */}
      {(upcomingGames.length > 0 || upcomingBookings.length > 0) && (
        <div className="px-6 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Próximas partidas</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6" style={{ scrollbarWidth: 'none' }}>

            {/* Slot booking cards */}
            {upcomingBookings.map(booking => {
              const dt = new Date(booking.startTime);
              const dateLabel = dt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
              const timeLabel = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              const endLabel = booking.endTime
                ? new Date(booking.endTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : null;
              const isPaid = booking.paymentStatus === 'paid';

              return (
                <div key={booking.id} onClick={() => navigate('/my-bookings', { state: { highlightId: booking.id } })} className="flex-shrink-0 w-72 bg-white rounded-2xl border border-gray-200 overflow-hidden cursor-pointer active:scale-[0.99] transition-transform">
                  <div className="h-1.5 bg-violet-600 w-full" />
                  <div className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{dateLabel} · {timeLabel}{endLabel ? ` – ${endLabel}` : ''}</p>
                        <p className="text-sm font-semibold text-gray-700">{booking.venueName}</p>
                        <p className="text-xs text-gray-400">{booking.courtName}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-[10px] font-bold ${isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isPaid ? 'Pago' : 'Pendente'}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-violet-500" />
                        <span className="text-xs text-gray-500">Reserva de quadra</span>
                      </div>
                      <span className="text-sm font-bold text-violet-600">R$ {booking.totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Open game cards */}
            {upcomingGames.map(game => {
              const dt = new Date(game.scheduledAt);
              const dateLabel = dt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
              const timeLabel = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              const isFull = game.currentPlayers >= game.maxPlayers;
              const isPendingPayment = !game.isOpen && game.isOrganizer && !game.organizerPaid;
              const isConfirmed = (isFull || game.status === 'confirmed_booking') && !isPendingPayment;
              const isPendingResults = game.status === 'pending_results';

              const SPORT_LABELS: Record<string, string> = { football: 'Society', society: 'Society', futsal: 'Futsal' };
              const spotsLeft = game.maxPlayers - game.currentPlayers;

              return (
                <div
                  key={game.id}
                  onClick={() => navigate(`/open-game/${game.id}`)}
                  className="flex-shrink-0 w-72 bg-white rounded-2xl border border-gray-200 p-4 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  {/* Sport + venue + status */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-0.5">
                        {SPORT_LABELS[game.sportType] ?? game.sportType}
                      </p>
                      <p className="font-bold text-gray-900">{game.venueName}</p>
                      <p className="text-sm text-gray-500">{game.courtName}</p>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ml-2 ${
                      isPendingResults ? 'bg-orange-100 text-orange-700' :
                      isPendingPayment ? 'bg-amber-100 text-amber-700' :
                      isConfirmed ? 'bg-green-100 text-green-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {isPendingResults ? 'Aguardando dados' : isPendingPayment ? 'Pagamento pendente' : isConfirmed ? 'Confirmada' : 'Aguardando'}
                    </div>
                  </div>

                  {/* Date + time */}
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-3">
                    <Calendar className="w-4 h-4" />
                    <span>{dateLabel} · {timeLabel}</span>
                  </div>

                  {/* Players count + vagas badge */}
                  <div className="flex items-center justify-between text-sm mb-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span className="font-semibold text-gray-900">{game.currentPlayers}/{game.maxPlayers}</span>
                      <span className="text-gray-500">jogadores</span>
                    </div>
                    {spotsLeft > 0 ? (
                      <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                        {spotsLeft} {spotsLeft === 1 ? 'vaga' : 'vagas'}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">Completo</span>
                    )}
                  </div>

                  {/* Segmented progress bar */}
                  <div className="flex gap-1">
                    {Array.from({ length: game.maxPlayers }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-1.5 rounded-full ${i < game.currentPlayers ? (isFull ? 'bg-green-500' : 'bg-violet-600') : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Explorar Menu */}
      <div className="px-6 py-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Explorar</h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6">
          <button onClick={() => navigate('/find-courts')} className="flex-shrink-0 bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-violet-600 transition-colors min-w-[160px]">
            <div className="bg-violet-100 rounded-full p-3 w-fit mb-3"><MapPin className="w-6 h-6 text-violet-600" /></div>
            <div className="font-semibold text-gray-900 text-left">Encontrar</div>
            <div className="text-sm text-gray-600 text-left">Quadras</div>
          </button>

          <button onClick={() => navigate('/coaching')} className="flex-shrink-0 bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-purple-600 transition-colors min-w-[160px]">
            <div className="bg-purple-100 rounded-full p-3 w-fit mb-3"><GraduationCap className="w-6 h-6 text-purple-600" /></div>
            <div className="font-semibold text-gray-900 text-left">Aulas</div>
            <div className="text-sm text-gray-600 text-left">Aprenda</div>
          </button>

          <button onClick={() => navigate('/competitions')} className="flex-shrink-0 bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-yellow-600 transition-colors min-w-[160px]">
            <div className="bg-yellow-100 rounded-full p-3 w-fit mb-3"><Trophy className="w-6 h-6 text-yellow-600" /></div>
            <div className="font-semibold text-gray-900 text-left">Competições</div>
            <div className="text-sm text-gray-600 text-left">Participe</div>
          </button>

          <button onClick={() => navigate('/find-games')} className="flex-shrink-0 bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-green-600 transition-colors min-w-[160px]">
            <div className="bg-green-100 rounded-full p-3 w-fit mb-3"><Users className="w-6 h-6 text-green-600" /></div>
            <div className="font-semibold text-gray-900 text-left">Encontre</div>
            <div className="text-sm text-gray-600 text-left">uma partida</div>
          </button>
        </div>
      </div>

      {/* Jogos abertos */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Jogos abertos</h2>
          <button onClick={() => navigate('/find-games')} className="text-violet-600 text-sm font-semibold">Ver todos</button>
        </div>
        {recentGames.length === 0 ? (
          <div className="bg-white rounded-xl p-6 border border-gray-200 text-center text-gray-500 text-sm">
            Nenhum jogo aberto disponível no momento.
          </div>
        ) : (
          <div className="space-y-3">
            {recentGames.map((game) => (
              <div key={game.id} onClick={() => navigate(`/open-game/${game.id}`)} className="bg-white rounded-xl p-4 border border-gray-200 cursor-pointer hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-gray-900">Jogo Aberto</div>
                    {game.scheduled_at && (
                      <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                        <MapPin className="w-4 h-4" />
                        <span>{new Date(game.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-violet-600">R$ {game.price_per_player}</div>
                    <div className="text-xs text-gray-500">por pessoa</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-gray-600"><Users className="w-4 h-4" /><span>{game.current_players}/{game.max_players}</span></div>
                  {game.skill_level && <span className="px-2 py-1 bg-violet-100 text-violet-700 rounded-full text-xs">{game.skill_level}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clubes Disponíveis */}
      <div className="py-4 mb-6">
        <div className="flex items-center justify-between mb-4 px-6">
          <h2 className="text-lg font-semibold text-gray-900">Clubes disponíveis</h2>
          <button onClick={() => navigate('/find-courts')} className="text-violet-600 text-sm font-semibold">Ver todos</button>
        </div>
        {venues.length === 0 ? (
          <div className="mx-6 bg-white rounded-xl p-6 border border-gray-200 text-center text-gray-500 text-sm">
            Nenhum clube cadastrado ainda.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-0 px-6" style={{ scrollbarWidth: 'none' }}>
            {venues.map((venue) => (
              <div
                key={venue.id}
                onClick={() => venue.firstCourtId && navigate(`/court-details/${venue.firstCourtId}`)}
                className="flex-shrink-0 bg-white rounded-xl overflow-hidden border border-gray-200 cursor-pointer hover:shadow-md transition-shadow w-44"
              >
                <img
                  src={venue.image}
                  alt={venue.name}
                  className="w-full h-28 object-cover"
                />
                <div className="p-3">
                  <div className="font-semibold text-gray-900 text-sm truncate">{venue.name}</div>
                  {(venue.city || venue.address) && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{venue.city || venue.address}</span>
                    </div>
                  )}
                  <div className="text-xs text-violet-600 font-medium mt-1">
                    {venue.courtCount === 1 ? '1 quadra' : `${venue.courtCount} quadras`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 max-w-md mx-auto">
        <div className="flex items-center justify-around">
          <button onClick={() => { setActiveTab('home'); navigate('/home'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-violet-600' : 'text-gray-400'}`}>
            <HomeIcon className="w-6 h-6" /><span className="text-xs">Início</span>
          </button>
          <button onClick={() => { setActiveTab('community'); navigate('/community'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'community' ? 'text-violet-600' : 'text-gray-400'}`}>
            <Users className="w-6 h-6" /><span className="text-xs">Comunidade</span>
          </button>
          <button onClick={() => { setActiveTab('profile'); navigate('/profile'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-violet-600' : 'text-gray-400'}`}>
            <User className="w-6 h-6" /><span className="text-xs">Perfil</span>
          </button>
        </div>
      </div>
    </div>
  );
}
