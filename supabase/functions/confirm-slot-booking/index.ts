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
    const { slotId, courtId, userId, price } = await req.json();
    if (!slotId || !userId) throw new Error('slotId e userId são obrigatórios');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Check slot exists and is available
    const { data: slot } = await supabase
      .from('slots')
      .select('id, is_available')
      .eq('id', slotId)
      .single();

    if (!slot) throw new Error('Horário não encontrado.');
    if (!slot.is_available) throw new Error('Este horário já foi reservado.');

    // Block if slot is linked to an active game (open or private)
    // Cancelled open games have is_open=false and booking_id=null — allow those through
    const { data: linkedGame } = await supabase
      .from('games')
      .select('id, is_open, booking_id')
      .eq('slot_id', slotId)
      .maybeSingle();

    if (linkedGame) {
      if (linkedGame.is_open) {
        throw new Error('Este horário tem uma Partida Aberta. Acesse "Jogos Abertos" para participar.');
      } else if (linkedGame.booking_id) {
        // Private game: slot is already booked
        throw new Error('Este horário já está reservado como partida privada. Tente outro horário.');
      }
      // Cancelled open game (is_open=false, booking_id=null) — slot is free, allow through
    }

    // Ensure profile exists (bookings.created_by → profiles.id FK)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      // Auto-create profile from auth user metadata
      const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
      if (authErr || !authData?.user) {
        throw new Error('Usuário não encontrado. Faça login novamente.');
      }

      const authUser = authData.user;
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: userId,
        name: authUser.user_metadata?.full_name ?? authUser.email?.split('@')[0] ?? 'Jogador',
      }, { onConflict: 'id' });

      if (profileErr) {
        throw new Error(`Erro ao criar perfil do usuário: ${profileErr.message}`);
      }
    }

    // Idempotency: check for existing confirmed booking on this slot
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('slot_id', slotId)
      .neq('status', 'cancelled')
      .maybeSingle();

    let bookingId: string | null = existing?.id ?? null;

    if (!existing) {
      const payload: Record<string, unknown> = {
        slot_id: slotId,
        created_by: userId,
        total_price: parseFloat(price) || 0,
        payment_status: 'paid',
        status: 'confirmed',
      };
      if (courtId) payload['court_id'] = courtId;

      const { data: newBooking, error: bookErr } = await supabase
        .from('bookings')
        .insert(payload)
        .select('id')
        .single();

      if (bookErr) throw new Error(`Erro ao criar reserva: ${bookErr.message}`);
      bookingId = newBooking?.id ?? null;
    }

    // Mark slot unavailable
    await supabase.from('slots').update({ is_available: false }).eq('id', slotId);

    return new Response(
      JSON.stringify({ success: true, bookingId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
