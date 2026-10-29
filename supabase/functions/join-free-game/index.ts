// A player joins a game that costs them nothing: a private game whose organizer
// paid the full court ("Pagar tudo"), or a game priced at zero. A participant
// (usually the organizer) can also add someone else (targetPlayerId).
// Replaces the browser inserting into game_players directly.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CAPTURE_CUTOFF_HOURS, UserError, corsHeaders, json, playerRule } from '../_shared/checkout.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);
    const userId = user.id;

    const { gameId, team: rawTeam, targetPlayerId } = await req.json();
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: game } = await db.from('games')
      .select('id, status, is_open, booking_id, pay_mode, max_players, sport_type, slot_id, scheduled_at, organizer_id, price_per_player')
      .eq('id', gameId).maybeSingle();
    if (!game) throw new UserError('Partida não encontrada.');
    const isFreePrivate = !game.is_open && !!game.booking_id && game.pay_mode === 'full';
    const isZeroPrice = Number(game.price_per_player) === 0;
    if (!isFreePrivate && !isZeroPrice) throw new UserError('Esta partida exige pagamento para entrar.');
    if (game.status !== 'scheduled' && game.status !== 'confirmed_booking') {
      throw new UserError('Esta partida não aceita novos jogadores.');
    }

    // Same join cutoff as paid joins.
    let start: string | null = game.scheduled_at;
    if (game.slot_id) {
      const { data: slot } = await db.from('slots').select('start_time').eq('id', game.slot_id).maybeSingle();
      start = slot?.start_time ?? start;
    }
    if (start && Date.now() >= new Date(start).getTime() - CAPTURE_CUTOFF_HOURS * 3600_000) {
      throw new UserError('As entradas para esta partida já fecharam.');
    }

    const { data: roster } = await db.from('game_players').select('player_id, team').eq('game_id', gameId);
    const inRoster = (id: string) => (roster ?? []).some((p: { player_id: string }) => p.player_id === id);

    // Adding someone else: only the organizer or a current participant may do it.
    const playerId: string = targetPlayerId ?? userId;
    const addingOther = playerId !== userId;
    if (addingOther) {
      if (userId !== game.organizer_id && !inRoster(userId)) return json({ error: 'Forbidden' }, 403);
      const { data: target } = await db.from('profiles').select('id').eq('id', playerId).maybeSingle();
      if (!target) throw new UserError('Jogador não encontrado.');
    }
    if (inRoster(playerId)) return json({ gameId, alreadyIn: true });
    if ((roster?.length ?? 0) >= game.max_players) throw new UserError('A partida já está completa.');

    let team: 'a' | 'b' | null = null;
    if (game.sport_type === 'futevolei') {
      team = rawTeam === 'b' ? 'b' : 'a';
      const perTeam = Math.floor(game.max_players / 2);
      const inTeam = (roster ?? []).filter((p: { team: string | null }) => (p.team ?? 'a') === team).length;
      if (inTeam >= perTeam) throw new UserError(`O time ${team.toUpperCase()} já está completo.`);
    }

    const { data: profile } = await db.from('profiles').select('name').eq('id', playerId).maybeSingle();
    const name = profile?.name || 'Jogador';
    const { error: insErr } = await db.from('game_players').insert({
      game_id: gameId, player_id: playerId, player_name: name, paid: true, ...(team ? { team } : {}),
    });
    if (insErr && insErr.code !== '23505') throw new Error(insErr.message);

    const { count } = await db.from('game_players').select('id', { count: 'exact', head: true }).eq('game_id', gameId);
    const total = count ?? 0;
    const confirm = game.status === 'scheduled' && total >= playerRule(game.sport_type ?? '').min;
    await db.from('games').update({ current_players: total, ...(confirm ? { status: 'confirmed_booking' } : {}) }).eq('id', gameId);

    if (addingOther) {
      await db.from('notifications').insert({
        user_id: playerId, type: 'game_joined', title: 'Você foi adicionado a uma partida!',
        message: 'Você foi inscrito na partida.', game_id: gameId,
      });
    }
    const others = (roster ?? []).map((p: { player_id: string }) => p.player_id).filter((id: string) => id !== playerId);
    if (others.length) {
      await db.from('notifications').insert(others.map((uid: string) => ({
        user_id: uid, type: 'game_joined', title: 'Novo jogador entrou!',
        message: `${name} entrou na partida. Agora são ${total}/${game.max_players} jogadores.`, game_id: gameId,
      })));
    }

    return json({ gameId, currentPlayers: total, team });
  } catch (error) {
    if (!(error instanceof UserError)) console.error('[join-free-game]', error);
    return json({ error: error instanceof Error ? error.message : 'Erro ao entrar na partida' }, 400);
  }
});
