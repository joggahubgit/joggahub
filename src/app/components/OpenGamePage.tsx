import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Share2, MessageCircle, Calendar, CheckCircle, Copy, Loader2, MapPin, Search, X, Crown, Trash2, Zap, Shield, Clock, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { notify, notifyGamePlayers } from '@/app/lib/notify';
import { redirectToCheckout, calcFees } from '@/app/lib/checkout';
import { PLAYER_CANCEL_CUTOFF_HOURS, getMinPlayersForSport } from '@/app/lib/gameConfig';

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', society: 'Society', futsal: 'Futsal',
  tennis: 'Tênis', padel: 'Padel', basketball: 'Basquete',
  volleyball: 'Vôlei', beach_tennis: 'Beach Tennis',
};

function sportLabel(s: string) {
  return SPORT_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

interface PageState {
  courtName: string;
  courtSport: string;
  venueName: string;
  date: string;
  time: string;
  endTime: string;
  maxPlayers: number;
  pricePerPlayer: number;
  organizerName: string;
  slotId?: string;
}

interface Player {
  name: string;
  isOrganizer?: boolean;
  paid?: boolean;
  isCurrentUser?: boolean;
}

export default function OpenGamePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const passed = location.state as PageState | null;

  const [currentPlayers, setCurrentPlayers] = useState(1);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showShare, setShowShare] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [isEnrolled, setIsEnrolled] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameUnavailable, setGameUnavailable] = useState<'cancelled' | 'inactive' | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showPlayerLeaveConfirm, setShowPlayerLeaveConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gameStatus, setGameStatus] = useState<'scheduled' | 'confirmed_booking' | 'pending_results' | 'completed' | 'expired'>('scheduled');
  const [gameStartTime, setGameStartTime] = useState<string | null>(null); // ISO UTC from slots.start_time
  const [withinCancelCutoff, setWithinCancelCutoff] = useState(false); // true = player cannot self-cancel
  const [withinJoinCutoff, setWithinJoinCutoff] = useState(false); // true = no new players allowed (< 15 min)
  const [isPrivate, setIsPrivate] = useState(false);
  const [gamePayMode, setGamePayMode] = useState<'split' | 'full'>('split');
  const [courtPrice, setCourtPrice] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [organizerPaid, setOrganizerPaid] = useState(true);
  const [payingReservation, setPayingReservation] = useState(false);


  // Display values — from passed state (creator flow) or fetched
  const [courtName, setCourtName] = useState(passed?.courtName ?? '');
  const [courtSport, setCourtSport] = useState(passed?.courtSport ?? '');
  const [venueName, setVenueName] = useState(passed?.venueName ?? '');
  const [date, setDate] = useState(passed?.date ?? '');
  const [time, setTime] = useState(passed?.time ?? '');
  const [endTime, setEndTime] = useState(passed?.endTime ?? '');
  const [maxPlayers, setMaxPlayers] = useState(passed?.maxPlayers ?? 0);
  const [pricePerPlayer, setPricePerPlayer] = useState(passed?.pricePerPlayer ?? 0);
  const [organizerName, setOrganizerName] = useState(passed?.organizerName ?? '');

  useEffect(() => {
    if (passed) {
      setPlayers([{ name: passed.organizerName || 'Organizador', isOrganizer: true, paid: true }]);
    }
    if (!id) return;

    async function load() {
      // Check current user
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch live game data
      const { data: game } = await supabase.from('games').select('*').eq('id', id).single();
      if (!game) { navigate('/home', { replace: true }); return; }

      // Mark as unavailable if cancelled, expired, or no players left
      const terminalStatuses = ['cancelled', 'expired'];
      if (terminalStatuses.includes(game.status) || (game.current_players ?? 0) === 0) {
        setGameUnavailable(game.status === 'cancelled' ? 'cancelled' : 'inactive');
        setLoading(false);
        return;
      }
      setCurrentPlayers(game.current_players ?? 1);
      setPricePerPlayer(game.price_per_player);
      setMaxPlayers(game.max_players);
      setCourtPrice(game.court_price ?? (game.price_per_player * 18));

      if (user) setCurrentUserId(user.id);
      // Is current user the organizer? Use local var to avoid stale state reads
      const userIsOrganizer = !!user && game.organizer_id === user.id;
      if (userIsOrganizer) {
        setIsOrganizer(true);
        setIsEnrolled(true);
      }

      // Fetch organizer profile
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', game.organizer_id).single();
      const name = profile?.name ?? organizerName ?? 'Organizador';
      setOrganizerName(name);

      // Fetch all joined players
      const { data: gamePlayers } = await supabase
        .from('game_players')
        .select('player_name, paid, player_id')
        .eq('game_id', id)
        .order('id');

      // Exclude organizer from joined list (they're shown separately as slot 0)
      const organizerEntry = (gamePlayers ?? []).find(p => p.player_id === game.organizer_id);
      const orgIsPaid = organizerEntry?.paid ?? true; // default true for existing bookings
      if (userIsOrganizer) setOrganizerPaid(orgIsPaid);
      const joined = (gamePlayers ?? [])
        .filter(p => p.player_id !== game.organizer_id)
        .map(p => ({ name: p.player_name, paid: p.paid, isCurrentUser: user ? p.player_id === user.id : false }));
      setPlayers([{ name, isOrganizer: true, paid: orgIsPaid }, ...joined]);

      // Mark non-organizer player as enrolled only if payment confirmed
      if (user && !userIsOrganizer) {
        const inGame = (gamePlayers ?? []).some(p => p.player_id === user.id && p.paid === true);
        if (inGame) setIsEnrolled(true);
      }

      // Always fetch court to get authoritative sport_type (game.sport_type may be the default 'football')
      let courtSportType = game.sport_type ?? '';
      if (game.court_id) {
        const { data: court } = await supabase.from('courts').select('id, name, sport_type, venue_id').eq('id', game.court_id).single();
        if (court) {
          courtSportType = court.sport_type ?? courtSportType;
          if (!passed) {
            setCourtName(court.name);
            setCourtSport(court.sport_type ?? '');
            const scheduledAt: string = game.scheduled_at ?? '';
            setDate(scheduledAt.substring(0, 10));
            setTime(scheduledAt.substring(11, 16));
            const { data: venue } = await supabase.from('venues').select('name').eq('id', court.venue_id).single();
            if (venue) setVenueName(venue.name);
          }
        }
      }

      // Retroactive confirmation: uses court sport_type as authoritative source
      // (game.sport_type may be 'football' default even for futsal courts)
      let resolvedStatus = game.status ?? 'scheduled';
      if (
        resolvedStatus === 'scheduled' &&
        (game.current_players ?? 1) >= getMinPlayersForSport(courtSportType)
      ) {
        resolvedStatus = 'confirmed_booking';
        supabase.from('games')
          .update({ status: 'confirmed_booking' })
          .eq('id', id)
          .eq('status', 'scheduled')
          .then(() => {});
      }
      // Retroactive expiry: cancelled open games that were set to is_open=false
      // before the status field was properly updated
      if (resolvedStatus === 'scheduled' && !game.is_open && !game.booking_id) {
        resolvedStatus = 'expired';
        supabase.from('games')
          .update({ status: 'expired' })
          .eq('id', id)
          .eq('status', 'scheduled')
          .then(() => {});
      }
      setGameStatus(resolvedStatus as typeof gameStatus);
      setIsPrivate(!game.is_open && !!game.booking_id);
      setGamePayMode((game.pay_mode as 'split' | 'full') ?? 'split');

      // Always fetch slot times (needed for cancel cutoff check regardless of passed state)
      if (game.slot_id) {
        const { data: slot } = await supabase
          .from('slots')
          .select('start_time, end_time')
          .eq('id', game.slot_id)
          .single();
        const endTimeVal = game.scheduled_end_at ?? slot?.end_time;
        if (endTimeVal && !passed?.endTime) setEndTime(endTimeVal.substring(11, 16));
        if (slot?.start_time) {
          setGameStartTime(slot.start_time);
          const msUntilStart = new Date(slot.start_time).getTime() - Date.now();
          setWithinCancelCutoff(msUntilStart < PLAYER_CANCEL_CUTOFF_HOURS * 60 * 60 * 1000);
          setWithinJoinCutoff(msUntilStart < 15 * 60 * 1000);
        }
      }
    }
    load().finally(() => setLoading(false));
  }, [id]);

  function buildShareMessage() {
    const gameUrl = `${window.location.origin}/open-game/${id}`;
    if (isPrivate) {
      return [
        `🔒 Partida privada no JoggaHub!`,
        ``,
        `🏟️ ${sportLabel(courtSport)}`,
        `📅 ${formatDate(date)}`,
        `🕐 ${time}${endTime ? ` – ${endTime}` : ''}`,
        `📍 ${courtName} · ${venueName}`,
        ``,
        `Acesse pelo link para confirmar sua presença:`,
        gameUrl,
      ].join('\n');
    }
    const playerLines = players.map(p => `✅ ${p.name}`).join('\n');
    const remaining = maxPlayers - currentPlayers;
    return [
      `⚽ Partida aberta no JoggaHub!`,
      ``,
      `🏟️ ${sportLabel(courtSport)}`,
      `📅 ${formatDate(date)}`,
      `🕐 ${time}${endTime ? ` – ${endTime}` : ''}`,
      `📍 ${courtName} · ${venueName}`,
      `💰 R$ ${pricePerPlayer}/pessoa`,
      ``,
      `👥 Jogadores (${currentPlayers}/${maxPlayers}):`,
      playerLines,
      ``,
      remaining > 0
        ? `Ainda há ${remaining} ${remaining === 1 ? 'vaga' : 'vagas'}! Entre pelo JoggaHub para participar.`
        : `Partida completa!`,
    ].join('\n');
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildShareMessage())}`, '_blank');
    setShowShare(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildShareMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleJoin() {
    if (withinJoinCutoff) return;
    setJoining(true);
    setJoinError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setJoinError('Você precisa estar logado.'); setJoining(false); return; }

    const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single();
    const name = profile?.name ?? 'Jogador';

    try {
      await redirectToCheckout({
        gameId: id!,
        playerId: user.id,
        playerName: name,
        courtName,
        venueName,
        sport: sportLabel(courtSport),
        date,
        time,
        vagaPrice: courtPrice / 10,
        mode: 'join_self',
        captureManual: true,
        payMode: 'split',
      });
    } catch (e: any) {
      setJoinError(e.message);
      setJoining(false);
    }
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, phone')
        .ilike('name', `%${q}%`)
        .limit(8);
      setSearchResults(data ?? []);
      setSearching(false);
    }, 300);
  }

  function handleSelectPlayer(p: { id: string; name: string }) {
    if (withinJoinCutoff) return;
    setShowAddPlayer(false);
    setSearchQuery('');
    setSearchResults([]);
    navigate(`/join-game-review/${id}`, {
      state: {
        gameId: id,
        playerName: p.name,
        playerId: p.id,
        courtName,
        courtSport,
        venueName,
        date,
        time,
        endTime,
        pricePerPlayer,
      },
    });
  }

  async function handleCancelGame() {
    setCancelling(true);
    setCancelError('');

    const { data, error: fnErr } = await supabase.functions.invoke('cancel-game', {
      body: { gameId: id },
    });

    if (fnErr || data?.error) {
      const msg = data?.error ?? fnErr?.message ?? 'Erro ao cancelar a partida';
      setCancelError(msg);
      setCancelling(false);
      return;
    }

    setCancelling(false);
    navigate('/home', { replace: true });
  }

  async function handleLeaveAsOrganizer() {
    // Player self-cancel: enforce 12h window
    if (withinCancelCutoff) {
      setLeaving(false);
      setShowLeaveConfirm(false);
      return;
    }
    setLeaving(true);
    const nextPlayer = players[1];

    if (nextPlayer) {
      const { data: nextProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('name', nextPlayer.name)
        .single();

      if (nextProfile) {
        await supabase.from('games').update({ organizer_id: nextProfile.id }).eq('id', id);
        // Notify the new organizer
        await notify(
          nextProfile.id,
          'organizer_transferred',
          'Você é o novo organizador!',
          `O organizador anterior saiu da partida de ${sportLabel(courtSport)} em ${courtName}. Você agora é o responsável pela partida.`,
          id,
        );
      }
      await supabase.from('game_players').delete().eq('game_id', id).eq('player_name', nextPlayer.name);
    }

    await supabase.from('games').update({ current_players: currentPlayers - 1 }).eq('id', id);

    // Notify remaining players that organizer left
    if (currentUserId) {
      await notifyGamePlayers(
        id!,
        currentUserId,
        'game_left',
        'Organizador saiu da partida',
        `O organizador saiu da partida de ${sportLabel(courtSport)} em ${courtName}. Agora são ${currentPlayers - 1}/${maxPlayers} jogadores.`,
      );
    }

    setLeaving(false);
    navigate('/home', { replace: true });
  }

  async function handleLeaveAsPlayer() {
    if (withinCancelCutoff || !currentUserId) return;
    setLeaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLeaving(false); return; }

    const { data: prof } = await supabase.from('profiles').select('name').eq('id', user.id).single();
    const firstName = prof?.name?.split(' ')[0] ?? 'Jogador';

    const { error } = await supabase.functions.invoke('leave-game', { body: { gameId: id } });
    if (error) { setLeaving(false); setShowPlayerLeaveConfirm(false); return; }

    await notifyGamePlayers(
      id!,
      user.id,
      'game_left',
      'Jogador saiu da partida',
      `${firstName} saiu da partida de ${sportLabel(courtSport)} em ${courtName}. Agora são ${currentPlayers - 1}/${maxPlayers} jogadores.`,
    );

    setLeaving(false);
    navigate('/home', { replace: true });
  }

  async function handleRemovePlayer(index: number, player: Player) {
    if (withinCancelCutoff) return;

    const { data: gp } = await supabase
      .from('game_players')
      .select('player_id')
      .eq('game_id', id)
      .eq('player_name', player.name)
      .single();

    if (!gp?.player_id) return;

    await supabase.functions.invoke('leave-game', { body: { gameId: id, targetPlayerId: gp.player_id } });

    await notifyGamePlayers(
      id!,
      gp.player_id,
      'game_left',
      'Jogador saiu da partida',
      `${player.name.split(' ')[0]} foi removido da partida. Agora são ${currentPlayers - 1}/${maxPlayers} jogadores.`,
    );

    setPlayers(prev => prev.filter((_, pi) => pi !== index));
    setCurrentPlayers(p => p - 1);
  }

  async function handleCircleClick() {
    if (gameStatus === 'completed' || gameStatus === 'expired' || gameStatus === 'pending_results') return;
    if (withinJoinCutoff) return;
    if (isPrivate && !isEnrolled && !isOrganizer) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setJoinError('Você precisa estar logado para entrar.'); return; }
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single();
      const playerName = profile?.name ?? 'Jogador';

      if (gamePayMode === 'full') {
        // Free join — organizer already paid the full court price
        setJoining(true);
        const { error: insertErr } = await supabase.from('game_players').insert({
          game_id: id,
          player_id: user.id,
          player_name: playerName,
          paid: true,
        });
        if (insertErr && insertErr.code !== '23505') {
          setJoinError('Erro ao entrar na partida. Tente novamente.');
          setJoining(false);
          return;
        }
        const newCount = currentPlayers + 1;
        await supabase.from('games').update({ current_players: newCount }).eq('id', id);
        await notifyGamePlayers(
          id!,
          user.id,
          'game_joined',
          'Novo jogador entrou!',
          `${playerName} entrou na partida. Agora são ${newCount}/${maxPlayers} jogadores.`,
        );
        setPlayers(prev => [...prev, { name: playerName, paid: true, isCurrentUser: true }]);
        setCurrentPlayers(newCount);
        setIsEnrolled(true);
        setJoining(false);
      } else {
        // Split — each joiner authorizes a hold for their minimum share
        setJoining(true);
        try {
          await redirectToCheckout({
            gameId: id!,
            playerId: user.id,
            playerName,
            courtName,
            venueName,
            sport: sportLabel(courtSport),
            date,
            time,
            vagaPrice: courtPrice / 10,
            mode: 'join_self',
            captureManual: true,
            payMode: 'split',
          });
        } catch (e: any) {
          setJoinError(e.message);
          setJoining(false);
        }
      }
      return;
    }
    if (isEnrolled || isOrganizer) {
      setShowAddPlayer(true);
    } else {
      setShowJoin(true);
    }
  }

  async function handlePayReservation() {
    if (!currentUserId) return;
    setPayingReservation(true);
    try {
      await redirectToCheckout({
        gameId: id!,
        playerId: currentUserId,
        playerName: organizerName,
        courtName,
        venueName,
        sport: sportLabel(courtSport),
        date,
        time,
        vagaPrice: pricePerPlayer,
        mode: 'pay_reservation',
      });
    } catch (e: any) {
      setJoinError(e.message);
      setPayingReservation(false);
    }
  }

  const spotsLeft = maxPlayers - currentPlayers;

  if (gameUnavailable) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="flex items-center px-5 pt-12 pb-4 border-b border-gray-100 bg-white">
          <button onClick={() => navigate('/home')} className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-2">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {gameUnavailable === 'cancelled' ? 'Partida cancelada' : 'Partida encerrada'}
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              {gameUnavailable === 'cancelled'
                ? 'Esta partida foi cancelada e não está mais disponível.'
                : 'Esta partida não tem mais jogadores ativos e não está mais disponível.'}
            </p>
          </div>
          <button
            onClick={() => navigate('/home')}
            className="mt-4 bg-violet-600 text-white px-6 py-3 rounded-2xl font-semibold text-sm hover:bg-violet-700 transition-colors"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 border-b border-gray-100">
        <button onClick={() => navigate('/home')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-700" />
        </button>
        <button onClick={() => setShowShare(true)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <Share2 className="w-6 h-6 text-gray-700" />
        </button>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
        </div>
      )}

      {!loading && <div className="overflow-y-auto pb-8">
        {/* Pending results banner — organizer action required */}
        {gameStatus === 'pending_results' && isOrganizer && (
          <div className="mx-5 mt-4 bg-orange-50 border border-orange-300 rounded-2xl px-4 py-3 flex items-center gap-3">
            <Zap className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-orange-800">Partida encerrada — registre os dados</p>
              <p className="text-xs text-orange-600 mt-0.5">Você tem até 12h para registrar o MVP. Após isso o XP não será contado.</p>
            </div>
          </div>
        )}

        {/* Pending results banner — player vote required */}
        {gameStatus === 'pending_results' && isEnrolled && !isOrganizer && (
          <div className="mx-5 mt-4 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800">Vote no melhor jogador!</p>
              <p className="text-xs text-amber-600 mt-0.5">Você tem até 12h para votar. O MVP ganha +30 XP.</p>
            </div>
          </div>
        )}

        {/* Pending payment banner — organizer of a gestor-created booking */}
        {isOrganizer && !organizerPaid && pricePerPlayer > 0 && (
          <div className="mx-5 mt-4 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-4">
            <div className="flex items-start gap-3 mb-3">
              <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800">Pagamento pendente</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  O clube reservou este horário para você. Complete o pagamento para confirmar sua vaga. Você tem 2 horas a partir da reserva.
                </p>
              </div>
            </div>
            {joinError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2 border border-red-100">{joinError}</p>
            )}
            <button
              onClick={handlePayReservation}
              disabled={payingReservation}
              className="w-full bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {payingReservation
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Aguarde...</>
                : <>Pagar R$ {calcFees(pricePerPlayer).total.toFixed(2)} e confirmar vaga</>}
            </button>
          </div>
        )}

        {/* Enrolled banner */}
        {isEnrolled && gameStatus === 'scheduled' && (
          <div className="mx-5 mt-4 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-violet-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-violet-700">Você está inscrito nesta partida</p>
          </div>
        )}

        {/* Confirmed booking banner */}
        {isEnrolled && gameStatus === 'confirmed_booking' && (
          <div className="mx-5 mt-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-green-700">Reserva confirmada!</p>
              {withinCancelCutoff && (
                <p className="text-xs text-green-600 mt-0.5">Faltam menos de {PLAYER_CANCEL_CUTOFF_HOURS}h — cancelamento apenas pelo clube.</p>
              )}
            </div>
          </div>
        )}

        {/* Match info card */}
        <div className="mx-5 mt-4 border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start gap-3 pb-4 border-b border-gray-100">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900">{sportLabel(courtSport)}</h2>
              {date && (
                <p className="text-sm text-gray-500 mt-1 capitalize">
                  {formatDate(date)}{time ? `, ${time}` : ''}{endTime ? ` – ${endTime}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 text-center">
            <div>
              <p className="text-xs text-gray-400 mb-1">Gênero</p>
              <p className="text-sm font-bold text-gray-900">Todos</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Nível</p>
              <p className="text-sm font-bold text-gray-900">Aberto</p>
            </div>
            {(!isPrivate || pricePerPlayer > 0) && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Valor</p>
                <p className="text-sm font-bold text-gray-900">R$ {pricePerPlayer}</p>
              </div>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div className="mx-5 mt-3 flex gap-2 flex-wrap">
          {isPrivate && (
            <div className="flex items-center gap-1.5 bg-gray-900 rounded-2xl px-3 py-2">
              <Lock className="w-3.5 h-3.5 text-white" />
              <span className="text-xs font-bold text-white">Partida Privada</span>
            </div>
          )}
          {gameStatus === 'scheduled' && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs font-bold text-amber-700">{isPrivate ? 'Agendada' : 'Aguardando jogadores'}</span>
            </div>
          )}
          {gameStatus === 'confirmed_booking' && (
            <div className="flex items-center gap-1.5 bg-green-50 border border-green-300 rounded-2xl px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs font-bold text-green-700">Reserva confirmada</span>
            </div>
          )}
          {gameStatus === 'pending_results' && (
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-300 rounded-2xl px-3 py-2">
              <Zap className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-xs font-bold text-orange-700">Aguardando dados</span>
            </div>
          )}
          {gameStatus === 'completed' && (
            <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-2xl px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs font-bold text-gray-600">Encerrada</span>
            </div>
          )}
          {gameStatus === 'expired' && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-2xl px-3 py-2">
              <X className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-bold text-red-600">Expirada</span>
            </div>
          )}
        </div>

        {/* Players section */}
        <div className="mx-5 mt-3 border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-gray-900 text-base">Jogadores</h3>
            <div className="flex items-center gap-2">
              {spotsLeft > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-full">
                  {spotsLeft} {spotsLeft === 1 ? 'vaga' : 'vagas'}
                </span>
              )}
              <span className="text-sm text-gray-400">{currentPlayers}/{maxPlayers}</span>
            </div>
          </div>

          <div className={`grid gap-3 ${maxPlayers <= 4 ? 'grid-cols-4' : maxPlayers <= 8 ? 'grid-cols-4' : 'grid-cols-5'}`}>
            {Array.from({ length: maxPlayers }).map((_, i) => {
              const player = players[i];
              const filled = i < currentPlayers;
              const canRemove = isOrganizer && filled && player && !player.isOrganizer && !withinCancelCutoff;
              const canSelfLeave = !isOrganizer && filled && player?.isCurrentUser && !withinCancelCutoff && (gameStatus === 'scheduled' || gameStatus === 'confirmed_booking');
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="relative">
                    {filled && player ? (
                      <>
                        <div
                          onClick={() => player.isOrganizer && isOrganizer && setShowLeaveConfirm(true)}
                          className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${player.paid ? 'bg-violet-600' : 'bg-gray-400'} ${player.isOrganizer && isOrganizer ? 'cursor-pointer ring-2 ring-offset-1 ring-violet-300' : ''}`}
                        >
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        {/* Organizer crown */}
                        {player.isOrganizer && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                            <Crown className="w-3 h-3 text-yellow-900" />
                          </div>
                        )}
                        {/* Remove button for organizer */}
                        {canRemove && (
                          <button
                            onClick={() => handleRemovePlayer(i, player)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        )}
                        {/* Self-leave button for enrolled non-organizer */}
                        {canSelfLeave && (
                          <button
                            onClick={() => setShowPlayerLeaveConfirm(true)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        )}
                      </>
                    ) : filled ? (
                      <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        ?
                      </div>
                    ) : (
                      <button
                        onClick={handleCircleClick}
                        className="w-12 h-12 rounded-full border-2 border-dashed border-violet-300 flex items-center justify-center transition-colors hover:border-violet-500 hover:bg-violet-50 active:bg-violet-100"
                      >
                        <span className="text-xl font-light text-violet-400">+</span>
                      </button>
                    )}
                  </div>
                  {filled && player ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs text-gray-700 font-semibold text-center leading-tight w-14 truncate">
                        {player.name.split(' ')[0]}
                      </span>
                      {player.isOrganizer ? (
                        <span className="text-[10px] font-semibold text-yellow-600">Org.</span>
                      ) : (
                        <span className={`text-[10px] font-semibold ${player.paid ? 'text-green-600' : 'text-amber-500'}`}>
                          {player.paid ? 'Pago' : 'Pendente'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-300">vaga</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mx-5 mt-3 flex gap-3">
          <button
            onClick={() => navigate('/home')}
            className="flex-1 flex items-center justify-center gap-2 border-2 border-gray-200 rounded-2xl py-3.5 font-semibold text-gray-700 text-sm hover:bg-gray-50 transition-colors"
          >
            <Calendar className="w-5 h-5" />
            Calendário
          </button>
          <button
            onClick={() => navigate('/community')}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 text-white rounded-2xl py-3.5 font-semibold text-sm hover:bg-violet-700 transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            Chat
          </button>
        </div>

        {/* Venue card */}
        {(venueName || courtName) && (
          <div className="mx-5 mt-3 border border-gray-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <MapPin className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{venueName}</p>
              <p className="text-xs text-gray-500 truncate">{courtName}</p>
              <span className="text-xs text-violet-600 font-semibold">Mais informações →</span>
            </div>
            <button
              onClick={() => setShowShare(true)}
              className="w-10 h-10 bg-violet-600 rounded-full flex items-center justify-center flex-shrink-0"
            >
              <Share2 className="w-4 h-4 text-white" />
            </button>
          </div>
        )}

        {/* Cancel game — organizer only */}
        {isOrganizer && (
          <div className="mx-5 mt-3">
            {withinCancelCutoff ? (
              <div className="w-full flex items-center gap-3 border-2 border-gray-200 rounded-2xl px-4 py-3.5 bg-gray-50">
                <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-500">Cancelamento bloqueado</p>
                  <p className="text-xs text-gray-400">Faltam menos de {PLAYER_CANCEL_CUTOFF_HOURS}h. Contate o clube.</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full flex items-center justify-center gap-2 border-2 border-red-200 text-red-500 rounded-2xl py-3.5 font-semibold text-sm hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Cancelar partida
              </button>
            )}
          </div>
        )}

        {/* Invite CTA */}
        {spotsLeft > 0 && !isPrivate && (
          <div className="mx-5 mt-3 bg-gradient-to-r from-violet-500 to-violet-600 rounded-2xl p-5">
            <p className="font-bold text-white text-base mb-1">Divulgue sua partida!</p>
            <p className="text-sm text-violet-100 mb-4">
              Faltam {spotsLeft} {spotsLeft === 1 ? 'jogador' : 'jogadores'} para completar
            </p>
            <button
              onClick={() => setShowShare(true)}
              className="w-full bg-white text-violet-600 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-violet-50 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Compartilhar partida
            </button>
          </div>
        )}

        {/* Private game — share link for organizer */}
        {isPrivate && isOrganizer && spotsLeft > 0 && (
          <div className="mx-5 mt-3 bg-gray-900 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-gray-400" />
              <p className="font-bold text-white text-base">Partida privada</p>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Compartilhe o link com seus jogadores para que eles possam pagar a parte deles.
            </p>
            <button
              onClick={() => setShowShare(true)}
              className="w-full bg-white text-gray-900 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Compartilhar link
            </button>
          </div>
        )}
      </div>}

      {/* Cancel game confirmation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => setShowCancelConfirm(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-900 text-xl mb-2">Cancelar partida?</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-3">
                Ao cancelar, <strong className="text-gray-700">todos os jogadores inscritos serão notificados</strong> e receberão o estorno integral de acordo com as políticas do JoggaHub, em até 10 dias úteis no método de pagamento utilizado.
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                A vaga será liberada no calendário. Esta ação não pode ser desfeita.
              </p>
            </div>
            {cancelError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100 text-center">{cancelError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelError(''); }}
                className="flex-1 py-4 rounded-2xl border-2 border-gray-200 font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleCancelGame}
                disabled={cancelling}
                className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {cancelling ? <><Loader2 className="w-4 h-4 animate-spin" /> Cancelando...</> : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave as player confirmation */}
      {showPlayerLeaveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => setShowPlayerLeaveConfirm(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <div className="flex flex-col items-center text-center mb-6">
              {withinCancelCutoff ? (
                <>
                  <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <Shield className="w-7 h-7 text-red-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-xl mb-2">Cancelamento bloqueado</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Faltam menos de <strong className="text-gray-700">{PLAYER_CANCEL_CUTOFF_HOURS}h</strong> para o início da partida. O cancelamento não é permitido nesse período.
                  </p>
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                    Para sair, entre em contato diretamente com o organizador ou clube.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <X className="w-7 h-7 text-red-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-xl mb-2">Sair da partida?</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Você será removido da partida e os outros jogadores serão notificados.
                  </p>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPlayerLeaveConfirm(false)}
                className="flex-1 py-4 rounded-2xl border-2 border-gray-200 font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Voltar
              </button>
              {!withinCancelCutoff && (
                <button
                  onClick={handleLeaveAsPlayer}
                  disabled={leaving}
                  className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {leaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saindo...</> : 'Confirmar saída'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leave as organizer confirmation */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => setShowLeaveConfirm(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <div className="flex flex-col items-center text-center mb-6">
              {withinCancelCutoff ? (
                <>
                  <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <Shield className="w-7 h-7 text-red-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-xl mb-2">Cancelamento bloqueado</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Faltam menos de <strong className="text-gray-700">{PLAYER_CANCEL_CUTOFF_HOURS}h</strong> para o início da partida. O cancelamento por jogadores não é permitido nesse período.
                  </p>
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                    Para cancelar, entre em contato diretamente com o clube.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                    <Crown className="w-7 h-7 text-amber-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-xl mb-2">Sair da partida?</h3>
                  <p className="text-sm text-gray-500 leading-relaxed mb-3">
                    Você será removido da partida e{' '}
                    {players[1]
                      ? <><strong className="text-gray-700">{players[1].name.split(' ')[0]}</strong> assumirá como novo organizador.</>
                      : 'a partida continuará sem organizador.'}
                  </p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    O estorno da sua parte será processado de acordo com as políticas do JoggaHub.
                  </p>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-4 rounded-2xl border-2 border-gray-200 font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Voltar
              </button>
              {!withinCancelCutoff && (
                <button
                  onClick={handleLeaveAsOrganizer}
                  disabled={leaving}
                  className="flex-1 py-4 rounded-2xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {leaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saindo...</> : 'Confirmar saída'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add player bottom sheet */}
      {showAddPlayer && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => { setShowAddPlayer(false); setSearchQuery(''); setSearchResults([]); }}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-xl">Adicionar jogador</h3>
              <button onClick={() => { setShowAddPlayer(false); setSearchQuery(''); setSearchResults([]); }} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Search input */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-4 py-3 mb-4">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Buscar por nome..."
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                className="flex-1 bg-transparent outline-none text-gray-800 text-sm"
              />
              {searching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              {searchQuery && !searching && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }}>
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="overflow-y-auto flex-1">
              {!searchQuery && (
                <p className="text-sm text-gray-400 text-center py-8">Digite o nome do jogador para buscar</p>
              )}
              {searchQuery && !searching && searchResults.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum jogador encontrado</p>
              )}
              {searchResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPlayer(p)}
                  className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-violet-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                    {p.phone && <p className="text-xs text-gray-400">{p.phone}</p>}
                  </div>
                  <span className="text-xs text-violet-600 font-semibold">Selecionar</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Join bottom sheet */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => setShowJoin(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <h3 className="font-bold text-gray-900 text-xl mb-1">Entrar na partida</h3>
            <p className="text-sm text-gray-500 mb-6">
              {courtName && venueName ? `${sportLabel(courtSport)} · ${venueName}` : 'Partida Aberta'}
            </p>

            {/* Summary */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Data</span>
                <span className="font-semibold text-gray-900 capitalize">{date ? formatDate(date) : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Horário</span>
                <span className="font-semibold text-gray-900">{time}{endTime ? ` – ${endTime}` : ''}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Vagas restantes</span>
                <span className="font-semibold text-gray-900">{spotsLeft - 1} após sua entrada</span>
              </div>
              <div className="border-t border-gray-200 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Valor da vaga</span>
                  <span className="font-semibold text-gray-900">R$ {pricePerPlayer.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Taxa de serviço (15%)</span>
                  <span className="font-semibold text-gray-900">R$ {(pricePerPlayer * 0.15).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-gray-100">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="text-xl font-bold text-violet-600">R$ {(pricePerPlayer * 1.15).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {joinError && (
              <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 mb-4 border border-red-100">{joinError}</p>
            )}

            {withinJoinCutoff ? (
              <div className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-500 py-4 rounded-2xl font-semibold text-sm">
                <Shield className="w-4 h-4 flex-shrink-0" />
                Entradas encerradas (menos de 15 min)
              </div>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold text-base hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {joining
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Entrando...</>
                  : <><CheckCircle className="w-5 h-5" /> Pagar minha parte · R$ {(pricePerPlayer * 1.15).toFixed(2)}</>}
              </button>
            )}
            <button onClick={() => setShowJoin(false)} className="w-full mt-3 py-3 text-sm text-gray-500 font-semibold">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Share bottom sheet */}
      {showShare && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => setShowShare(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <h3 className="font-bold text-gray-900 text-lg mb-5">Compartilhar partida</h3>

            {/* Message preview */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Mensagem gerada</p>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {buildShareMessage()}
              </pre>
            </div>

            <div className="space-y-3">
              {/* WhatsApp */}
              <button
                onClick={handleWhatsApp}
                className="w-full bg-green-500 text-white rounded-2xl py-4 font-semibold flex items-center justify-center gap-3 hover:bg-green-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.121-.011-.241-.017-.361-.017-.407 0-.823.063-1.22.192l-.016.005a9.87 9.87 0 00-4.599 3.317 9.87 9.87 0 00-1.96 5.985c0 2.64 1.03 5.122 2.898 6.988a9.825 9.825 0 006.994 2.893c5.45-.003 9.884-4.437 9.884-9.885a9.86 9.86 0 00-2.893-6.994z"/>
                </svg>
                Compartilhar via WhatsApp
              </button>

              {/* Copy */}
              <button
                onClick={handleCopy}
                className="w-full bg-gray-100 text-gray-800 rounded-2xl py-4 font-semibold flex items-center justify-center gap-3 hover:bg-gray-200 transition-colors"
              >
                {copied
                  ? <><CheckCircle className="w-5 h-5 text-green-600" /> Copiado!</>
                  : <><Copy className="w-5 h-5" /> Copiar mensagem</>}
              </button>
            </div>

            <button
              onClick={() => setShowShare(false)}
              className="w-full mt-3 py-3 text-sm text-gray-500 font-semibold"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
