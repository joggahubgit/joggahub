import { useState, useEffect, useRef } from 'react';
import {
  X, Ban, CheckCircle, AlertCircle, DollarSign, Search,
  Phone, Loader2, Trash2, CalendarCheck, Unlock, ChevronLeft,
  XCircle, Bell, CreditCard, Users, Lock, ShieldCheck, Hourglass, Star,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface Booking {
  id: string;
  payment_status: string;
  total_price: number;
  profiles: { name: string; phone: string } | null;
}

interface Slot {
  id: string;
  court_id: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  price_override: number | null;
  booking?: Booking | null;
}

interface Profile {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  slot: Slot;
  courtName: string;
  onClose: () => void;
  onRefresh: () => void;
}

type View = 'main' | 'reserve' | 'cancel' | 'delete_slot';

function formatDateTime(iso: string) {
  // Parse date part directly to avoid timezone shifts on date display
  const [datePart] = iso.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const d = new Date(year, month - 1, day); // local midnight, no UTC conversion
  return {
    date: d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
    time: iso.substring(11, 16), // raw string — consistent with calendar grid
  };
}

function formatEndTime(iso: string) {
  return iso.substring(11, 16);
}

function getStatus(slot: Slot): 'available' | 'booked' | 'blocked' {
  if (slot.booking) return 'booked';
  if (!slot.is_available) return 'blocked';
  return 'available';
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function GameStatusBadge({ status }: { status: string }) {
  if (status === 'confirmed_booking') return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
      <ShieldCheck className="w-3 h-3" /> Confirmada
    </span>
  );
  if (status === 'pending_results') return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
      <Hourglass className="w-3 h-3" /> Aguardando resultados
    </span>
  );
  if (status === 'completed') return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      <Star className="w-3 h-3" /> Encerrada
    </span>
  );
  if (status === 'cancelled') return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
      <XCircle className="w-3 h-3" /> Cancelada
    </span>
  );
  // scheduled / default
  return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      <Hourglass className="w-3 h-3" /> Aguardando jogadores
    </span>
  );
}

