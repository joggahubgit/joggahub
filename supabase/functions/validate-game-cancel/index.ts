/**
 * validate-game-cancel
 *
 * Validates whether a cancellation request is allowed given the 12-hour window rule.
 *
 * Rules:
 *   - cancelledBy = 'player': blocked within 12h of game start time
 *   - cancelledBy = 'club':   always allowed
 *
 * Returns: { allowed: boolean, reason?: string }
 *
 * Called by:
 *   - Player leaving a game (frontend OpenGamePage — handleLeaveAsOrganizer / handleLeaveAsPlayer)
 *   - Organizer cancelling a game via the UI (before calling cancel-game edge function)
 *
 * Note: The actual cancellation (Stripe refunds, notifications) is still handled
 * by cancel-game / cancel-booking edge functions. This function only validates permission.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Hours before game start after which players can no longer self-cancel. */
const PLAYER_CANCEL_CUTOFF_HOURS = 12;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { gameId, cancelledBy } = await req.json() as {
      gameId: string;
      cancelledBy: 'player' | 'club';
    };

    if (!gameId) {
      return respond(400, { allowed: false, reason: 'gameId is required' });
    }

    // Club can always cancel
    if (cancelledBy === 'club') {
      return respond(200, { allowed: true });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch the game's slot to get start_time
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('slot_id, status')
      .eq('id', gameId)
      .single();

    if (gameErr || !game) {
      return respond(404, { allowed: false, reason: 'Game not found' });
    }

    // If game is already cancelled/completed/expired, disallow
    if (['completed', 'expired'].includes(game.status ?? '')) {
      return respond(200, { allowed: false, reason: 'Game is already finished' });
    }

    if (!game.slot_id) {
      // No slot linked — fall back to allowing (can't determine time)
      return respond(200, { allowed: true });
    }

    const { data: slot, error: slotErr } = await supabase
      .from('slots')
      .select('start_time')
      .eq('id', game.slot_id)
      .single();

    if (slotErr || !slot?.start_time) {
      // Cannot determine time — allow with a warning logged server-side
      console.warn(`validate-game-cancel: could not fetch slot for game ${gameId}`);
      return respond(200, { allowed: true });
    }

    const startTime = new Date(slot.start_time); // stored in UTC by Supabase
    const now = new Date();
    const msUntilStart = startTime.getTime() - now.getTime();
    const hoursUntilStart = msUntilStart / (1000 * 60 * 60);

    if (hoursUntilStart < PLAYER_CANCEL_CUTOFF_HOURS) {
      return respond(200, {
        allowed: false,
        reason: `Cancelamento não permitido com menos de ${PLAYER_CANCEL_CUTOFF_HOURS}h de antecedência. Contate o clube para cancelar.`,
        hoursUntilStart: Math.max(0, hoursUntilStart),
      });
    }

    return respond(200, { allowed: true, hoursUntilStart });
  } catch (err) {
    return respond(500, { allowed: false, reason: err instanceof Error ? err.message : 'Unexpected error' });
  }
});

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
