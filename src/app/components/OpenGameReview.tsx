import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Clock, Users, MapPin, ShieldCheck, ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { redirectToCheckout, calcFees } from '@/app/lib/checkout';

interface GameState {
  slotId: string;
  courtId: string;
  courtName: string;
  courtSport: string;
  venueName: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM
  endTime: string;        // HH:MM
  totalPrice: number;
  maxPlayers: number;
  minPlayers: number;
  pricePerPlayer: number;
}

const SPORT_LABELS: Record<string, string> = {
  football: 'Society',
  society: 'Society',
  futsal: 'Futsal',
  tennis: 'Tênis',
  padel: 'Padel',
  basketball: 'Basquete',
  volleyball: 'Vôlei',
  beach_tennis: 'Beach Tennis',
};

function sportLabel(s: string) {
  return SPORT_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function OpenGameReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as GameState;

  const [policyExpanded, setPolicyExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  if (!state) {
    navigate(-1);
    return null;
  }

  const { serviceFee, total } = calcFees(state.pricePerPlayer);

  async function handleConfirm() {
    setCreating(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Você precisa estar logado.'); setCreating(false); return; }

    const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single();
    const playerName = profile?.name ?? 'Organizador';
    const origin = window.location.origin;

    // All game params travel via the success URL — nothing is written to the DB
    // until payment is confirmed. Slot stays available until then.
    const successParams = new URLSearchParams({
      mode: 'organizer',
      playerId: user.id,
      playerName,
      slotId: state.slotId,
      courtId: state.courtId,
      courtName: state.courtName,
      venueName: state.venueName,
      date: state.date,
      time: state.time,
      endTime: state.endTime,
      maxPlayers: String(state.maxPlayers),
      pricePerPlayer: String(state.pricePerPlayer),
      courtSport: state.courtSport,
      totalPrice: String(state.totalPrice),
    });

    try {
      await redirectToCheckout({
        playerId: user.id,
        playerName,
        courtName: state.courtName,
        venueName: state.venueName,
        sport: sportLabel(state.courtSport),
        date: state.date,
        time: state.time,
        vagaPrice: state.pricePerPlayer,
        mode: 'organizer',
        slotId: state.slotId,
        successUrl: `${origin}/payment-success?${successParams}`,
        cancelUrl: `${origin}/court-details/${state.courtId}`,
      });
    } catch (e: any) {
      setError(e.message);
      setCreating(false);
    }
  }

  // Duration in minutes
  const [sh, sm] = state.time.split(':').map(Number);
  const [eh, em] = state.endTime.split(':').map(Number);
  const durationMins = (eh * 60 + em) - (sh * 60 + sm);
  const durationLabel = durationMins >= 60
    ? durationMins % 60 === 0 ? `${durationMins / 60}h` : `${Math.floor(durationMins / 60)}h${durationMins % 60}min`
    : `${durationMins}min`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 bg-white border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">Revisão</h1>
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X className="w-6 h-6 text-gray-700" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

        {/* Match summary card */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-lg font-bold text-gray-900 leading-snug capitalize">{formatDate(state.date)}</p>
                <p className="text-lg font-bold text-gray-900">{state.time} – {state.endTime}</p>
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-500">{sportLabel(state.courtSport)}</p>
                  <p className="text-sm text-gray-500">{state.courtName}</p>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    {state.venueName}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 flex-shrink-0 text-gray-500 pt-1">
                <Clock className="w-6 h-6" />
                <span className="text-sm font-semibold">{durationLabel}</span>
              </div>
            </div>
          </div>

          {/* Players bar */}
          <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">{state.maxPlayers} jogadores</span>
              </div>
              <span className="text-sm text-gray-400">1/{state.maxPlayers} confirmado</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: state.maxPlayers }).map((_, i) => (
                <div key={i} className={`flex-1 h-1.5 rounded-full ${i === 0 ? 'bg-gray-900' : 'bg-gray-200'}`} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">{state.maxPlayers - 1} vagas abertas para outros jogadores</p>
          </div>
        </div>

        {/* Price breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Valor total da quadra</span>
              <span className="font-semibold text-gray-900">R$ {state.totalPrice}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Dividido por {state.minPlayers} jogadores (mínimo)</span>
              <span className="font-semibold text-gray-900">R$ {state.pricePerPlayer.toFixed(2)}/pessoa</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Taxa de serviço (15%)</span>
              <span className="font-semibold text-gray-900">R$ {serviceFee.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">Total</p>
                <p className="text-xs text-gray-400 mt-0.5">Você paga agora</p>
              </div>
              <p className="text-2xl font-bold text-violet-600">R$ {total.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Cancellation policy */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setPolicyExpanded(e => !e)}
            className="w-full flex items-center justify-between px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <span className="font-semibold text-gray-900 text-sm">Política de Cancelamento</span>
            </div>
            {policyExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>

          {policyExpanded && (
            <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
              <div>
                <p className="font-bold text-gray-900 mb-2">Antes de todas as vagas serem preenchidas</p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  A partida fica pendente de confirmação e pode ser cancelada por falta de jogadores.
                  Se isso acontecer, você receberá o reembolso integral em até 10 dias úteis no método de pagamento utilizado.
                </p>
              </div>
              <div>
                <p className="font-bold text-gray-900 mb-2">Quando todas as vagas forem preenchidas</p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Você pode cancelar sua vaga até 24 horas antes do início da partida.
                  Cancelamentos com menos de 24 horas de antecedência não são reembolsáveis.
                </p>
              </div>
              <p className="text-xs text-gray-400">
                Este serviço é provido pelo clube e sujeito às suas regras internas.
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 border border-red-100">{error}</p>
        )}
      </div>

      {/* CTA */}
      <div className="px-5 py-5 bg-white border-t border-gray-100">
        <button
          onClick={handleConfirm}
          disabled={creating}
          className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold text-base hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {creating
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Processando...</>
            : <><CheckCircle className="w-5 h-5" /> Pagar minha parte · R$ {total.toFixed(2)}</>}
        </button>
      </div>
    </div>
  );
}
