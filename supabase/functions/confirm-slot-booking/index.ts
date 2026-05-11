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
    // ── JWT verification ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    // userId comes from the verified JWT — not from the request body
    const userId = user.id;

    const { slotId, courtId, price, startTime, endTime } = await req.json();
    if (!slotId && !(courtId && startTime && endTime)) {
      throw new Error('Forneça slotId ou (courtId + startTime + endTime)');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let effectiveSlotId = slotId;

    // ── Dynamic slot: create it now (service role bypasses RLS) ──
    if (!slotId && courtId && startTime && endTime) {
      // Conflict check: any non-available slot overlapping this window
      const { data: conflicts } = await supabase
        .from('slots')
        .select('id')
        .eq('court_id', courtId)
        .lt('start_time', endTime)
        .gt('end_time', startTime)
        .eq('is_available', false);

      if (conflicts && conflicts.length > 0) {
        throw new Error('Este horário acabou de ser reservado. Por favor, escolha outro horário.');
      }

      const { data: newSlot, error: slotErr } = await supabase
        .from('slots')
        .insert({
          court_id: courtId,
          start_time: startTime,
          end_time: endTime,
          is_available: false,
          price_override: parseFloat(price) || null,
        })
        .select('id')
        .single();

      if (slotErr || !newSlot) {
        throw new Error(`Erro ao criar horário: ${slotErr?.message ?? 'Erro desconhecido'}`);
      }
      effectiveSlotId = newSlot.id;
    }

    // ── Pre-created slot: check it still exists and is available ──
    if (slotId) {
      const { data: slot } = await supabase
        .from('slots')
        .select('id, is_available')
        .eq('id', effectiveSlotId)
        .single();

      if (!slot) throw new Error('Horário não encontrado.');
      if (!slot.is_available) throw new Error('Este horário já foi reservado.');

      // Block if slot is linked to an active game
      const { data: linkedGame } = await supabase
        .from('games')
        .select('id, is_open, booking_id')
        .eq('slot_id', effectiveSlotId)
        .not('status', 'in', '("expired","cancelled")')
        .maybeSingle();

      if (linkedGame) {
        if (linkedGame.is_open) {
          throw new Error('Este horário tem uma Partida Aberta. Acesse "Jogos Abertos" para participar.');
        } else if (linkedGame.booking_id) {
          throw new Error('Este horário já está reservado como partida privada. Tente outro horário.');
        }
      }
    }

    // ── Ensure profile exists ──
    const { data: profile } = await supabase
      .from('profiles').select('id').eq('id', userId).maybeSingle();

    if (!profile) {
      const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
      if (authErr || !authData?.user) throw new Error('Usuário não encontrado. Faça login novamente.');

      const authUser = authData.user;
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: userId,
        name: authUser.user_metadata?.full_name ?? authUser.email?.split('@')[0] ?? 'Jogador',
      }, { onConflict: 'id' });

      if (profileErr) throw new Error(`Erro ao criar perfil: ${profileErr.message}`);
    }

    // ── Idempotency: check for existing booking on this slot ──
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('slot_id', effectiveSlotId)
      .neq('status', 'cancelled')
      .maybeSingle();

    let bookingId: string | null = existing?.id ?? null;

    if (!existing) {
      const payload: Record<string, unknown> = {
        slot_id: effectiveSlotId,
        created_by: userId,
        total_price: parseFloat(price) || 0,
        payment_status: 'paid',
        status: 'confirmed',
      };
      if (courtId) payload['court_id'] = courtId;

      const { data: newBooking, error: bookErr } = await supabase
        .from('bookings').insert(payload).select('id').single();

      if (bookErr) throw new Error(`Erro ao criar reserva: ${bookErr.message}`);
      bookingId = newBooking?.id ?? null;
    }

    // ── Mark slot unavailable ──
    await supabase.from('slots').update({ is_available: false }).eq('id', effectiveSlotId);

    return new Response(
      JSON.stringify({ success: true, bookingId, slotId: effectiveSlotId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
