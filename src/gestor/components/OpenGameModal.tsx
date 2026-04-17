import { useState, useEffect } from 'react';
import { X, Users, MapPin, Clock, DollarSign, CheckCircle, AlertCircle, Loader2, ChevronLeft, Trophy, XCircle, ShieldCheck, Hourglass, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getMinPlayersForSport } from '@/app/lib/gameConfig';

interface Props {
  gameId: string;
  slotId: string;
  courtName: string;
  onClose: () => void;
  onRefresh: () => void;
}

interface Player {
  player_id: string;
  player_name: string;
  paid: boolean;
  is_organizer: boolean;
  profile?: { phone?: string; avatar_url?: string } | null;
}

interface GameDetail {
  id: string;
  is_open: boolean;
  current_players: number;
  max_players: number;
  price_per_player: number;
  scheduled_at: string;
  organizer_id: string;
  court_id: string;
  status?: string;
  xp_distributed?: boolean;
  cancelled?: boolean;
}

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', society: 'Society', futsal: 'Futsal', tennis: 'Tênis',
  padel: 'Padel', basketball: 'Basquete', volleyball: 'Vôlei', beach_tennis: 'Beach Tennis',
};

function formatDT(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export function OpenGameModal({ gameId, slotId, courtName, onClose, onRefresh }: Props) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [sport, setSport] = useState('');
  const [venueName, setVenueName] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'main' | 'cancel'>('main');
  const [resolvedStatus, setResolvedStatus] = useState<string>('scheduled');

  // cancel state
  const [cancelling, setCancelling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [refundResults, setRefundResults] = useState<{ name: string; status: string }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, [gameId]);

  async function load() {
    setLoading(true);
    try {
      // Game
      const { data: g } = await supabase.from('games').select('*').eq('id', gameId).single();
      if (!g) { setLoading(false); return; }
      setGame(g);

      // Court + venue
      let courtSportType = '';
      const { data: court } = await supabase.from('courts').select('sport_type, venue_id').eq('id', g.court_id).single();
      if (court) {
        courtSportType = court.sport_type ?? '';
        setSport(SPORT_LABELS[court.sport_type] ?? court.sport_type ?? '');
        if (court.venue_id) {
          const { data: venue } = await supabase.from('venues').select('name').eq('id', court.venue_id).single();
          if (venue) setVenueName(venue.name);
        }
      }

      // Retroactive confirmation: if still scheduled but min players met, upgrade silently
      let status = g.status ?? 'scheduled';
      if (status === 'scheduled') {
        const minPlayers = getMinPlayersForSport(courtSportType);
        if ((g.current_players ?? 1) >= minPlayers) {
          status = 'confirmed_booking';
          supabase.from('games').update({ status: 'confirmed_booking' }).eq('id', g.id).eq('status', 'scheduled').then(() => {});
        }
      }
      setResolvedStatus(status);

      // Players
      const { data: gp } = await supabase
        .from('game_players')
        .select('player_id, player_name, paid')
        .eq('game_id', gameId);

      const playerRows = gp ?? [];
      const profileIds = playerRows.map(p => p.player_id).filter(Boolean);
      let profileMap: Record<string, any> = {};
      if (profileIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, phone, avatar_url').in('id', profileIds);
        (profiles ?? []).forEach(p => { profileMap[p.id] = p; });
      }

      setPlayers(playerRows.map(p => ({
        ...p,
        is_organizer: p.player_id === g.organizer_id,
        profile: profileMap[p.player_id] ?? null,
      })));
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!cancelConfirmed || !game) return;
    setCancelling(true);
    setError('');

    try {
      // Call edge function to issue Stripe refunds
      const { data, error: fnErr } = await supabase.functions.invoke('cancel-game', {
        body: { gameId },
      });

      if (fnErr) {
        const body = await (fnErr as any).context?.json?.().catch(() => null);
        throw new Error(body?.error ?? fnErr.message ?? 'Erro ao processar reembolsos');
      }

      setRefundResults(data?.refunds ?? []);

      // game cancel + slot free are handled server-side in the edge function (service role key)
      setCancelDone(true);
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCancelling(false);
    }
  }

  const paidPlayers = players.filter(p => p.paid);
  const pendingPlayers = players.filter(p => !p.paid);
  const { date, time } = game ? formatDT(game.scheduled_at) : { date: '', time: '' };
  const fillPct = game ? Math.round((game.current_players / game.max_players) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="bg-blue-600 text-white px-6 pt-6 pb-5 rounded-t-3xl sm:rounded-t-2xl">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              {view === 'cancel' && (
                <button onClick={() => { setView('main'); setError(''); setCancelConfirmed(false); }}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <span className="text-xs font-bold uppercase tracking-widest opacity-75">
                {view === 'cancel' ? 'Cancelar Partida' : 'Partida Aberta'}
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {game && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4 opacity-80" />
                <span className="text-sm font-semibold opacity-90">{sport}</span>
              </div>
              <p className="text-xl font-bold">{courtName}</p>
              {venueName && (
                <p className="text-sm opacity-75 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />{venueName}
                </p>
              )}
              <div className="flex items-center gap-3 mt-3">
                <span className="bg-white/20 rounded-lg px-3 py-1 text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />{time}
                </span>
                <span className="bg-white/20 rounded-lg px-3 py-1 text-sm font-semibold flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />R$ {game.price_per_player?.toFixed(2)}/vaga
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="p-5">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          )}

          {!loading && game && view === 'main' && (
            <div className="space-y-5">

              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-bold text-gray-700">
                      {game.current_players} / {game.max_players} jogadores
                    </span>
                  </div>
                  {resolvedStatus === 'confirmed_booking' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Reserva confirmada
                    </span>
                  )}
                  {resolvedStatus === 'pending_results' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                      <Hourglass className="w-3 h-3" /> Aguardando resultados
                    </span>
                  )}
                  {resolvedStatus === 'completed' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                      {game.xp_distributed ? <Star className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                      {game.xp_distributed ? 'Encerrada (XP distribuído)' : 'Encerrada'}
                    </span>
                  )}
                  {resolvedStatus === 'expired' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Expirada
                    </span>
                  )}
                  {resolvedStatus === 'scheduled' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                      <Hourglass className="w-3 h-3" /> Aguardando jogadores
                    </span>
                  )}
                  {game.current_players >= game.max_players && resolvedStatus === 'scheduled' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 ml-1">
                      Completa
                    </span>
                  )}
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${fillPct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{game.max_players - game.current_players} vaga(s) restante(s)</p>
              </div>

              {/* Confirmed players */}
              {paidPlayers.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    Confirmados ({paidPlayers.length})
                  </p>
                  <div className="space-y-2">
                    {paidPlayers.map(p => (
                      <div key={p.player_id} className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                        <div className="w-9 h-9 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{initials(p.player_name)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">
                            {p.player_name}
                            {p.is_organizer && <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">Org.</span>}
                          </p>
                          {p.profile?.phone && <p className="text-xs text-gray-500">{p.profile.phone}</p>}
                        </div>
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending players */}
              {pendingPlayers.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                    Pagamento pendente ({pendingPlayers.length})
                  </p>
                  <div className="space-y-2">
                    {pendingPlayers.map(p => (
                      <div key={p.player_id} className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                        <div className="w-9 h-9 bg-orange-400 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{initials(p.player_name)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{p.player_name}</p>
                          {p.profile?.phone && <p className="text-xs text-gray-500">{p.profile.phone}</p>}
                        </div>
                        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {players.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum jogador registrado ainda.</p>
              )}

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Receita confirmada</span>
                  <span className="font-bold text-gray-900">
                    R$ {(paidPlayers.length * (game.price_per_player ?? 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Receita potencial</span>
                  <span className="font-semibold text-gray-700">
                    R$ {(game.max_players * (game.price_per_player ?? 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Date info */}
              <p className="text-sm text-gray-500 capitalize text-center">{date}</p>

              {/* Status banners */}
              {resolvedStatus === 'confirmed_booking' && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm font-semibold">
                  <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
                  Reserva confirmada — mínimo de jogadores atingido.
                </div>
              )}
              {resolvedStatus === 'pending_results' && (
                <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-orange-800 text-sm font-semibold">
                  <Hourglass className="w-4 h-4 text-orange-600 flex-shrink-0" />
                  Partida encerrada — aguardando inserção de resultados.
                </div>
              )}
              {resolvedStatus === 'completed' && (
                <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 text-sm font-semibold">
                  <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  {game.xp_distributed ? 'Partida encerrada — XP distribuído aos jogadores.' : 'Partida encerrada.'}
                </div>
              )}
              {resolvedStatus === 'expired' && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  Partida expirada — mínimo de jogadores não foi atingido.
                </div>
              )}

              {/* Cancel button — gestor (club) always allowed */}
              {resolvedStatus !== 'completed' && resolvedStatus !== 'expired' && (
                <button
                  onClick={() => setView('cancel')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-semibold border border-red-200 hover:bg-red-100 transition-colors text-sm">
                  <XCircle className="w-4 h-4" /> Cancelar partida
                </button>
              )}
            </div>
          )}

          {/* Cancel view */}
          {!loading && view === 'cancel' && (
            <div className="space-y-4">
              {!cancelDone ? (
                <>
                  <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
                    <p className="font-bold text-red-800 mb-2">Tem certeza que deseja cancelar?</p>
                    <p className="text-sm text-red-700">
                      Esta ação é irreversível. Todos os jogadores serão removidos da partida.
                    </p>
                    {paidPlayers.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-red-200">
                        <p className="text-sm font-semibold text-red-800 mb-2">
                          Reembolsos a processar ({paidPlayers.length} jogador{paidPlayers.length > 1 ? 'es' : ''}):
                        </p>
                        {paidPlayers.map(p => (
                          <div key={p.player_id} className="flex items-center gap-2 py-1">
                            <div className="w-6 h-6 bg-red-200 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-red-800 text-xs font-bold">{initials(p.player_name)}</span>
                            </div>
                            <span className="text-sm text-red-700">{p.player_name}</span>
                            <span className="ml-auto text-sm font-semibold text-red-800">
                              R$ {game!.price_per_player?.toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <p className="text-xs text-red-500 mt-2">O reembolso é processado via Stripe e pode levar até 10 dias úteis.</p>
                      </div>
                    )}
                    {paidPlayers.length === 0 && (
                      <p className="text-sm text-red-600 mt-2">Nenhum jogador pagou — não haverá reembolsos.</p>
                    )}
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer select-none bg-gray-50 rounded-xl p-3 border border-gray-200">
                    <input type="checkbox" checked={cancelConfirmed} onChange={e => setCancelConfirmed(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-red-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-700">
                      Confirmo o cancelamento e autorizo o reembolso dos jogadores
                    </span>
                  </label>

                  {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

                  <button
                    onClick={handleCancel}
                    disabled={!cancelConfirmed || cancelling}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
                    {cancelling
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Processando reembolsos...</>
                      : <><XCircle className="w-5 h-5" /> Cancelar partida e reembolsar</>}
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 rounded-2xl p-5 border border-green-100 text-center">
                    <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
                    <p className="font-bold text-green-800 text-lg">Partida cancelada</p>
                    <p className="text-sm text-green-700 mt-1">
                      {paidPlayers.length > 0
                        ? 'Reembolsos iniciados via Stripe.'
                        : 'Nenhum reembolso necessário.'}
                    </p>
                  </div>

                  {refundResults.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Status dos reembolsos</p>
                      {refundResults.map((r, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="text-sm font-medium text-gray-700">{r.name}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            r.status === 'succeeded' ? 'bg-green-100 text-green-700'
                            : r.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                          }`}>
                            {r.status === 'succeeded' ? 'Reembolsado'
                            : r.status === 'pending' ? 'Pendente'
                            : r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={onClose} className="w-full py-3 rounded-2xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors">
                    Fechar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
