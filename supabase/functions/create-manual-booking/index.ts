import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Gestor creates a private booking, an open game or a block on one of the
// venue's courts, for any duration. Pre-created 30-min slots inside the
// requested range are reused (the first one carries the booking) and all of
// them are locked, so players can't book over it; when there's no slot at
// the start time, one spanning the whole range is created. The game stores
// its real end in scheduled_end_at, which the agenda and the cancellation
// paths use to free the whole range again.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mirrors SPORT_PLAYER_RULES in src/app/lib/gameConfig.ts — keep both in sync.
const SPORT_MAX_PLAYERS: Record<string, number> = {
  football: 18, society: 18, futsal: 18, futevolei: 4,
};
function maxPlayersForSport(sport: string | null | undefined): number {
  return SPORT_MAX_PLAYERS[sport ?? ''] ?? 8;
}

const MAX_DURATION_MIN = 6 * 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** "2026-10-07T12:00:00" (wall-clock, no timezone) from any stored/requested form */
function naive(ts: string) {
  return ts.substring(0, 19);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── JWT verification ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { type, slotId } = body;

    if (!['private', 'open', 'block'].includes(type)) {
      throw new Error('type deve ser "private", "open" ou "block"');
    }
    if (!slotId && !(body.courtId && body.startTime && body.endTime)) {
      throw new Error('Forneça slotId ou (courtId + startTime + endTime)');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Resolve court + time range ──
    let courtId: string = body.courtId;
    let startTime: string;
    let endTime: string;
    if (slotId) {
      // Fixed-length session slot (CreateAvailability): its own range
      const { data: sessionSlot } = await supabase
        .from('slots').select('court_id, start_time, end_time').eq('id', slotId).single();
      if (!sessionSlot) throw new Error('Horário não encontrado.');
      courtId = sessionSlot.court_id;
      startTime = naive(sessionSlot.start_time);
      endTime = naive(sessionSlot.end_time);
    } else {
      startTime = naive(body.startTime);
      endTime = naive(body.endTime);
    }

    const durationMin = (new Date(`${endTime}Z`).getTime() - new Date(`${startTime}Z`).getTime()) / 60_000;
    if (!(durationMin > 0)) throw new Error('O horário de término precisa ser depois do início.');
    if (durationMin > MAX_DURATION_MIN) throw new Error('Duração máxima de 6 horas.');

    // ── Authorization: only the admin of the court's venue ──
    const { data: court } = await supabase
      .from('courts').select('id, sport_type, venue_id, venues(admin_id)').eq('id', courtId).single();
    if (!court) throw new Error('Quadra não encontrada.');
    if ((court as any).venues?.admin_id !== user.id) return json({ error: 'Sem permissão para esta quadra.' }, 403);

    // ── Every slot overlapping the range must be free ──
    const { data: overlapping, error: overlapErr } = await supabase
      .from('slots')
      .select('id, start_time, is_available')
      .eq('court_id', courtId)
      .lt('start_time', endTime)
      .gt('end_time', startTime);
    if (overlapErr) throw new Error(overlapErr.message);
    if ((overlapping ?? []).some(s => !s.is_available)) {
      throw new Error('Parte desse período já está ocupada. Escolha outro horário ou uma duração menor.');
    }

    // ── Slot that carries the booking: reuse the one starting at startTime, else create it ──
    let effectiveSlotId: string;
    const startSlot = (overlapping ?? []).find(s => naive(s.start_time) === startTime);
    if (startSlot) {
      effectiveSlotId = startSlot.id;
    } else {
      const { data: newSlot, error: slotErr } = await supabase
        .from('slots')
        .insert({ court_id: courtId, start_time: startTime, end_time: endTime, is_available: false })
        .select('id')
        .single();
      if (slotErr || !newSlot) throw new Error(`Erro ao criar horário: ${slotErr?.message ?? 'desconhecido'}`);
      effectiveSlotId = newSlot.id;
    }

    // Lock the whole range (reused start slot + every other slot inside it)
    const lockRange = async () => {
      const ids = [effectiveSlotId, ...(overlapping ?? []).map(s => s.id)];
      await supabase.from('slots').update({ is_available: false }).in('id', [...new Set(ids)]);
    };

    // ── Block only ──
    if (type === 'block') {
      await lockRange();
      return json({ success: true, type: 'block' });
    }

    // ── Private booking (player pays in the app; unpaid after 2h → cron cancels) ──
    if (type === 'private') {
      const { userId } = body;
      if (!userId) throw new Error('userId é obrigatório para reserva privada');
      const price = Math.round((Number(body.price) || 0) * 100) / 100;

      const { data: bookingData, error: bookErr } = await supabase
        .from('bookings')
        .insert({
          slot_id: effectiveSlotId,
          created_by: userId,
          court_id: courtId,
          total_price: price,
          payment_status: 'pending',
          status: 'confirmed',
        })
        .select('id')
        .single();
      if (bookErr) throw new Error(bookErr.message);

      const { data: gameData, error: gameErr } = await supabase
        .from('games')
        .insert({
          organizer_id: userId,
          created_by: userId,
          court_id: courtId,
          slot_id: effectiveSlotId,
          booking_id: bookingData.id,
          scheduled_at: startTime,
          scheduled_end_at: endTime,
          is_open: false,
          status: 'confirmed_booking',
          max_players: maxPlayersForSport(court.sport_type),
          current_players: 1,
          price_per_player: price,
          court_price: price,
          sport_type: court.sport_type ?? 'football',
          xp_distributed: false,
        })
        .select('id')
        .single();
      if (gameErr) throw new Error(gameErr.message);

      const { data: profile } = await supabase
        .from('profiles').select('name').eq('id', userId).single();
      await supabase.from('game_players').insert({
        game_id: gameData.id,
        player_id: userId,
        player_name: profile?.name ?? 'Jogador',
        paid: false,
      });

      await lockRange();
      return json({ success: true, type: 'private' });
    }

    // ── Open game ──
    const { organizerId, maxPlayers, pricePerPlayer } = body;
    if (!organizerId) throw new Error('organizerId é obrigatório para partida aberta');
    if (!maxPlayers || maxPlayers < 2) throw new Error('maxPlayers deve ser no mínimo 2');

    const { error: gameErr } = await supabase.from('games').insert({
      organizer_id: organizerId,
      created_by: organizerId,
      court_id: courtId,
      slot_id: effectiveSlotId,
      scheduled_at: startTime,
      scheduled_end_at: endTime,
      is_open: true,
      status: 'scheduled',
      max_players: maxPlayers,
      current_players: 0,
      price_per_player: pricePerPlayer ?? 0,
      sport_type: court.sport_type ?? 'football',
      xp_distributed: false,
    });
    if (gameErr) throw new Error(gameErr.message);

    await lockRange();
    return json({ success: true, type: 'open' });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});
