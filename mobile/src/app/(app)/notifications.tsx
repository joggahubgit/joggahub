// Port of src/app/components/Notifications.tsx (web).
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, Calendar, CheckCircle, Crown, MessageCircle, Trophy, UserMinus, Users, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteNotification, fetchNotifications, markRead, type AppNotification, type NotificationType } from '@/features/notifications/api';
import { useRealtimeRefetch } from '@/lib/useRealtimeRefetch';
import palette from '../../../tailwind.palette';

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

const tabOf = (t: NotificationType) => (t === 'chat_message' ? 'messages' : 'games');

const ICON: Partial<Record<NotificationType, typeof Bell>> = {
  game_joined: Users,
  game_removed: UserMinus,
  game_cancelled: X,
  organizer_transferred: Crown,
  pending_results: CheckCircle,
  result_pending_confirmation: CheckCircle,
  rating_updated: Trophy,
  chat_message: MessageCircle,
};

const COLOR: Partial<Record<NotificationType, { bg: string; fg: string }>> = {
  game_joined: { bg: 'bg-green-100', fg: palette.green['600'] },
  game_removed: { bg: 'bg-red-100', fg: palette.red['500'] },
  game_cancelled: { bg: 'bg-red-100', fg: palette.red['500'] },
  organizer_transferred: { bg: 'bg-yellow-100', fg: palette.yellow['600'] },
  pending_results: { bg: 'bg-blue-100', fg: palette.blue['600'] },
  result_pending_confirmation: { bg: 'bg-blue-100', fg: palette.blue['600'] },
  rating_updated: { bg: 'bg-amber-100', fg: palette.amber['600'] },
  chat_message: { bg: 'bg-violet-100', fg: palette.violet['600'] },
};
const DEFAULT_COLOR = { bg: 'bg-violet-100', fg: palette.violet['600'] };

export default function NotificationsScreen() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const qc = useQueryClient();
  const key = ['notifications', userId];
  const q = useQuery({ queryKey: key, queryFn: () => fetchNotifications(userId) });
  const [tab, setTab] = useState<'games' | 'messages'>('games');

  useRealtimeRefetch(`notifications-${userId}`, ['notifications'], () => q.refetch());

  // Optimistic local update, same as the web's setNotifications after each write.
  const patch = (fn: (list: AppNotification[]) => AppNotification[]) => {
    qc.setQueryData<AppNotification[]>(key, prev => fn(prev ?? []));
    qc.invalidateQueries({ queryKey: ['unread', userId] });
  };
  const readOne = (id: string) => {
    patch(list => list.map(n => (n.id === id ? { ...n, read: true } : n)));
    markRead([id]).catch(() => q.refetch());
  };
  const remove = (id: string) => {
    patch(list => list.filter(n => n.id !== id));
    deleteNotification(id).catch(() => q.refetch());
  };

  const all = q.data ?? [];
  const games = all.filter(n => tabOf(n.type) === 'games');
  const messages = all.filter(n => tabOf(n.type) === 'messages');
  const visible = tab === 'games' ? games : messages;
  const gamesUnread = games.filter(n => !n.read).length;
  const messagesUnread = messages.filter(n => !n.read).length;
  const unreadCount = tab === 'games' ? gamesUnread : messagesUnread;

  const readAll = () => {
    const ids = visible.filter(n => !n.read).map(n => n.id);
    if (!ids.length) return;
    patch(list => list.map(n => (ids.includes(n.id) ? { ...n, read: true } : n)));
    markRead(ids).catch(() => q.refetch());
  };

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-white border-b border-gray-200">
        <View className="px-6 py-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-4">
              <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={12}>
                <ArrowLeft size={24} color={palette.gray['600']} />
              </Pressable>
              <View>
                <Text className="text-xl font-bold text-gray-900">Notificações</Text>
                {unreadCount > 0 && <Text className="text-sm text-gray-500">{unreadCount} não lidas</Text>}
              </View>
            </View>
            {unreadCount > 0 && (
              <Pressable onPress={readAll} hitSlop={8}>
                <Text className="text-sm text-violet-600 font-semibold">Marcar todas como lidas</Text>
              </Pressable>
            )}
          </View>

          <View className="flex-row gap-2 mt-4">
            {[
              { key: 'games' as const, label: 'Partidas', count: gamesUnread },
              { key: 'messages' as const, label: 'Mensagens', count: messagesUnread },
            ].map(t => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full ${active ? 'bg-violet-600' : 'bg-gray-100'}`}
                >
                  <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-600'}`}>{t.label}</Text>
                  {t.count > 0 && (
                    <View className={`px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-violet-100'}`}>
                      <Text className={`text-[10px] font-bold ${active ? 'text-white' : 'text-violet-700'}`}>{t.count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerClassName="px-6 py-4 gap-3"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={palette.violet['600']} />}
      >
        {q.isPending && (
          <View className="items-center py-20">
            <ActivityIndicator color={palette.violet['600']} />
          </View>
        )}

        {!q.isPending && visible.length === 0 && (
          <View className="items-center py-20 gap-2">
            <Bell size={48} color={palette.gray['200']} />
            <Text className="font-semibold text-gray-500 text-base">Nenhuma notificação</Text>
            <Text className="text-sm text-gray-400 text-center">
              {tab === 'games'
                ? 'Quando houver novidades nas suas partidas, elas aparecerão aqui.'
                : 'Mensagens de chats de partidas aparecerão aqui.'}
            </Text>
          </View>
        )}

        {visible.map(n => {
          const Icon = ICON[n.type] ?? Calendar;
          const c = COLOR[n.type] ?? DEFAULT_COLOR;
          return (
            <Pressable
              key={n.id}
              onPress={() => {
                readOne(n.id);
                if (!n.game_id) return;
                if (n.type === 'chat_message') router.push({ pathname: '/game-chat/[id]', params: { id: n.game_id } });
                else router.push({ pathname: '/game/[id]', params: { id: n.game_id } });
              }}
              className={`bg-white rounded-2xl p-4 ${!n.read ? 'border-2 border-violet-200' : 'border border-gray-200'}`}
            >
              <View className="flex-row gap-3">
                <View className={`w-10 h-10 rounded-full items-center justify-center ${c.bg}`}>
                  <Icon size={20} color={c.fg} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-start justify-between gap-2 mb-1">
                    <Text className={`font-semibold text-sm flex-1 ${!n.read ? 'text-gray-900' : 'text-gray-700'}`}>{n.title}</Text>
                    <Pressable onPress={() => remove(n.id)} accessibilityRole="button" accessibilityLabel="Apagar notificação" hitSlop={10}>
                      <X size={16} color={palette.gray['300']} />
                    </Pressable>
                  </View>
                  <Text className={`text-sm leading-relaxed ${!n.read ? 'text-gray-700' : 'text-gray-500'}`}>{n.message}</Text>
                  <View className="flex-row items-center justify-between mt-2">
                    <Text className="text-xs text-gray-400">{timeAgo(n.created_at)}</Text>
                    {!n.read && (
                      <Pressable onPress={() => readOne(n.id)} hitSlop={8}>
                        <Text className="text-xs text-violet-600 font-semibold">Marcar como lida</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
