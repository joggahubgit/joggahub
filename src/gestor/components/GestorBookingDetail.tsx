import { useState, useEffect } from 'react';
import {
  X, Calendar, Clock, User, Phone, MapPin, DollarSign,
  CheckCircle, AlertCircle, XCircle, Loader2, Bell, CreditCard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface Props {
  bookingId: string;
  onClose: () => void;
  onChanged: () => void;
}

interface Detail {
  id: string;
  slot_id: string;
  total_price: number;
  payment_status: string;
  status: string;
  created_at: string;
  start_time: string;
  end_time: string;
  court_name: string;
  venue_name: string;
  player_name: string;
  player_phone: string;
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString('pt-BR', opts);
}

export function GestorBookingDetail({ bookingId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [stripeRefunded, setStripeRefunded] = useState(false);

  useEffect(() => {
    load();
  }, [bookingId]);

  async function load() {
    setLoading(true);
    setError('');

    const { data: b } = await supabase
      .from('bookings')
      .select('id, slot_id, created_by, total_price, payment_status, status, created_at')
      .eq('id', bookingId)
      .single();

    if (!b) { setLoading(false); setError('Reserva não encontrada.'); return; }

    const { data: slot } = await supabase
      .from('slots')
      .select('id, court_id, start_time, end_time')
      .eq('id', b.slot_id)
      .single();

    let court_name = '—', venue_name = '—';
    if (slot?.court_id) {
      const { data: court } = await supabase
        .from('courts')
        .select('name, venue_id')
        .eq('id', slot.court_id)
        .single();
      if (court) {
        court_name = court.name;
        if (court.venue_id) {
          const { data: venue } = await supabase
            .from('venues')
            .select('name')
            .eq('id', court.venue_id)
            .single();
          venue_name = venue?.name ?? '—';
        }
      }
    }

    let player_name = '—', player_phone = '—';
    if (b.created_by) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', b.created_by)
        .single();
      player_name = profile?.name ?? '—';
      player_phone = profile?.phone ?? '—';
    }

    setDetail({
      id: b.id,
      slot_id: b.slot_id,
      total_price: b.total_price,
      payment_status: b.payment_status,
      status: b.status,
      created_at: b.created_at,
      start_time: slot?.start_time ?? '',
      end_time: slot?.end_time ?? '',
      court_name,
      venue_name,
      player_name,
      player_phone,
    });
    setLoading(false);
  }

  async function confirmPayment() {
    if (!detail) return;
    setBusy(true); setError('');
    const { error: err } = await supabase
      .from('bookings')
      .update({ payment_status: 'paid' })
      .eq('id', detail.id);
    if (err) { setError(err.message); setBusy(false); return; }
    await load();
    setBusy(false);
    onChanged();
  }

  async function cancelBooking() {
    if (!detail) return;
    setBusy(true); setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('cancel-booking', {
      body: { bookingId: detail.id },
    });
    if (fnErr) {
      const parsed = await (fnErr as any).context?.json?.().catch(() => null);
      setError(parsed?.error ?? fnErr.message ?? 'Erro ao cancelar reserva');
      setBusy(false); return;
    }
    setStripeRefunded(data?.stripe_refunded === true);
    setCancelDone(true);
    setBusy(false);
    setConfirmingCancel(false);
    onChanged();
  }

  const isCancelled = detail?.status === 'cancelled';
  const isPaid      = detail?.payment_status === 'paid';

  const headerBg = isCancelled ? 'bg-gray-500' : isPaid ? 'bg-purple-600' : 'bg-orange-500';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className={`px-6 pt-6 pb-5 rounded-t-3xl sm:rounded-t-2xl ${headerBg} text-white`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-widest opacity-75">
              {isCancelled ? 'Reserva Cancelada'
                : isPaid ? 'Reservado · Pago'
                : 'Reservado · Pendente'}
            </span>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin opacity-70" />
            </div>
          ) : detail ? (
            <div>
              <p className="text-xl font-bold">{detail.player_name}</p>
              <p className="text-sm opacity-75 mt-0.5">{detail.court_name} · {detail.venue_name}</p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {detail.start_time && (
                  <span className="bg-white/20 rounded-lg px-3 py-1 text-sm font-semibold">
                    {detail.start_time.substring(11, 16)}{detail.end_time ? ` – ${detail.end_time.substring(11, 16)}` : ''}
                  </span>
                )}
                <span className="bg-white/20 rounded-lg px-3 py-1 text-sm font-semibold">
                  R$ {(detail.total_price ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
          )}

          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}

          {!loading && detail && !cancelDone && (
            <>
              {/* Status badge */}
              <div className="flex justify-center">
                {isCancelled ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-full font-semibold text-sm">
                    <XCircle className="w-4 h-4" /> Cancelada
                  </div>
                ) : isPaid ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full font-semibold text-sm">
                    <CheckCircle className="w-4 h-4" /> Paga
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-full font-semibold text-sm">
                    <AlertCircle className="w-4 h-4" /> Aguardando pagamento
                  </div>
                )}
              </div>

              {/* Info rows */}
              <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
                <InfoRow icon={User} label="Jogador" value={detail.player_name} />
                <InfoRow icon={Phone} label="Telefone" value={detail.player_phone} />
                <InfoRow icon={MapPin} label="Quadra" value={`${detail.court_name} · ${detail.venue_name}`} />
                {detail.start_time && (
                  <InfoRow
                    icon={Calendar}
                    label="Data"
                    value={fmt(detail.start_time, { weekday: 'long', day: 'numeric', month: 'long' })}
                  />
                )}
                {detail.start_time && (
                  <InfoRow
                    icon={Clock}
                    label="Horário"
                    value={`${detail.start_time.substring(11, 16)}${detail.end_time ? ` – ${detail.end_time.substring(11, 16)}` : ''}`}
                  />
                )}
                <InfoRow
                  icon={DollarSign}
                  label="Valor"
                  value={`R$ ${(detail.total_price ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                />
              </div>

              {/* Actions */}
              {!isCancelled && (
                <div className="space-y-3">
                  {!isPaid && (
                    <button
                      onClick={confirmPayment}
                      disabled={busy}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                      Confirmar pagamento
                    </button>
                  )}

                  {!confirmingCancel ? (
                    <button
                      onClick={() => setConfirmingCancel(true)}
                      disabled={busy}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold hover:bg-red-50 transition-colors text-sm disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Cancelar reserva
                    </button>
                  ) : (
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200 space-y-3">
                      <p className="text-sm font-semibold text-red-800">Confirmar cancelamento?</p>
                      {isPaid && (
                        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          Reserva paga — o sistema tentará reembolso automático via Stripe.
                        </div>
                      )}
                      <p className="text-xs text-red-600">O horário será liberado e o jogador notificado.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmingCancel(false)}
                          disabled={busy}
                          className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 disabled:opacity-50"
                        >
                          Voltar
                        </button>
                        <button
                          onClick={cancelBooking}
                          disabled={busy}
                          className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Sim, cancelar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">
                Criada em {fmt(detail.created_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}#{detail.id.slice(0, 8)}
              </p>
            </>
          )}

          {/* Cancel success state */}
          {!loading && cancelDone && (
            <div className="space-y-4 text-center">
              <div className="bg-green-50 rounded-2xl p-6 border border-green-100">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-lg font-bold text-green-800">Reserva cancelada</p>
                <p className="text-sm text-green-700 mt-1">Horário liberado com sucesso.</p>
                {detail?.payment_status === 'paid' && (
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
              <button
                onClick={onClose}
                className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <span className="text-sm text-gray-500 w-20 flex-shrink-0">{label}</span>
      <span className="text-sm font-semibold text-gray-900 flex-1 min-w-0 text-right">{value}</span>
    </div>
  );
}
