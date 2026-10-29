/** Notifications, ported from Notifications.tsx (web). RLS limits rows to the signed-in user. */
import { supabase } from '@/lib/supabase';

export type NotificationType =
  | 'game_joined'
  | 'game_removed'
  | 'game_cancelled'
  | 'game_left'
  | 'organizer_transferred'
  | 'pending_results'
  | 'result_pending_confirmation'
  | 'rating_updated'
  | 'chat_message';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  game_id: string | null;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, message, game_id, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function markRead(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from('notifications').update({ read: true }).in('id', ids);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}
