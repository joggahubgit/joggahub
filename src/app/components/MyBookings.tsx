import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Calendar, MapPin, Clock, XCircle, CheckCircle,
  AlertCircle, Loader2, Users, Trophy, Shield, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getMinPlayersForSport, PLAYER_CANCEL_CUTOFF_HOURS } from '@/app/lib/gameConfig';

// ── Types ──────────────────────────────────────────────────────────────────

type BookingType = 'slot' | 'game_organizer' | 'game_player';

interface Item {
  id: string;           // booking.id or game.id
  refId?: string;       // game_players.game_id (for player type)
  type: BookingType;
  courtName: string;
  venueName: string;
  startTime: string;
  createdAt: string;
  endTime: string | null;
  price: number;
  paymentStatus: string;
  status: string;       // slot: 'confirmed'|'cancelled' / game: lifecycle status
  currentPlayers?: number;
  maxPlayers?: number;
  withinCancelCutoff?: boolean; // true = within 12h of start, player cannot self-cancel
}

// ── Main component ─────────────────────────────────────────────────────────

export default function MyBookings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<Item | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(
    (location.state as { highlightId?: string } | null)?.highlightId ?? null
  );
  const [historyPage, setHistoryPage] = useState(1);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const HISTORY_PAGE_SIZE = 10;

  useEffect(() => {
    if (!user) return;
    fetchAll();
  }, [user?.id]);

  // Scroll to & highlight the target booking once items are loaded
  useEffect(() => {
    if (!highlightId || loading) return;
    const el = cardRefs.current[highlightId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => setHighlightId(null), 2000);
      return () => clearTimeout(t);
    }
  }, [highlightId, loading]);

  async function fetchAll() {
    if (!user) return;
    setLoading(true);

    const [slotItems, gameItems] = await Promise.all([
      fetchSlotBookings(user.id),
      fetchGameItems(user.id),
    ]);

    const merged = [...slotItems, ...gameItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setItems(merged);
    setHistoryPage(1);
    setLoading(false);
  }

  // ── Slot bookings ────────────────────────────────────────────────────────

  async function fetchSlotBookings(userId: string): Promise<Item[]> {
    const { data: rawBookings } = await supabase
      .from('bookings')
      .select('id, slot_id, total_price, payment_status, status, created_at')
      .eq('created_by', userId)
      .not('slot_id', 'is', null);

    if (!rawBookings?.length) return [];

    // Exclude bookings that belong to a private game (shown separately as game_organizer entries)
    const rawBookingIds = rawBookings.map(b => b.id);
    const { data: privateGameBookings } = await supabase
      .from('games')
      .select('booking_id')
      .in('booking_id', rawBookingIds)
      .not('booking_id', 'is', null);
    const privateBookingIdSet = new Set((privateGameBookings ?? []).map(g => g.booking_id));
    const bookings = rawBookings.filter(b => !privateBookingIdSet.has(b.id));

    if (!bookings.length) return [];

    const slotIds = bookings.map(b => b.slot_id);
    const { data: slots } = await supabase
      .from('slots').select('id, start_time, end_time, court_id').in('id', slotIds);
    const courtIds = [...new Set((slots ?? []).map(s => s.court_id).filter(Boolean))];
    const { data: courts } = await supabase
      .from('courts').select('id, name, venue_id').in('id', courtIds);
    const venueIds = [...new Set((courts ?? []).map(c => c.venue_id).filter(Boolean))];
    const { data: venues } = await supabase
      .from('venues').select('id, name').in('id', venueIds);

    const slotMap = Object.fromEntries((slots ?? []).map(s => [s.id, s]));
    const courtMap = Object.fromEntries((courts ?? []).map(c => [c.id, c]));
    const venueMap = Object.fromEntries((venues ?? []).map(v => [v.id, v]));

    return bookings
      .filter(b => slotMap[b.slot_id])
      .map(b => {
        const slot = slotMap[b.slot_id];
        const court = courtMap[slot.court_id];
        const venue = court ? venueMap[court.venue_id] : null;
        const msUntilStart = new Date(slot.start_time).getTime() - Date.now();
        const withinCancelCutoff = msUntilStart < PLAYER_CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;
        return {
          id: b.id,
          type: 'slot' as BookingType,
          courtName: court?.name ?? 'Quadra',
          venueName: venue?.name ?? '',
          startTime: slot.start_time,
          createdAt: b.created_at ?? slot.start_time,
          endTime: slot.end_time ?? null,
          price: b.total_price ?? 0,
          paymentStatus: b.payment_status ?? 'pending',
          status: b.status,
          withinCancelCutoff,
        };
      });
  }

  // ── Open games (organizer + player) ──────────────────────────────────────

  async function fetchGameItems(userId: string): Promise<Item[]> {
    const gameFields = 'id, court_id, slot_id, scheduled_at, scheduled_end_at, price_per_player, court_price, max_players, current_players, is_open, status, sport_type, booking_id, created_at';

    const [{ data: asOrganizer }, { data: asPlayerRows }] = await Promise.all([
      supabase.from('games').select(gameFields).eq('organizer_id', userId),
      supabase.from('game_players').select('game_id, paid').eq('player_id', userId),
    ]);

    const organizerGameIds = new Set((asOrganizer ?? []).map(g => g.id));
    const playerGameIds = (asPlayerRows ?? [])
      .map(p => p.game_id)
      .filter(id => !organizerGameIds.has(id));


    let playerGames: any[] = [];
    if (playerGameIds.length > 0) {
      const { data } = await supabase.from('games').select(gameFields).in('id', playerGameIds);
      playerGames = data ?? [];
    }

    const allGames = [
      ...(asOrganizer ?? []).map(g => ({ ...g, _role: 'organizer' })),
      ...playerGames.map(g => ({ ...g, _role: 'player' })),
    ];

    if (!allGames.length) return [];

    const courtIds = [...new Set(allGames.map(g => g.court_id).filter(Boolean))];
    const { data: courts } = await supabase
      .from('courts').select('id, name, venue_id, sport_type').in('id', courtIds);
    const venueIds = [...new Set((courts ?? []).map(c => c.venue_id).filter(Boolean))];
    const { data: venues } = await supabase
      .from('venues').select('id, name').in('id', venueIds);

    const courtMap = Object.fromEntries((courts ?? []).map(c => [c.id, c]));
    const venueMap = Object.fromEntries((venues ?? []).map(v => [v.id, v]));
    const playerPaidMap = Object.fromEntries((asPlayerRows ?? []).map(p => [p.game_id, p.paid]));

    // Collect games that need retroactive DB updates
    const toConfirm: string[] = [];
    const toExpire: string[] = [];

    const items = allGames.map(g => {
      const court = courtMap[g.court_id];
      const venue = court ? venueMap[court.venue_id] : null;
      const isPaid = g._role === 'organizer' ? true : (playerPaidMap[g.id] ?? false);

      // Use court sport_type as authoritative (game.sport_type may default to 'football')
      const sportType = court?.sport_type ?? g.sport_type ?? '';

      // Start with what the DB says — only override for pre-fix 'scheduled' rows
      let gameStatus: string = g.status ?? 'scheduled';
      const isPrivateGame = !g.is_open && !!g.booking_id;
      if (gameStatus === 'scheduled') {
        if (!g.is_open && !isPrivateGame) {
          // Legacy: game was cancelled/expired before status field was properly updated
          gameStatus = 'expired';
          toExpire.push(g.id);
        } else if ((g.current_players ?? 1) >= getMinPlayersForSport(sportType)) {
          gameStatus = 'confirmed_booking';
          toConfirm.push(g.id);
        }
      }

      // 12h cancel cutoff based on scheduled_at (= slot start_time)
      const msUntilStart = g.scheduled_at
        ? new Date(g.scheduled_at).getTime() - Date.now()
        : Infinity;
      const withinCancelCutoff = msUntilStart < PLAYER_CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;

      return {
        id: g.id,
        type: (g._role === 'organizer' ? 'game_organizer' : 'game_player') as BookingType,
        courtName: court?.name ?? 'Quadra',
        venueName: venue?.name ?? '',
        startTime: g.scheduled_at,
        createdAt: g.created_at ?? g.scheduled_at,
        endTime: null,
        price: (g._role === 'organizer' && !g.is_open && !(g.price_per_player > 0))
          ? (g.court_price ?? 0)
          : (g.price_per_player ?? 0),
        paymentStatus: isPaid ? 'paid' : 'pending',
        status: gameStatus,
        currentPlayers: g.current_players,
        maxPlayers: g.max_players,
        withinCancelCutoff,
      };
    });

    // Fire-and-forget retroactive DB updates
    if (toConfirm.length > 0) {
      supabase.from('games')
        .update({ status: 'confirmed_booking' })
        .in('id', toConfirm)
        .eq('status', 'scheduled')
        .then(() => {});
    }
    if (toExpire.length > 0) {
      supabase.from('games')
        .update({ status: 'expired', is_open: false })
        .in('id', toExpire)
        .eq('status', 'scheduled')
        .then(() => {});
    }

    return items;
  }

  // ── Cancel ───────────────────────────────────────────────────────────────

  function openCancel(item: Item) {
    setCancelTarget(item);
    setCancelBusy(false);
    setCancelDone(false);
    setCancelError('');
  }

  function closeCancel() {
    setCancelTarget(null);
    setCancelDone(false);
    setCancelError('');
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError('');

    let fnName: string;
    let body: Record<string, string>;

    if (cancelTarget.type === 'slot') {
      fnName = 'cancel-booking';
      body = { bookingId: cancelTarget.id };
    } else {
      fnName = 'cancel-game';
      body = { gameId: cancelTarget.id };
    }

    const { data, error: fnErr } = await supabase.functions.invoke(fnName, { body });
    if (fnErr) {
      const parsed = await (fnErr as any).context?.json?.().catch(() => null);
      setCancelError(parsed?.error ?? fnErr.message ?? 'Erro ao cancelar');
      setCancelBusy(false);
      return;
    }
    if (data?.error) {
      setCancelError(data.error);
      setCancelBusy(false);
      return;
    }

    setCancelBusy(false);
    setCancelDone(true);
    fetchAll();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  const now = new Date();

  function isUpcoming(item: Item) {
    const activeStatuses = ['confirmed', 'open', 'scheduled', 'confirmed_booking'];
    return activeStatuses.includes(item.status) && new Date(item.startTime) >= now;
  }

  function canCancel(item: Item) {
    if (item.type === 'game_player') return false; // player can't cancel whole game
    if (item.type === 'game_organizer') return false; // organizer cancels from the game details page instead
    if (!isUpcoming(item)) return false;
    if (item.withinCancelCutoff) return false; // within 12h — only club can cancel
    return true;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function formatTime(iso: string) {
    return iso.substring(11, 16);
  }

  const upcoming = items.filter(isUpcoming);
  const past = items.filter(i => !isUpcoming(i));
  const totalHistoryPages = Math.ceil(past.length / HISTORY_PAGE_SIZE);
  const pagedPast = past.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  // ── Sub-components ────────────────────────────────────────────────────────

  function TypeBadge({ item }: { item: Item }) {
    if (item.type === 'slot') return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
        <Calendar className="w-3 h-3" /> Reserva
      </span>
    );
    if (item.type === 'game_organizer') return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
        <Trophy className="w-3 h-3" /> Organizador
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
        <Users className="w-3 h-3" /> Jogador
      </span>
    );
  }

  function StatusChip({ item }: { item: Item }) {
    // Game lifecycle statuses take precedence for game items
    if (item.type !== 'slot') {
      if (item.status === 'confirmed_booking') return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">Confirmada</span>
      );
      if (item.status === 'pending_results') return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">Aguardando dados</span>
      );
      if (item.status === 'completed') return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">Encerrada</span>
      );
      if (item.status === 'expired') return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-500">Expirada</span>
      );
      if (item.status === 'cancelled' || item.status === 'closed') return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">Cancelada</span>
      );
      // scheduled — show player count as status
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Agendada</span>
      );
    }

    // Slot booking statuses
    if (item.status === 'cancelled') return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">Cancelada</span>
    );
    if (item.paymentStatus === 'paid') return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">Pago</span>
    );
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Pendente</span>
    );
  }

  function ItemCard({ item }: { item: Item }) {
    const dimmed = item.status === 'cancelled' || item.status === 'closed';
    const topColor = dimmed ? 'bg-gray-300' : item.type === 'slot' ? 'bg-violet-600' : item.type === 'game_organizer' ? 'bg-orange-500' : 'bg-blue-500';
    const clickable = item.type !== 'slot';
    const isHighlighted = highlightId === item.id;

    return (
      <div
        ref={el => { cardRefs.current[item.id] = el; }}
        className={`bg-white rounded-2xl border overflow-hidden transition-all duration-300 ${dimmed ? 'border-gray-100 opacity-60' : isHighlighted ? 'border-violet-400 ring-2 ring-violet-300 shadow-lg' : 'border-gray-200'} ${clickable ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''}`}
        onClick={clickable ? () => navigate(`/open-game/${item.id}`) : undefined}
      >
        <div className={`h-1 w-full ${topColor}`} />
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <p className="font-bold text-gray-900 truncate">{item.courtName}</p>
                <TypeBadge item={item} />
              </div>
              {item.venueName && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />{item.venueName}
                </p>
              )}
            </div>
            <StatusChip item={item} />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-violet-500 flex-shrink-0" />
              <span className="capitalize">{formatDate(item.startTime)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-violet-500 flex-shrink-0" />
              <span>{formatTime(item.startTime)}{item.endTime ? ` – ${formatTime(item.endTime)}` : ''}</span>
            </div>
            {item.maxPlayers && (
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-violet-500 flex-shrink-0" />
                <span>{item.currentPlayers}/{item.maxPlayers} jogadores</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <span className="text-sm font-bold text-violet-600">R$ {item.price.toFixed(2)}</span>
            {canCancel(item) ? (
              <button
                onClick={e => { e.stopPropagation(); openCancel(item); }}
                className="flex items-center gap-1.5 text-sm text-red-500 font-semibold hover:text-red-700 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Cancelar
              </button>
            ) : item.withinCancelCutoff && isUpcoming(item) && item.type === 'game_organizer' ? (
              <span className="flex items-center gap-1 text-[10px] text-gray-400 font-semibold">
                <Shield className="w-3 h-3" /> Contate o clube
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Minhas Reservas</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="text-5xl mb-4">📋</div>
          <p className="font-semibold text-gray-700 text-lg">Nenhuma reserva ainda</p>
          <p className="text-sm text-gray-400 mt-1">Explore os clubes e agende seu horário!</p>
          <button onClick={() => navigate('/find-courts')} className="mt-6 bg-violet-600 text-white px-6 py-3 rounded-xl font-semibold">
            Encontrar quadras
          </button>
        </div>
      ) : (
        <div className="px-5 py-5 space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Próximas</h2>
              <div className="space-y-3">
                {upcoming.map(item => <ItemCard key={`${item.type}-${item.id}`} item={item} />)}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Histórico</h2>
                {totalHistoryPages > 1 && (
                  <span className="text-xs text-gray-400">{past.length} reservas</span>
                )}
              </div>
              <div className="space-y-3">
                {pagedPast.map(item => <ItemCard key={`${item.type}-${item.id}`} item={item} />)}
              </div>
              {totalHistoryPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="text-sm font-semibold text-gray-500">
                    {historyPage} / {totalHistoryPages}
                  </span>
                  <button
                    onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                    disabled={historyPage === totalHistoryPages}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors"
                  >
                    Próxima <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Cancel modal */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl">
            <div className="p-6 space-y-4">
              {cancelDone ? (
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      {cancelTarget.type === 'game_organizer' ? 'Partida cancelada' : 'Reserva cancelada'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">Você receberá uma confirmação em breve.</p>
                  </div>
                  <button onClick={closeCancel} className="w-full bg-gray-900 text-white py-3.5 rounded-2xl font-bold">
                    Fechar
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      {cancelTarget.type === 'game_organizer' ? 'Cancelar partida' : 'Cancelar reserva'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {cancelTarget.courtName} · {formatDate(cancelTarget.startTime)} às {formatTime(cancelTarget.startTime)}
                    </p>
                  </div>

                  {cancelTarget.type === 'game_organizer' && (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">
                        Isso vai cancelar a partida para <strong>todos os jogadores</strong> inscritos e iniciar o processo de reembolso automaticamente.
                      </p>
                    </div>
                  )}

                  {cancelTarget.type === 'slot' && cancelTarget.paymentStatus === 'paid' && (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">
                        Esta reserva foi <strong>paga</strong>. O reembolso de R$ {cancelTarget.price.toFixed(2)} será processado automaticamente via Stripe.
                      </p>
                    </div>
                  )}

                  {cancelError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{cancelError}</p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button onClick={closeCancel} disabled={cancelBusy}
                      className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 disabled:opacity-50">
                      Voltar
                    </button>
                    <button onClick={handleConfirmCancel} disabled={cancelBusy}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {cancelBusy
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Cancelando...</>
                        : 'Confirmar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
