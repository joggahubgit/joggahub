/** Game chat, ported from GameChat.tsx (web). */
import { supabase } from '@/lib/supabase';
import { wallDate, wallTime } from '@/lib/shared';

export interface ChatMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface SenderInfo {
  name: string;
  avatarUrl: string | null;
}

export interface ChatData {
  gameLabel: string;
  messages: ChatMessage[];
  senders: Record<string, SenderInfo>;
}

export async function fetchChat(gameId: string): Promise<ChatData> {
  const { data: game } = await supabase.from('games').select('sport_type, organizer_id, scheduled_at, courts(name)').eq('id', gameId).maybeSingle();
  let gameLabel = '';
  if (game) {
    const sport = game.sport_type === 'futevolei' ? 'Futevôlei' : game.sport_type;
    const court = (game as any).courts?.name ? ` · ${(game as any).courts.name}` : '';
    // Wall-clock game time, formatted raw (not in the viewer's timezone).
    const when = game.scheduled_at ? ` · ${wallDate(game.scheduled_at, { day: '2-digit', month: 'short' })}, ${wallTime(game.scheduled_at)}` : '';
    gameLabel = `${sport}${court}${when}`;
  }

  const { data: rows, error } = await supabase.from('game_messages').select('id, sender_id, body, created_at').eq('game_id', gameId).order('created_at', { ascending: true });
  if (error) throw error;

  const { data: players } = await supabase.from('game_players').select('player_id').eq('game_id', gameId);
  const ids = [...new Set([game?.organizer_id, ...(players ?? []).map(p => p.player_id)].filter(Boolean))] as string[];
  const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, name, avatar_url').in('id', ids) : { data: [] };
  const senders: Record<string, SenderInfo> = {};
  for (const p of profiles ?? []) senders[p.id] = { name: p.name ?? 'Jogador', avatarUrl: p.avatar_url ?? null };

  return { gameLabel, messages: rows ?? [], senders };
}

/**
 * One notification per (game, recipient) for chat: a new message refreshes the
 * existing row (back to unread) instead of piling up — same as the web.
 */
async function upsertChatNotifications(gameId: string, recipientIds: string[], title: string, message: string) {
  if (!recipientIds.length) return;
  const { data: updated } = await supabase
    .from('notifications')
    .update({ title, message, read: false, created_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('type', 'chat_message')
    .in('user_id', recipientIds)
    .select('user_id');
  const done = new Set((updated ?? []).map(r => r.user_id));
  const toInsert = recipientIds.filter(uid => !done.has(uid));
  if (toInsert.length) {
    await supabase.from('notifications').insert(toInsert.map(user_id => ({ user_id, type: 'chat_message', title, message, game_id: gameId })));
  }
}

export async function sendMessage(opts: { gameId: string; userId: string; text: string; senderName: string; gameLabel: string }) {
  const { error } = await supabase.from('game_messages').insert({ game_id: opts.gameId, sender_id: opts.userId, body: opts.text });
  if (error) throw new Error('Não foi possível enviar. Tente novamente.');
  // Notifications are best-effort: a failure here must not look like a failed send.
  try {
    const preview = opts.text.length > 80 ? `${opts.text.slice(0, 80)}…` : opts.text;
    const { data: players } = await supabase.from('game_players').select('player_id').eq('game_id', opts.gameId).neq('player_id', opts.userId);
    const recipients = [...new Set((players ?? []).map(p => p.player_id))];
    await upsertChatNotifications(opts.gameId, recipients, opts.gameLabel || 'Partida', `${opts.senderName}: ${preview}`);
  } catch {
    // ignored on purpose
  }
}
