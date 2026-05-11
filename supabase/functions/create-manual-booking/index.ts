import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type, slotId, courtId, startTime, endTime } = body;

    if (!['private', 'open', 'block'].includes(type)) {
      throw new Error('type deve ser "private", "open" ou "block"');
    }
    if (!slotId && !(courtId && startTime && endTime)) {
      throw new Error('Forneça slotId ou (courtId + startTime + endTime)');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let effectiveSlotId = slotId;
    let slot: Record<string, unknown> | null = null;

    if (slotId) {
      // ── Pre-created slot ──
      const { data } = await supabase
        .from('slots')
        .select('id, is_available, court_id, start_time, end_time')
        .eq('id', slotId)
        .single();

      if (!data) throw new Error('Horário não encontrado.');
      if (!data.is_available) throw new Error('Horário já está ocupado.');
      slot = data;
    } else {
      // ── Dynamic slot: conflict check → create ──
      const { data: conflicts } = await supabase
        .from('slots')
        .select('id')
        .eq('court_id', courtId)
        .lt('start_time', endTime)
        .gt('end_time', startTime)
        .eq('is_available', false);

      if (conflicts && conflicts.length > 0) {
        throw new Error('Este horário já está ocupado. Escolha outro horário.');
      }

      const { data: newSlot, error: slotErr } = await supabase
        .from('slots')
        .insert({
          court_id: courtId,
          start_time: startTime,
          end_time: endTime,
          is_available: false,
        })
        .select('id, court_id, start_time, end_time')
        .single();

      if (slotErr || !newSlot) {
        throw new Error(`Erro ao criar horário: ${slotErr?.message ?? 'desconhecido'}`);
      }
      effectiveSlotId = newSlot.id;
      slot = newSlot;
    }

    // ── Block only: done ──
    if (type === 'block') {
      if (slotId) {
        await supabase.from('slots').update({ is_available: false }).eq('id', effectiveSlotId);
      }
      return new Response(JSON.stringify({ success: true, type: 'block' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch court for sport_type ──
    const { data: court } = await supabase
      .from('courts')
      .select('id, sport_type, venue_id, price')
      .eq('id', slot.court_id)
      .single();

    // ── Private booking ──
    if (type === 'private') {
      const { userId, price } = body;
      if (!userId) throw new Error('userId é obrigatório para reserva privada');

      const { data: bookingData, error: bookErr } = await supabase
        .from('bookings')
        .insert({
          slot_id: effectiveSlotId,
          created_by: userId,
          total_price: price ?? 0,
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
          court_id: slot.court_id,
          slot_id: effectiveSlotId,
          booking_id: bookingData.id,
          scheduled_at: slot.start_time,
          is_open: false,
          status: 'confirmed_booking',
          max_players: 10,
          current_players: 1,
          price_per_player: price ?? 0,
          sport_type: court?.sport_type ?? 'football',
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

      if (slotId) {
        await supabase.from('slots').update({ is_available: false }).eq('id', effectiveSlotId);
      }

      return new Response(JSON.stringify({ success: true, type: 'private' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Open game ──
    if (type === 'open') {
      const { organizerId, maxPlayers, pricePerPlayer } = body;
      if (!organizerId) throw new Error('organizerId é obrigatório para partida aberta');
      if (!maxPlayers || maxPlayers < 2) throw new Error('maxPlayers deve ser no mínimo 2');

      const { error: gameErr } = await supabase.from('games').insert({
        organizer_id: organizerId,
        court_id: slot.court_id,
        slot_id: effectiveSlotId,
        scheduled_at: slot.start_time,
        is_open: true,
        status: 'scheduled',
        max_players: maxPlayers,
        current_players: 0,
        price_per_player: pricePerPlayer ?? 0,
        sport_type: court?.sport_type ?? 'football',
        xp_distributed: false,
      });
      if (gameErr) throw new Error(gameErr.message);

      if (slotId) {
        await supabase.from('slots').update({ is_available: false }).eq('id', effectiveSlotId);
      }

      return new Response(JSON.stringify({ success: true, type: 'open' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
