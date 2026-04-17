import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Clock, Users, MapPin, ShieldCheck, ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react';
import { redirectToCheckout } from '@/app/lib/checkout';

interface JoinState {
  gameId: string;
  playerName: string;
  playerId: string;
  courtName: string;
  courtSport: string;
  venueName: string;
  date: string;
  time: string;
  endTime: string;
  pricePerPlayer: number;
}

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

export default function JoinGameReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as JoinState;

  const [policyExpanded, setPolicyExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  if (!state) { navigate(-1); return null; }

  const [sh, sm] = state.time.split(':').map(Number);
  const [eh, em] = (state.endTime || '00:00').split(':').map(Number);
  const durationMins = (eh * 60 + em) - (sh * 60 + sm);
  const durationLabel = durationMins > 0
    ? durationMins % 60 === 0
      ? `${durationMins / 60}h`
      : `${Math.floor(durationMins / 60)}h${durationMins % 60}min`
    : '';

  async function handleConfirm() {
    setConfirming(true);
    setError('');
    try {
      await redirectToCheckout({
        gameId: state.gameId,
        playerId: state.playerId,
        playerName: state.playerName,
        courtName: state.courtName,
        venueName: state.venueName,
        sport: state.courtSport,
        date: state.date,
        time: state.time,
        vagaPrice: state.pricePerPlayer,
        mode: 'join_other',
      });
    } catch (e: any) {
      setError(e.message);
      setConfirming(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 bg-white border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">Confirmar entrada</h1>
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X className="w-6 h-6 text-gray-700" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

        {/* Player being added */}
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-violet-600 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {state.playerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Adicionando jogador</p>
            <p className="font-bold text-gray-900">{state.playerName}</p>
          </div>
        </div>

        {/* Match summary */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-lg font-bold text-gray-900 leading-snug capitalize">{formatDate(state.date)}</p>
                <p className="text-lg font-bold text-gray-900">{state.time}{state.endTime ? ` – ${state.endTime}` : ''}</p>
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-500">{sportLabel(state.courtSport)}</p>
                  <p className="text-sm text-gray-500">{state.courtName}</p>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    {state.venueName}
                  </div>
                </div>
              </div>
              {durationLabel && (
                <div className="flex flex-col items-center gap-1 flex-shrink-0 text-gray-500 pt-1">
                  <Clock className="w-6 h-6" />
                  <span className="text-sm font-semibold">{durationLabel}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Price */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">Total</p>
              <p className="text-xs text-gray-400 mt-0.5">Valor da vaga</p>
            </div>
            <p className="text-2xl font-bold text-violet-600">R$ {state.pricePerPlayer}</p>
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
            <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
              <p className="text-sm text-gray-500 leading-relaxed">
                Cancelamentos com menos de 24 horas de antecedência não são reembolsáveis.
              </p>
              <p className="text-xs text-gray-400">Este serviço é provido pelo clube e sujeito às suas regras internas.</p>
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
          disabled={confirming}
          className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold text-base hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {confirming
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Confirmando...</>
            : <><CheckCircle className="w-5 h-5" /> Pagar vaga de {state.playerName.split(' ')[0]} · R$ {state.pricePerPlayer}</>}
        </button>
      </div>
    </div>
  );
}
