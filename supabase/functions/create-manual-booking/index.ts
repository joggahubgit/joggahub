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
    const { type, slotId } = body;

    if (!slotId) throw new Error('slotId é obrigatório');
    if (type !== 'private' && type !== 'open') throw new Error('type deve ser "private" ou "open"');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch slot + court info
    const { data: slot } = await supabase
      .from('slots')
      .select('id, is_available, court_id, start_time, end_time')
      .eq('id', slotId)
      .single();

    if (!slot) throw new Error('Horário não encontrado.');
    if (!slot.is_available) throw new Error('Horário já está ocupado.');

    const { data: court } = await supabase
      .from('courts')
      .select('id, sport_type, venue_id, price')
      .eq('id', slot.court_id)
      .single();

    if (type === 'private') {
      const { userId, price } = body;
      if (!userId) throw new Error('userId é obrigatório para reserva privada');

      // 1. Create booking — always pending; player pays through the app
      const { data: bookingData, error: bookErr } = await supabase.from('bookings').insert({
        slot_id: slotId,
        created_by: userId,
        total_price: price ?? 0,
        payment_status: 'pending',
        status: 'confirmed',
      }).select('id').single();
      if (bookErr) throw new Error(bookErr.message);

      // 2. Create game linked to booking so player sees it on Home and gestor sees participants
      const { data: gameData, error: gameErr } = await supabase.from('games').insert({
        organizer_id: userId,
        court_id: slot.court_id,
        slot_id: slotId,
        booking_id: bookingData.id,
        scheduled_at: slot.start_time,
        is_open: false,
        status: 'confirmed_booking',
        max_players: 10,
        current_players: 1,
        price_per_player: price ?? 0,
        sport_type: court?.sport_type ?? 'football',
        xp_distributed: false,
      }).select('id').single();
      if (gameErr) throw new Error(gameErr.message);

      // 3. Add player to game_players
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', userId).single();
      await supabase.from('game_players').insert({
        game_id: gameData.id,
        player_id: userId,
        player_name: profile?.name ?? 'Jogador',
        paid: false,
      });

      await supabase.from('slots').update({ is_available: false }).eq('id', slotId);

      return new Response(JSON.stringify({ success: true, type: 'private' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (type === 'open') {
      const { organizerId, maxPlayers, pricePerPlayer } = body;
      if (!organizerId) throw new Error('organizerId é obrigatório para partida aberta');
      if (!maxPlayers || maxPlayers < 2) throw new Error('maxPlayers deve ser no mínimo 2');

      const { error: gameErr } = await supabase.from('games').insert({
        organizer_id: organizerId,
        court_id: slot.court_id,
        slot_id: slotId,
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

      await supabase.from('slots').update({ is_available: false }).eq('id', slotId);

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
