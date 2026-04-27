import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Clock, CreditCard, Shield,
  Loader2, ChevronRight, CalendarDays, Users, Lock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calcFees } from '@/app/lib/checkout';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default function PrivateGameReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const {
    slotId, price, time, endTime, courtId, courtName, venueName, date,
    maxPlayers, payMode, courtSport,
  } = (location.state as any) ?? {};

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!slotId || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <p className="text-gray-600">Nenhum horário selecionado.</p>
          <button onClick={() => navigate(-1)} className="bg-violet-600 text-white px-6 py-3 rounded-xl font-semibold">
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const courtPrice = Number(price) || 0;
  const players = Number(maxPlayers) || 18;

  // Split: organizer authorizes full court price as hold; display shows minimum share (÷ 10)
  const MIN_SPLIT_PLAYERS = 10;
  const myShare = payMode === 'split' ? courtPrice / MIN_SPLIT_PLAYERS : courtPrice;
  const { base, fee, total } = calcFees(myShare);
  // For split: the hold = full court price + service fee
  const { total: holdTotal } = payMode === 'split' ? calcFees(courtPrice) : { total };
  const formattedDate = date ? formatDate(date) : '';
  const origin = window.location.origin;

  // Cutoff = 12 hours before the slot start time
  const deadlineLabel = (() => {
    if (!date || !time) return '';
    const start = new Date(date + 'T' + time + ':00');
    start.setHours(start.getHours() - 12);
    const dayMonth = start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    const hhmm = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    return `${dayMonth} às ${hhmm}`;
  })();

  async function handleCheckout() {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sessão expirada. Faça login novamente.');
        setLoading(false);
        return;
      }

      const successParams = new URLSearchParams({
        mode: 'private_game',
        slotId,
        courtId: courtId ?? '',
        userId: user!.id,
        courtName: courtName ?? '',
        venueName: venueName ?? '',
        date: date ?? '',
        time: time ?? '',
        endTime: endTime ?? '',
        maxPlayers: String(players),
        payMode: payMode ?? 'full',
        courtPrice: String(courtPrice),
        courtSport: courtSport ?? '',
        price: String(total),
        // For split: after checkout we partially capture only the organizer's share
        ...(payMode === 'split' && { organizerShare: String(total) }),
      });

      // Stripe replaces {CHECKOUT_SESSION_ID} in the success URL at redirect time
      const successUrl = `${origin}/payment-success?${successParams}&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/court-details/${courtId}`;

      const { data, error: fnErr } = await supabase.functions.invoke('create-slot-checkout-session', {
        body: {
          slotId,
          courtId,
          userId: user!.id,
          courtName,
          venueName,
          date: formattedDate,
          time,
          endTime,
          // For split: authorize full court price (hold); for full: charge organizer's amount directly
          price: payMode === 'split' ? holdTotal : total,
          payMode: payMode ?? 'full',
          successUrl,
          cancelUrl,
        },
      });

      if (fnErr) {
        let detail = fnErr.message ?? 'Erro desconhecido';
        try {
          const body = await (fnErr as any).context?.json();
          if (body?.error) detail = body.error;
          else if (body?.message) detail = body.message;
        } catch {
          try {
            const text = await (fnErr as any).context?.text?.();
            if (text) detail = text;
          } catch { /* ignore */ }
        }
        console.error('[checkout] fnErr:', fnErr, 'detail:', detail);
        throw new Error(detail);
      }
      if (!data?.url) throw new Error('URL de pagamento não encontrada');

      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message ?? 'Erro ao iniciar pagamento. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* Header */}
      <div className="bg-violet-600 text-white px-6 pt-12 pb-6">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 opacity-80 hover:opacity-100">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Voltar</span>
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 opacity-80" />
          <p className="text-xs font-bold uppercase tracking-widest opacity-70">Revisão · Partida Privada</p>
        </div>
        <h1 className="text-2xl font-bold">{courtName}</h1>
        {venueName && (
          <p className="text-sm opacity-75 flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5" />{venueName}
          </p>
        )}
      </div>

      <div className="px-5 py-6 space-y-4 max-w-md mx-auto">

        {/* Game details card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Detalhes da partida</p>
            <div className="space-y-3">
              {formattedDate && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CalendarDays className="w-4 h-4 text-violet-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 capitalize">{formattedDate}</span>
                </div>
              )}
              {time && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-violet-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">
                    {time}{endTime ? ` – ${endTime}` : ''}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-800">
                    {payMode === 'split' ? 'Mínimo 10 · Máximo 18 jogadores' : `${players} jogadores`}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {payMode === 'split' ? 'Mais jogadores = menos por pessoa' : 'Você paga o valor completo'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Resumo de valores</p>
            {payMode === 'split' ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Valor da quadra</span>
                  <span className="font-semibold text-gray-900">R$ {courtPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Sua parte mínima (÷ 10)</span>
                  <span className="font-semibold text-gray-900">R$ {base.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Valor da quadra</span>
                <span className="font-semibold text-gray-900">R$ {base.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Taxa de serviço (8% + R$ 2,50)</span>
              <span className="font-semibold text-gray-900">R$ {fee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-3 mt-1 border-t border-gray-100">
              <span className="font-bold text-gray-900">Você paga agora</span>
              <div className="text-right">
                <span className="text-xl font-black text-violet-600">R$ {total.toFixed(2)}</span>
                {payMode === 'split' && (
                  <p className="text-xs text-gray-400 mt-0.5">R$ {holdTotal.toFixed(2)} retidos como garantia</p>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* Hold info — split only */}
        {payMode === 'split' && (
          <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100 space-y-1.5">
            <p className="text-xs text-blue-900 leading-relaxed">
              Retemos <strong>R$ {holdTotal.toFixed(2)}</strong> no seu cartão como garantia. Outros jogadores entram via link e cada um autoriza sua parte mínima.
            </p>
            {deadlineLabel && (
              <p className="text-xs text-blue-700 leading-relaxed">
                12h antes do jogo (<strong>{deadlineLabel}</strong>) o valor é ajustado pelo número real de jogadores e cobrado de cada um.
              </p>
            )}
          </div>
        )}

        {/* Security badge */}
        <div className="bg-violet-50 rounded-2xl p-4 border border-violet-100">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-violet-800">Pagamento 100% seguro</p>
              <p className="text-xs text-violet-600 mt-0.5">
                Processado pelo Stripe. Seus dados são criptografados e protegidos.
              </p>
            </div>
          </div>
        </div>

        {/* Payment methods */}
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <CreditCard className="w-4 h-4" />
          <span className="text-xs font-medium">Cartão de crédito · Débito · Pix</span>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-violet-700 transition-colors shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Aguarde...</>
            : <><CreditCard className="w-5 h-5" /> Pagar R$ {total.toFixed(2)} <ChevronRight className="w-5 h-5" /></>}
        </button>

        <p className="text-center text-xs text-gray-400">
          Você será redirecionado para a página segura do Stripe
        </p>
        {payMode === 'split' && (
          <p className="text-center text-xs text-gray-400 -mt-1">
            R$ {holdTotal.toFixed(2)} serão retidos no cartão como garantia da reserva completa
          </p>
        )}

      </div>
    </div>
  );
}
