import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Users, Calendar, CheckCircle, X, Loader2, Crown, UserMinus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type NotificationType = 'game_joined' | 'game_removed' | 'game_cancelled' | 'game_left' | 'organizer_transferred';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  game_id: string | null;
  read: boolean;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function getIcon(type: NotificationType) {
  switch (type) {
    case 'game_joined': return Users;
    case 'game_removed': return UserMinus;
    case 'game_cancelled': return X;
    case 'organizer_transferred': return Crown;
    default: return Calendar;
  }
}

function getColor(type: NotificationType) {
  switch (type) {
    case 'game_joined': return 'bg-green-100 text-green-600';
    case 'game_removed': return 'bg-red-100 text-red-500';
    case 'game_cancelled': return 'bg-red-100 text-red-500';
    case 'organizer_transferred': return 'bg-yellow-100 text-yellow-600';
    default: return 'bg-violet-100 text-violet-600';
  }
}

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNotifications() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setNotifications(data ?? []);
      setLoading(false);
    }
    fetchNotifications();
  }, []);

  async function markAsRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllAsRead() {
    const ids = notifications.filter(n => !n.read).map(n => n.id);
    if (!ids.length) return;
    await supabase.from('notifications').update({ read: true }).in('id', ids);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function deleteNotification(id: string) {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Notificações</h1>
                {unreadCount > 0 && <p className="text-sm text-gray-500">{unreadCount} não lidas</p>}
              </div>
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-sm text-violet-600 font-semibold">
                Marcar todas como lidas
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="text-center py-20 space-y-2">
            <Bell className="w-12 h-12 text-gray-200 mx-auto" />
            <p className="font-semibold text-gray-500">Nenhuma notificação</p>
            <p className="text-sm text-gray-400">Quando houver novidades nas suas partidas, elas aparecerão aqui.</p>
          </div>
        )}

        {!loading && notifications.map(n => {
          const Icon = getIcon(n.type);
          return (
            <div
              key={n.id}
              onClick={() => { markAsRead(n.id); if (n.game_id) navigate(`/open-game/${n.game_id}`); }}
              className={`bg-white rounded-2xl p-4 cursor-pointer transition-all ${!n.read ? 'border-2 border-violet-200' : 'border border-gray-200'}`}
            >
              <div className="flex gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getColor(n.type)}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className={`font-semibold text-sm ${!n.read ? 'text-gray-900' : 'text-gray-700'}`}>{n.title}</h3>
                    <button
                      onClick={e => { e.stopPropagation(); deleteNotification(n.id); }}
                      className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className={`text-sm leading-relaxed ${!n.read ? 'text-gray-700' : 'text-gray-500'}`}>{n.message}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                    {!n.read && (
                      <button
                        onClick={e => { e.stopPropagation(); markAsRead(n.id); }}
                        className="text-xs text-violet-600 font-semibold"
                      >
                        Marcar como lida
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
