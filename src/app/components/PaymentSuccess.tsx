import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, Share2, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { notify, notifyGamePlayers } from '@/app/lib/notify';
import { getMinPlayersForSport } from '@/app/lib/gameConfig';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const calledRef = useRef(false);

  const gameId = params.get('gameId') ?? '';
  const playerId = params.get('playerId') ?? '';
  const playerName = params.get('playerName') ?? '';
  const mode = params.get('mode') ?? 'join_self';
  const slotId = params.get('slotId') ?? '';
  const courtId = params.get('courtId') ?? '';
  const userId = params.get('userId') ?? '';
  const courtName = params.get('courtName') ?? '';
  const venueName = params.get('venueName') ?? '';
  const date = params.get('date') ?? '';
  const time = params.get('time') ?? '';
  const endTime = params.get('endTime') ?? '';
  // Dynamic slot params
  const startTime = params.get('startTime') ?? '';
  const endTimeISO = params.get('endTimeISO') ?? '';
  const isDynamic = params.get('isDynamic') === 'true';
  const price = params.get('price') ?? '';
  // organizer / private_game extras
  const maxPlayers = Number(params.get('maxPlayers') ?? '4');
  const pricePerPlayer = Number(params.get('pricePerPlayer') ?? '0');
  const courtSport = params.get('courtSport') ?? '';
  // private_game only
  const payMode = params.get('payMode') ?? 'full';
  const courtPrice = Number(params.get('courtPrice') ?? '0');
  const organizerShare = Number(params.get('organizerShare') ?? '0');
  const sessionId = params.get('session_id') ?? '';
  // organizer open game
  const totalPrice = Number(params.get('totalPrice') ?? '0');

  const [createdGameId, setCreatedGameId] = useState('');

  const [privateGameId, setPrivateGameId] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    async function confirm() {
      try {
        // ── SLOT BOOKING MODE ──
        if (mode === 'slot') {
          if (!slotId || !userId) {
            setError(`Parâmetros inválidos. slotId="${slotId}" userId="${userId}"`);
            return;
          }

          const { data, error: fnErr } = await supabase.functions.invoke('confirm-slot-booking', {
            body: { slotId, courtId, userId, price },
          });

          if (fnErr) {
            const body = await (fnErr as any).context?.json?.().catch(() => null);
            const msg = body?.error ?? fnErr.message ?? 'Erro desconhecido';
            console.error('[PaymentSuccess] confirm-slot-booking error:', fnErr, body);
            setError(`Erro ao confirmar: ${msg}`);
            return;
          }
          if (data?.error) {
            console.error('[PaymentSuccess] confirm-slot-booking data error:', data.error);
            setError(data.error);
            return;
          }

          console.log('[PaymentSuccess] slot booking confirmed:', data);
          setDone(true);
          return;
        }

        // ── PRIVATE GAME MODE ──
        if (mode === 'private_game') {
          if (!userId) {
            setError('Parâmetros inválidos: userId ausente.');
            return;
          }

          // 1. Confirm slot booking — edge function creates slot if dynamic (bypasses RLS)
          const confirmBody: Record<string, string> = { userId, price };
          if (slotId) {
            confirmBody.slotId = slotId;
            if (courtId) confirmBody.courtId = courtId;
          } else if (isDynamic && startTime && endTimeISO && courtId) {
            confirmBody.courtId = courtId;
            confirmBody.startTime = startTime;
            confirmBody.endTime = endTimeISO;
          } else {
            setError('Parâmetros inválidos: slotId ou startTime/endTime ausente.');
            return;
          }

          const { data: bookingData, error: bookingErr } = await supabase.functions.invoke('confirm-slot-booking', {
            body: confirmBody,
          });

          const effectiveSlotId: string = bookingData?.slotId ?? slotId ?? '';

          if (bookingErr) {
            const body = await (bookingErr as any).context?.json?.().catch(() => null);
            throw new Error(body?.error ?? bookingErr.message ?? 'Erro ao confirmar reserva');
          }
          if (bookingData?.error) throw new Error(bookingData.error);

          const bookingId: string | null = bookingData?.bookingId ?? null;

          // 2. Compute scheduled_at from date + time (YYYY-MM-DD + HH:MM)
          let scheduledAt: string | null = null;
          if (date && time) {
            scheduledAt = `${date}T${time}:00`;
          }

          // 3. Create private game record
          const { data: gameRow, error: gameErr } = await supabase
            .from('games')
            .insert({
              organizer_id: userId,
              created_by: userId,
              court_id: courtId || null,
              slot_id: effectiveSlotId || null,
              booking_id: bookingId,
              scheduled_at: scheduledAt,
              scheduled_end_at: (date && endTime) ? `${date}T${endTime}:00` : null,
              max_players: payMode === 'split' ? 18 : maxPlayers,
              current_players: 1,
              price_per_player: payMode === 'split' ? courtPrice / 10 : 0,
              court_price: courtPrice || null,
              pay_mode: payMode ?? 'full',
              sport_type: courtSport || null,
              is_open: false,
              status: 'confirmed_booking',
              game_type: 'casual',
              ...(payMode === 'split' && sessionId ? { stripe_session_id: sessionId } : {}),
            })
            .select('id')
            .single();

          if (gameErr) {
            console.error('[PaymentSuccess] private game insert error:', gameErr);
            // Booking is already confirmed, but surface the error so the user knows
            setError(`Reserva confirmada, mas houve um erro ao criar a partida: ${gameErr.message}. Contacte o suporte.`);
            return;
          }

          // 4. Add organizer to game_players
          if (gameRow?.id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('name')
              .eq('id', userId)
              .single();

            await supabase.from('game_players').insert({
              game_id: gameRow.id,
              player_id: userId,
              player_name: profile?.name ?? 'Organizador',
              paid: true,
            }).then(() => {});

            setPrivateGameId(gameRow.id);
          }

          setDone(true);
          return;
        }

        // ── ORGANIZER: create game after confirmed payment ──
        if (mode === 'organizer') {
          const scheduledAt = date && time
            ? new Date(`${date}T${time}:00`).toISOString()
            : null;

          const { data: gameRow, error: gameErr } = await supabase
            .from('games')
            .insert({
              organizer_id: playerId,
              created_by: playerId,
              court_id: courtId || null,
              slot_id: slotId || null,
              scheduled_at: scheduledAt,
              max_players: maxPlayers,
              current_players: 1,
              price_per_player: pricePerPlayer,
              court_price: totalPrice || null,
              sport_type: courtSport || null,
              is_open: true,
              game_type: 'casual',
              status: 'scheduled',
            })
            .select('id')
            .single();

          if (gameErr) {
            setError(`Erro ao criar partida: ${gameErr.message}`);
            return;
          }

          // Mark slot as unavailable
          if (slotId) {
            await supabase.from('slots').update({ is_available: false }).eq('id', slotId);
          }

          // Add organizer to game_players
          const { error: orgInsertErr } = await supabase.from('game_players').insert({
            game_id: gameRow!.id,
            player_id: playerId,
            player_name: playerName,
            paid: true,
          });

          if (orgInsertErr && orgInsertErr.code !== '23505') {
            setError(`Erro ao registrar organizador: ${orgInsertErr.message}`);
            return;
          }

          setCreatedGameId(gameRow!.id);
          setDone(true);
          return;
        }

        // ── PAY RESERVATION MODE — organizer paying for a gestor-created booking ──
        if (mode === 'pay_reservation') {
          // Mark player as paid in game_players (row already exists, just flip paid flag)
          const { error: updateErr } = await supabase
            .from('game_players')
            .update({ paid: true })
            .eq('game_id', gameId)
            .eq('player_id', playerId);

          if (updateErr) {
            setError(`Erro ao confirmar pagamento: ${updateErr.message}`);
            return;
          }

          // Also mark the linked booking as paid
          const { data: g } = await supabase
            .from('games')
            .select('booking_id')
            .eq('id', gameId)
            .single();

          if (g?.booking_id) {
            await supabase
              .from('bookings')
              .update({ payment_status: 'paid' })
              .eq('id', g.booking_id);
          }

          setCreatedGameId(gameId);
          setDone(true);
          return;
        }

        // Fetch game to get current count + sport_type for confirmation check
        const { data: game } = await supabase
          .from('games')
          .select('current_players, max_players, organizer_id, sport_type, status, is_open')
          .eq('id', gameId)
          .single();

        if (!game) { setError('Partida não encontrada.'); return; }
        if (game.status === 'expired' || game.status === 'cancelled') { setError('Esta partida foi encerrada ou cancelada. Não é possível confirmar o pagamento.'); return; }
        if (game.current_players >= game.max_players) { setError('Partida já está completa.'); return; }

        // For split private game joiners: resolve payment_intent_id from Stripe session
        let stripePaymentIntentId: string | null = null;
        if (payMode === 'split' && sessionId) {
          const { data: siData } = await supabase.functions.invoke('get-stripe-session', {
            body: { sessionId },
          });
          stripePaymentIntentId = siData?.paymentIntentId ?? null;
        }

        // Add player to game_players
        const { error: insertErr } = await supabase.from('game_players').insert({
          game_id: gameId,
          player_id: playerId,
          player_name: playerName,
          paid: true,
          ...(stripePaymentIntentId ? { stripe_payment_intent_id: stripePaymentIntentId } : {}),
        });

        if (insertErr && insertErr.code !== '23505') {
          setError(`Erro ao registrar jogador: ${insertErr.message}`);
          return;
        }

        const newCount = game.current_players + 1;

        // Check if this player joining triggers game confirmation
        const minPlayers = getMinPlayersForSport(game.sport_type ?? '');
        const shouldConfirm =
          game.status === 'scheduled' &&
          newCount >= minPlayers;

        // Increment current_players (and optionally confirm the game)
        await supabase.from('games')
          .update({
            current_players: newCount,
            ...(shouldConfirm && { status: 'confirmed_booking' }),
          })
          .eq('id', gameId);

        // Notify all existing players (except the one who just joined)
        await notifyGamePlayers(
          gameId,
          playerId,
          'game_joined',
          'Novo jogador entrou!',
          `${playerName} entrou na partida. Agora são ${newCount}/${game.max_players} jogadores.`,
        );

        // Notify organizer of confirmation when minimum reached
        if (shouldConfirm && game.organizer_id) {
          await notify(
            game.organizer_id,
            'game_confirmed',
            'Reserva confirmada!',
            `Sua partida atingiu o mínimo de jogadores e está confirmada.`,
            gameId,
          );
        }

        // Notify the player (if added by organizer)
        if (mode === 'join_other') {
          await notify(playerId, 'game_joined', 'Você foi adicionado a uma partida!',
            `Seu pagamento foi confirmado e você está inscrito na partida.`, gameId);
        }

        setDone(true);
      } catch (e: any) {
        setError(e.message ?? 'Erro inesperado.');
      }
    }

    if (mode === 'slot') confirm();
    else if (mode === 'private_game') confirm();
    else if (mode === 'organizer' && playerId) confirm();
    else if (mode === 'pay_reservation' && playerId && gameId) confirm();
    else if (playerId && gameId) confirm();
    else setError('Parâmetros inválidos.');
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-500 font-semibold mb-4">{error}</p>
        <button
          onClick={() => navigate(
            mode === 'slot' || mode === 'private_game' ? '/home' : `/open-game/${gameId}`
          )}
          className="text-violet-600 font-semibold"
        >
          Voltar
        </button>
      </div>
    );
  }

  if (!done) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-violet-600" />
        <p className="text-gray-600 font-semibold">Confirmando pagamento...</p>
      </div>
    );
  }

  // ── SLOT BOOKING SUCCESS ──
  if (mode === 'slot') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 max-w-sm w-full space-y-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-9 h-9 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Reserva confirmada!</h1>
            <p className="text-gray-500 text-sm">Seu horário está garantido. Prepare-se para jogar!</p>
          </div>
          {(courtName || venueName || time || date) && (
            <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-100 space-y-2 text-sm">
              {courtName && <p className="font-semibold text-gray-900">{courtName}</p>}
              {venueName && <p className="text-gray-500">{venueName}</p>}
              {date && <p className="text-gray-600 capitalize">{date}</p>}
              {time && <p className="text-gray-600">{time}</p>}
              {price && (
                <p className="font-bold text-violet-600 pt-1 border-t border-gray-200">
                  R$ {parseFloat(price).toFixed(2)} pago
                </p>
              )}
            </div>
          )}
          <button
            onClick={() => navigate('/home', { replace: true })}
            className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold hover:bg-violet-700 transition-colors"
          >
            Ir para o início
          </button>
        </div>
      </div>
    );
  }

  // ── PRIVATE GAME SUCCESS ──
  if (mode === 'private_game') {
    const shareUrl = privateGameId
      ? `${window.location.origin}/open-game/${privateGameId}`
      : null;

    function handleShare() {
      if (!shareUrl) return;
      if (navigator.share) {
        navigator.share({ title: 'Partida privada no JoggaHub', url: shareUrl }).catch(() => {});
      } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        });
      }
    }

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 max-w-sm w-full space-y-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-9 h-9 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Partida criada!</h1>
            <p className="text-gray-500 text-sm">
              {payMode === 'split'
                ? 'Compartilhe o link abaixo para os outros jogadores confirmarem o pagamento deles.'
                : 'Sua partida privada está confirmada. Compartilhe com seus amigos!'}
            </p>
          </div>

          {(courtName || venueName || time || date) && (
            <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-100 space-y-2 text-sm">
              {courtName && <p className="font-semibold text-gray-900">{courtName}</p>}
              {venueName && <p className="text-gray-500">{venueName}</p>}
              {date && <p className="text-gray-600 capitalize">{date}</p>}
              {time && <p className="text-gray-600">{time}{endTime ? ` – ${endTime}` : ''}</p>}
              <p className="text-gray-500 pt-1 border-t border-gray-200">{maxPlayers} jogadores · {payMode === 'split' ? 'Divisão' : 'Você pagou tudo'}</p>
              {price && (
                <p className="font-bold text-violet-600">
                  R$ {parseFloat(price).toFixed(2)} pago
                </p>
              )}
            </div>
          )}

          {shareUrl && (
            <button
              onClick={handleShare}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-violet-500 text-violet-700 font-bold hover:bg-violet-50 transition-colors"
            >
              {copied ? <><Copy className="w-5 h-5" /> Link copiado!</> : <><Share2 className="w-5 h-5" /> Compartilhar partida</>}
            </button>
          )}

          <div className="space-y-2">
            {privateGameId && (
              <button
                onClick={() => navigate(`/open-game/${privateGameId}`, {
                  replace: true,
                  state: {
                    courtName,
                    courtSport,
                    venueName,
                    date,
                    time,
                    endTime,
                    maxPlayers,
                    pricePerPlayer: 0,
                    organizerName: '',
                  },
                })}
                className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold hover:bg-violet-700 transition-colors"
              >
                Ver minha partida
              </button>
            )}
            <button
              onClick={() => navigate('/home', { replace: true })}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-2xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Ir para o início
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── GAME SUCCESS ──
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 max-w-sm w-full">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-9 h-9 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Pagamento confirmado!</h1>
        <p className="text-gray-500 text-sm mb-8">
          {mode === 'organizer'
            ? 'Sua partida foi criada e está aberta para outros jogadores!'
            : mode === 'join_other'
            ? `${playerName} foi adicionado à partida com sucesso.`
            : 'Você está inscrito na partida. Boa sorte!'}
        </p>
        <button
          onClick={() => navigate(`/open-game/${createdGameId || gameId}`, { replace: true })}
          className="w-full bg-violet-600 text-white py-4 rounded-2xl font-bold hover:bg-violet-700 transition-colors"
        >
          Ver partida
        </button>
      </div>
    </div>
  );
}