export function SlotModal({ slot, courtName, onClose, onRefresh }: Props) {
  const [view, setView] = useState<View>('main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelDone, setCancelDone] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [stripeRefunded, setStripeRefunded] = useState(false);

  // Linked game (private bookings created by player have an associated game)
  const [linkedGame, setLinkedGame] = useState<{
    id: string; status: string; current_players: number;
    max_players: number; price_per_player: number; organizer_id: string;
  } | null>(null);
  const [gamePlayers, setGamePlayers] = useState<{ player_id: string; player_name: string; paid: boolean }[]>([]);
  const [gameLoading, setGameLoading] = useState(false);

  // Reserve flow
  const [reserveType, setReserveType] = useState<'private' | 'open'>('private');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [reservePrice, setReservePrice] = useState(String(slot.price_override ?? ''));
  const paymentStatus = 'pending' as const;
  // Open game fields
  const maxPlayers = 18;
  const [pricePerPlayer, setPricePerPlayer] = useState(String(slot.price_override ?? ''));
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = getStatus(slot);
  const { date, time } = formatDateTime(slot.start_time);
  const endTime = formatEndTime(slot.end_time);
  const isPaid = slot.booking?.payment_status === 'paid';

  useEffect(() => {
    if (!slot.booking?.id) return;
    setGameLoading(true);
    supabase
      .from('games')
      .select('id, status, current_players, max_players, price_per_player, organizer_id')
      .eq('booking_id', slot.booking.id)
      .maybeSingle()
      .then(async ({ data: g }) => {
        if (!g) { setGameLoading(false); return; }
        setLinkedGame(g);
        const { data: gp } = await supabase
          .from('game_players')
          .select('player_id, player_name, paid')
          .eq('game_id', g.id)
          .order('id');
        setGamePlayers(gp ?? []);
        setGameLoading(false);
      });
  }, [slot.booking?.id]);

  useEffect(() => {
    if (search.length < 2) { setSearchResults([]); return; }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, name, phone')
        .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(8);
      setSearchResults(data ?? []);
      setSearching(false);
    }, 300);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [search]);

  async function handleBlock() {
    setBusy(true); setError('');
    const { error: e } = await supabase.from('slots').update({ is_available: false }).eq('id', slot.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onRefresh(); onClose();
  }

  async function handleUnblock() {
    setBusy(true); setError('');
    const { error: e } = await supabase.from('slots').update({ is_available: true }).eq('id', slot.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onRefresh(); onClose();
  }

  async function handleConfirmPayment() {
    if (!slot.booking) return;
    setBusy(true); setError('');
    const { error: e } = await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', slot.booking.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onRefresh(); onClose();
  }

  async function handleReserve() {
    setBusy(true); setError('');

    let body: Record<string, unknown>;

    if (reserveType === 'private') {
      if (!selectedUser) { setError('Selecione um jogador.'); setBusy(false); return; }
      body = {
        type: 'private',
        slotId: slot.id,
        userId: selectedUser.id,
        price: parseFloat(reservePrice) || 0,
        paymentStatus,
      };
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Sessão expirada. Faça login novamente.'); setBusy(false); return; }
      body = {
        type: 'open',
        slotId: slot.id,
        organizerId: user.id,
        maxPlayers,
        pricePerPlayer: parseFloat(pricePerPlayer) || 0,
      };
    }

    const { error: fnErr } = await supabase.functions.invoke('create-manual-booking', { body });
    setBusy(false);
    if (fnErr) {
      const parsed = await (fnErr as any).context?.json?.().catch(() => null);
      setError(parsed?.error ?? fnErr.message ?? 'Erro ao criar reserva');
      return;
    }
    onRefresh(); onClose();
  }

  async function handleDeleteSlot() {
    setBusy(true); setError('');

    // Check for active games linked to this slot
    const { data: linkedGames } = await supabase
      .from('games')
      .select('id, status')
      .eq('slot_id', slot.id);

    for (const game of linkedGames ?? []) {
      const activeStatuses = ['scheduled', 'confirmed_booking', 'pending_results'];
      if (activeStatuses.includes(game.status)) {
        // Active game — cancel properly (refunds + notifications)
        const { error: fnErr } = await supabase.functions.invoke('cancel-game', { body: { gameId: game.id } });
        if (fnErr) {
          setError(`Erro ao cancelar partida vinculada: ${fnErr.message}`);
          setBusy(false);
          return;
        }
      } else {
        // Inactive game — just unlink the slot
        await supabase.from('games').update({ slot_id: null }).eq('id', game.id);
      }
    }

    const { error: e } = await supabase.from('slots').delete().eq('id', slot.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onRefresh(); onClose();
  }

  async function handleCancel() {
    if (!slot.booking || !cancelConfirmed) return;
    setBusy(true); setError('');

    const { data, error: fnErr } = await supabase.functions.invoke('cancel-booking', {
      body: { bookingId: slot.booking.id },
    });

    if (fnErr) {
      const body = await (fnErr as any).context?.json?.().catch(() => null);
      setError(body?.error ?? fnErr.message ?? 'Erro ao cancelar reserva');
      setBusy(false); return;
    }

    setBusy(false);
    setStripeRefunded(data?.stripe_refunded === true);
    setCancelDone(true);
    onRefresh();
  }

  const headerBg =
    status === 'booked'
      ? isPaid ? 'bg-purple-600' : 'bg-orange-500'
      : status === 'blocked' ? 'bg-gray-500'
      : 'bg-green-600';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className={`${headerBg} text-white px-6 pt-6 pb-5 rounded-t-3xl sm:rounded-t-2xl`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              {view !== 'main' && !cancelDone && (
                <button onClick={() => { setView('main'); setError(''); setCancelConfirmed(false); }}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors mr-1">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <span className="text-xs font-bold uppercase tracking-widest opacity-75">
                {view === 'reserve' ? 'Fazer Reserva'
                  : view === 'cancel' ? 'Cancelar Reserva'
                  : view === 'delete_slot' ? 'Remover da Agenda'
                  : status === 'booked' ? (isPaid ? 'Reservado · Pago' : 'Reservado · Pendente')
                  : status === 'blocked' ? 'Bloqueado'
                  : 'Disponível'}
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <p className="text-xl font-bold">{courtName}</p>
            <p className="text-sm opacity-80 mt-0.5 capitalize">{date}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="bg-white/20 rounded-lg px-3 py-1 text-sm font-semibold">{time} – {endTime}</span>
              {slot.price_override != null && (
                <span className="bg-white/20 rounded-lg px-3 py-1 text-sm font-semibold">R$ {slot.price_override}</span>
              )}
            </div>
          </div>
        </div>

        <div className="p-5">

          {/* ── MAIN VIEW ── */}
          {view === 'main' && (
            <div className="space-y-4">

              {/* Booked */}
              {status === 'booked' && slot.booking && (
                <>
                  {/* Player card */}
                  <div className={`flex items-center gap-4 p-4 rounded-2xl border ${isPaid ? 'bg-purple-50 border-purple-100' : 'bg-orange-50 border-orange-100'}`}>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${isPaid ? 'bg-purple-600' : 'bg-orange-400'}`}>
                      <span className="text-white font-bold text-lg">
                        {slot.booking.profiles?.name?.[0]?.toUpperCase() ?? '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 truncate">{slot.booking.profiles?.name ?? 'Jogador'}</p>
                      {slot.booking.profiles?.phone && (
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3.5 h-3.5" />{slot.booking.profiles.phone}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-gray-900">R$ {slot.booking.total_price}</p>
                      <div className={`flex items-center gap-1 text-xs font-semibold mt-0.5 justify-end ${isPaid ? 'text-green-600' : 'text-orange-500'}`}>
                        {isPaid
                          ? <><CheckCircle className="w-3.5 h-3.5" /> Pago</>
                          : <><AlertCircle className="w-3.5 h-3.5" /> Pendente</>}
                      </div>
                    </div>
                  </div>

                  {/* Linked game details */}
                  {gameLoading && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                  )}
                  {linkedGame && !gameLoading && (
                    <div className="space-y-3 border border-gray-100 rounded-2xl p-4 bg-gray-50">
                      {/* Status + count */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
                          <Users className="w-4 h-4 text-gray-400" />
                          {linkedGame.current_players} / {linkedGame.max_players} jogadores
                        </div>
                        <GameStatusBadge status={linkedGame.status} />
                      </div>

                      {/* Fill bar */}
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            linkedGame.status === 'confirmed_booking' ? 'bg-green-500' : 'bg-purple-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.round((linkedGame.current_players / linkedGame.max_players) * 100))}%` }}
                        />
                      </div>

                      {/* Player list */}
                      {gamePlayers.length > 0 && (
                        <div className="space-y-1.5">
                          {gamePlayers.map(p => (
                            <div key={p.player_id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                              p.paid ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'
                            }`}>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
                                p.paid ? 'bg-green-600 text-white' : 'bg-orange-400 text-white'
                              }`}>
                                {initials(p.player_name)}
                              </div>
                              <span className="text-sm font-medium text-gray-900 flex-1 truncate">
                                {p.player_name}
                                {p.player_id === linkedGame.organizer_id && (
                                  <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold">Org.</span>
                                )}
                              </span>
                              {p.paid
                                ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                : <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />}
                            </div>
                          ))}
                        </div>
                      )}
                      {gamePlayers.length === 0 && (
                        <p className="text-xs text-gray-400 text-center">Nenhum jogador registrado ainda.</p>
                      )}

                      {/* Revenue summary */}
                      {linkedGame.price_per_player > 0 && (
                        <div className="border-t border-gray-200 pt-3 space-y-1">
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Receita confirmada</span>
                            <span className="font-bold text-gray-800">
                              R$ {(gamePlayers.filter(p => p.paid).length * linkedGame.price_per_player).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>Receita potencial</span>
                            <span>R$ {(linkedGame.max_players * linkedGame.price_per_player).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2">
                    {!isPaid && (
                      <button onClick={handleConfirmPayment} disabled={busy}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors disabled:opacity-60">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                        Confirmar pagamento
                      </button>
                    )}
                    <button onClick={() => { setView('cancel'); setError(''); }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold border border-red-200 hover:bg-red-100 transition-colors">
                      <XCircle className="w-4 h-4" /> Cancelar reserva
                    </button>
                  </div>
                </>
              )}

              {/* Available */}
              {status === 'available' && (
                <div className="space-y-2">
                  <button onClick={() => { setView('reserve'); setError(''); }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors">
                    <CalendarCheck className="w-5 h-5" /> Fazer reserva para jogador
                  </button>
                  <button onClick={handleBlock} disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-colors disabled:opacity-60">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                    Bloquear horário
                  </button>
                  <button onClick={() => { setView('delete_slot'); setError(''); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold border border-red-200 hover:bg-red-100 transition-colors">
                    <Trash2 className="w-4 h-4" /> Cancelar slot da agenda
                  </button>
                </div>
              )}

              {/* Blocked */}
              {status === 'blocked' && (
                <div className="space-y-2">
                  <button onClick={handleUnblock} disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors disabled:opacity-60">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-5 h-5" />}
                    Desbloquear horário
                  </button>
                  <button onClick={() => { setView('reserve'); setError(''); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors">
                    <CalendarCheck className="w-4 h-4" /> Fazer reserva mesmo assim
                  </button>
                  <button onClick={() => { setView('delete_slot'); setError(''); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold border border-red-200 hover:bg-red-100 transition-colors">
                    <Trash2 className="w-4 h-4" /> Cancelar slot da agenda
                  </button>
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{error}</p>}
            </div>
          )}

          {/* ── CANCEL VIEW ── */}
          {view === 'cancel' && slot.booking && (
            <div className="space-y-4">
              {!cancelDone ? (
                <>
                  {/* Player summary */}
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isPaid ? 'bg-purple-600' : 'bg-orange-400'}`}>
                        <span className="text-white font-bold">{slot.booking.profiles?.name?.[0]?.toUpperCase() ?? '?'}</span>
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{slot.booking.profiles?.name ?? 'Jogador'}</p>
                        {slot.booking.profiles?.phone && (
                          <p className="text-sm text-gray-500">{slot.booking.profiles.phone}</p>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-gray-200 pt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Valor</span>
                        <span className="font-bold text-gray-900">R$ {slot.booking.total_price}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Pagamento</span>
                        <span className={`font-semibold ${isPaid ? 'text-green-600' : 'text-orange-500'}`}>
                          {isPaid ? 'Pago' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notification info */}
                  <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3">
                    <Bell className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-700">
                      O jogador receberá uma notificação sobre o cancelamento.
                    </p>
                  </div>

                  {/* Paid refund info */}
                  {isPaid && (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">
                        Esta reserva foi <strong>paga</strong>. O sistema tentará processar o reembolso de R$ {slot.booking.total_price} automaticamente via Stripe. Caso não seja possível, o reembolso deverá ser feito manualmente.
                      </p>
                    </div>
                  )}

                  {/* Confirm checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer select-none bg-red-50 rounded-xl p-3.5 border border-red-200">
                    <input type="checkbox" checked={cancelConfirmed} onChange={e => setCancelConfirmed(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-red-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-800">
                      Confirmo o cancelamento desta reserva
                    </span>
                  </label>

                  {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{error}</p>}

                  <button onClick={handleCancel} disabled={!cancelConfirmed || busy}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
                    {busy
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Cancelando...</>
                      : <><XCircle className="w-5 h-5" /> Cancelar reserva</>}
                  </button>
                </>
              ) : (
                /* Success state */
                <div className="space-y-4 text-center">
                  <div className="bg-green-50 rounded-2xl p-6 border border-green-100">
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="text-lg font-bold text-green-800">Reserva cancelada</p>
                    <p className="text-sm text-green-700 mt-1">Horário liberado com sucesso.</p>
                    {isPaid && (
                      <p className="text-xs text-green-600 mt-2">
                        {stripeRefunded
                          ? 'Reembolso processado via Stripe. O valor será creditado em breve.'
                          : 'Reembolso automático não encontrado. Processe o valor manualmente.'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Bell className="w-4 h-4" />
                    Notificação enviada ao jogador
                  </div>
                  <button onClick={onClose}
                    className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors">
                    Fechar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── DELETE SLOT VIEW ── */}
          {view === 'delete_slot' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
                <p className="font-bold text-red-800">Remover slot da agenda</p>
                <p className="text-sm text-red-700">
                  O horário <strong>{time} – {endTime}</strong> de <span className="capitalize">{date}</span> será removido permanentemente da agenda de <strong>{courtName}</strong>.
                </p>
                <p className="text-xs text-red-600 mt-1">Esta ação não pode ser desfeita.</p>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{error}</p>}

              <button onClick={handleDeleteSlot} disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
                {busy
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Removendo...</>
                  : <><Trash2 className="w-5 h-5" /> Confirmar remoção</>}
              </button>
            </div>
          )}

          {/* ── RESERVE VIEW ── */}
          {view === 'reserve' && (
            <div className="space-y-4">

              {/* Type selector */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Tipo de reserva</label>
                <div className="flex gap-2">
                  <button onClick={() => setReserveType('private')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      reserveType === 'private' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-purple-300'
                    }`}>
                    <Lock className="w-4 h-4" /> Privada
                  </button>
                  <button onClick={() => setReserveType('open')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      reserveType === 'open' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'
                    }`}>
                    <Users className="w-4 h-4" /> Aberta
                  </button>
                </div>
              </div>

              {/* Open game fields */}
              {reserveType === 'open' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Preço por jogador (R$)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="number" min="0" step="0.01" placeholder="0,00" value={pricePerPlayer}
                        onChange={e => setPricePerPlayer(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                  </div>
                </>
              )}

              {/* Private game fields */}
              {reserveType === 'private' && (
              <>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Buscar jogador</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Nome ou telefone..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setSelectedUser(null); }}
                    className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400"
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
                </div>

                {!selectedUser && searchResults.length > 0 && (
                  <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {searchResults.map(p => (
                      <button key={p.id}
                        onClick={() => { setSelectedUser(p); setSearch(''); setSearchResults([]); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-0 text-left">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-700 font-bold text-sm">{p.name?.[0]?.toUpperCase()}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.phone}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!selectedUser && search.length >= 2 && !searching && searchResults.length === 0 && (
                  <p className="mt-2 text-sm text-gray-400 text-center">Nenhum jogador encontrado</p>
                )}
              </div>

              {selectedUser && (
                <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-200">
                  <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">{selectedUser.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900 text-sm">{selectedUser.name}</p>
                    <p className="text-xs text-gray-500">{selectedUser.phone}</p>
                  </div>
                  <button onClick={() => setSelectedUser(null)} className="p-1.5 hover:bg-purple-100 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Valor cobrado (R$)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="number" min="0" step="0.01" placeholder="0,00" value={reservePrice}
                    onChange={e => setReservePrice(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
                </div>
              </div>


</>
              )}
              {/* end reserveType === 'private' */}

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{error}</p>}

              <button
                onClick={handleReserve}
                disabled={busy || (reserveType === 'private' && !selectedUser)}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 ${
                  reserveType === 'open' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
                }`}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-5 h-5" />}
                {reserveType === 'open' ? 'Criar partida aberta' : 'Confirmar reserva'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
