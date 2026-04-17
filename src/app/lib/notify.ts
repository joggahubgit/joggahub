import { supabase } from '@/lib/supabase';

export async function notify(
  userId: string,
  type: string,
  title: string,
  message: string,
  gameId?: string,
) {
  await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    game_id: gameId ?? null,
  });
}

/** Notify all game_players (excluding one user) */
export async function notifyGamePlayers(
  gameId: string,
  excludeUserId: string,
  type: string,
  title: string,
  message: string,
) {
  const { data: players } = await supabase
    .from('game_players')
    .select('player_id')
    .eq('game_id', gameId)
    .neq('player_id', excludeUserId);

  if (!players?.length) return;

  await supabase.from('notifications').insert(
    players.map(p => ({ user_id: p.player_id, type, title, message, game_id: gameId })),
  );
}
