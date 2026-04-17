import { useState, useEffect, useRef } from 'react';
import {
  X, Ban, CheckCircle, AlertCircle, DollarSign, Search,
  Phone, Loader2, Trash2, CalendarCheck, Unlock, ChevronLeft,
  XCircle, Bell, CreditCard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function formatEndTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getStatus(slot: Slot): 'available' | 'booked' | 'blocked' {
  if (slot.booking) return 'booked';
  if (!slot.is_available) return 'blocked';
  return 'available';
}

export function SlotModal({ slot, courtName, onClose, onRefresh }: Props) {
  const [view, setView] = useState<View>('main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelDone, setCancelDone] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [stripeRefunded, setStripeRefunded] = useState(false);

  // Reserve flow
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [reservePrice, setReservePrice] = useState(String(slot.price_override ?? ''));
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = getStatus(slot);
  const { date, time } = formatDateTime(slot.start_time);
  const endTime = formatEndTime(slot.end_time);
  const isPaid = slot.booking?.payment_status === 'paid';

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
    if (!selectedUser) { setError('Selecione um jogador.'); return; }
    setBusy(true); setError('');
    const price = parseFloat(reservePrice) || 0;

    const { error: bookErr } = await supabase.from('bookings').insert({
      slot_id: slot.id,
      created_by: selectedUser.id,
      total_price: price,
      payment_status: paymentStatus,
      status: 'confirmed',
    });
    if (bookErr) { setError(bookErr.message); setBusy(false); return; }

    const { error: slotErr } = await supabase.from('slots').update({ is_available: false }).eq('id', slot.id);
    if (slotErr) { setError(slotErr.message); setBusy(false); return; }

    setBusy(false);
    onRefresh(); onClose();
  }

  async function handleDeleteSlot() {
    setBusy(true); setError('');
    // Remove draft games referencing this slot (bookings cascade automatically via DB constraint)
    await supabase.from('games').delete().eq('slot_id', slot.id);
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

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Status do pagamento</label>
                <div className="flex gap-2">
                  {([
                    { value: 'pending', label: 'Pendente', icon: AlertCircle, color: 'border-orange-300 text-orange-600 bg-orange-50' },
                    { value: 'paid', label: 'Já pago', icon: CheckCircle, color: 'border-green-300 text-green-600 bg-green-50' },
                  ] as const).map(opt => (
                    <button key={opt.value} onClick={() => setPaymentStatus(opt.value)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                        paymentStatus === opt.value
                          ? opt.color
                          : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
                      }`}>
                      <opt.icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{error}</p>}

              <button onClick={handleReserve} disabled={busy || !selectedUser}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-5 h-5" />}
                Confirmar reserva
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
