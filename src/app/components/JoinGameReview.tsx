import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Clock, Users, MapPin, ShieldCheck, ChevronDown, ChevronUp, Loader2, CheckCircle, Lock } from 'lucide-react';
import { redirectToCheckout, calcFees } from '@/app/lib/checkout';
import { supabase } from '@/lib/supabase';
import { notifyGamePlayers } from '@/app/lib/notify';

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
  mode?: 'join_self' | 'join_other';
  isPrivate?: boolean;
  currentPlayers?: number;
  maxPlayers?: number;
  gamePayMode?: 'split' | 'full';
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

  const isSelf = state.mode === 'join_self';
  const isFree = state.gamePayMode === 'full' || state.pricePerPlayer === 0;
  const { fee, total: priceTotal } = calcFees(state.pricePerPlayer);

  async function handleConfirmFree() {
    setConfirming(true);
    setError('');
    try {
      // Check if already in game
      const { data: existing } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', state.gameId)
        .eq('player_id', state.playerId)
        .maybeSingle();

      if (existing) {
        navigate(`/open-game/${state.gameId}`, { replace: true });
        return;
      }

      // Add player directly (no payment needed)
      const { error: insertErr } = await supabase.from('game_players').insert({
        game_id: state.gameId,
        player_id: state.playerId,
        player_name: state.playerName,
        paid: true,
      });
      if (insertErr) throw new Error(insertErr.message);

      // Increment current_players
      const { data: game } = await supabase
        .from('games')
        .select('current_players, max_players')
        .eq('id', state.gameId)
        .single();
      const newCount = (game?.current_players ?? 1) + 1;
      await supabase
        .from('games')
        .update({ current_players: newCount })
        .eq('id', state.gameId);

      // Notify all other players
      await notifyGamePlayers(
        state.gameId,
        state.playerId,
        'game_joined',
        'Novo jogador entrou!',
        `${state.playerName} entrou na partida. Agora são ${newCount}/${game?.max_players ?? state.maxPlayers} jogadores.`,
      );

      navigate(`/open-game/${state.gameId}`, { replace: true });
    } catch (e: any) {
      setError(e.message);
      setConfirming(false);
    }
  }

  async function handleConfirmPaid() {
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
        mode: isSelf ? 'join_self' : 'join_other',
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

        {/* Private game status */}
        {state.isPrivate && (
          <div className="bg-gray-900 rounded-2xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-bold text-white">Partida Privada</span>
            </div>
            {state.currentPlayers !== undefined && state.maxPlayers !== undefined && (
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-300">
                  {state.currentPlayers}/{state.maxPlayers} jogadores
                </span>
                {state.maxPlayers - state.currentPlayers > 0 && (
                  <span className="ml-1 text-xs bg-amber-400 text-gray-900 font-bold px-2 py-0.5 rounded-full">
                    {state.maxPlayers - state.currentPlayers} {state.maxPlayers - state.currentPlayers === 1 ? 'vaga' : 'vagas'}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Player */}
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-violet-600 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {state.playerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{isSelf ? 'Confirmando sua entrada' : 'Adicionando jogador'}</p>
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
          {!isFree && (
            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Valor da vaga</span>
                <span className="font-semibold text-gray-900">R$ {state.pricePerPlayer.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Taxa de serviço (8% + R$ 2,50)</span>
                <span className="font-semibold text-gray-900">R$ {fee.toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">Total</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isFree ? 'Organizador pagou a quadra completa' : 'Inclui taxa de serviço'}
              </p>
            </div>
            {isFree
              ? <p className="text-2xl font-bold text-green-600">Grátis</p>
              : <p className="text-2xl font-bold text-violet-600">R$ {priceTotal.toFixed(2)}</p>
            }
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
          onClick={isFree ? handleConfirmFree : handleConfirmPaid}
          disabled={confirming}
          className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold text-base hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {confirming
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Confirmando...</>
            : isFree
              ? <><CheckCircle className="w-5 h-5" /> Confirmar entrada · Grátis</>
              : isSelf
                ? <><CheckCircle className="w-5 h-5" /> Pagar minha parte · R$ {priceTotal.toFixed(2)}</>
                : <><CheckCircle className="w-5 h-5" /> Pagar vaga de {state.playerName.split(' ')[0]} · R$ {priceTotal.toFixed(2)}</>}
        </button>
      </div>
    </div>
  );
}
