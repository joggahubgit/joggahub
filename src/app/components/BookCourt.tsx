import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Clock, CreditCard, Shield,
  Loader2, ChevronRight, CalendarDays, Trophy,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const SERVICE_FEE_PERCENT = 0.15;

function calcFees(base: number) {
  const fee = Math.ceil(base * SERVICE_FEE_PERCENT * 100) / 100;
  return { base, fee, total: base + fee };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default function BookCourt() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const {
    slotId, price, time, endTime, courtId, courtName, venueName, date,
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

  const { base, fee, total } = calcFees(Number(price) || 0);
  const formattedDate = date ? formatDate(date) : '';
  const origin = window.location.origin;

  async function handleCheckout() {
    setLoading(true);
    setError('');

    try {
      const successUrl = `${origin}/payment-success?mode=slot&slotId=${slotId}&courtId=${encodeURIComponent(courtId ?? '')}&userId=${user!.id}&courtName=${encodeURIComponent(courtName ?? '')}&venueName=${encodeURIComponent(venueName ?? '')}&date=${encodeURIComponent(date ?? '')}&time=${encodeURIComponent(time ?? '')}&price=${total}`;
      const cancelUrl = `${origin}/court/${courtId}`;

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
          price: total,
          successUrl,
          cancelUrl,
        },
      });

      if (fnErr) {
        const body = await (fnErr as any).context?.json?.().catch(() => null);
        throw new Error(body?.error ?? fnErr.message ?? 'Erro ao iniciar pagamento');
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
        <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Confirmar reserva</p>
        <h1 className="text-2xl font-bold">{courtName}</h1>
        {venueName && (
          <p className="text-sm opacity-75 flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5" />{venueName}
          </p>
        )}
      </div>

      <div className="px-5 py-6 space-y-4 max-w-md mx-auto">

        {/* Booking details card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Detalhes do horário</p>
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
                  <Trophy className="w-4 h-4 text-violet-600" />
                </div>
                <span className="text-sm font-semibold text-gray-800">{courtName}</span>
              </div>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Resumo de valores</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Valor da quadra</span>
              <span className="font-semibold text-gray-900">R$ {base.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Taxa de serviço (15%)</span>
              <span className="font-semibold text-gray-900">R$ {fee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-3 mt-1 border-t border-gray-100">
              <span className="font-bold text-gray-900">Total</span>
              <span className="text-xl font-black text-violet-600">R$ {total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Trust badges */}
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

        {/* Stripe badge */}
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

      </div>
    </div>
  );
}
