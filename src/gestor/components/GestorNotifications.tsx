import { useState, useEffect, useRef } from 'react';
import { Bell, X, Calendar, DollarSign, XCircle, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { GestorBookingDetail } from './GestorBookingDetail';

type NotifType = 'new_booking' | 'payment_confirmed' | 'booking_cancelled' | 'player_joined';

interface NotifItem {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  timestamp: string;
  bookingId?: string;
}

const STORAGE_KEY = 'gestor_notif_last_seen';

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function slotLabel(isoStart: string) {
  const d = new Date(isoStart);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function iconFor(type: NotifType) {
  switch (type) {
    case 'new_booking':       return { Icon: Calendar,   color: 'bg-purple-100 text-purple-600' };
    case 'payment_confirmed': return { Icon: DollarSign, color: 'bg-green-100 text-green-600' };
    case 'booking_cancelled': return { Icon: XCircle,    color: 'bg-red-100 text-red-500' };
    case 'player_joined':     return { Icon: Users,      color: 'bg-blue-100 text-blue-600' };
  }
}

interface Props { venueId: string; }

export function GestorNotifications({ venueId }: Props) {
  const [open, setOpen]       = useState(false);
  const [items, setItems]     = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<Date>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Date(stored) : new Date(0);
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const loadRef  = useRef(load);
  loadRef.current = load;

  // Initial load + realtime
  useEffect(() => {
    if (!venueId) return;
    loadRef.current();
    const channel = supabase
      .channel(`gestor-notif-${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => loadRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players' }, () => loadRef.current())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [venueId]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function load() {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 14);

      // Courts
      const { data: courts } = await supabase.from('courts').select('id, name').eq('venue_id', venueId);
      if (!courts?.length) { setItems([]); return; }
      const courtMap: Record<string, string> = {};
      courts.forEach(c => { courtMap[c.id] = c.name; });

      // Slots (last 14 days)
      const { data: slots } = await supabase
        .from('slots').select('id, court_id, start_time')
        .in('court_id', courts.map(c => c.id))
        .gte('start_time', since.toISOString());
      if (!slots?.length) { setItems([]); return; }
      const slotMap: Record<string, { court_id: string; start_time: string }> = {};
      slots.forEach(s => { slotMap[s.id] = s; });

      // Bookings for those slots
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, slot_id, created_by, total_price, payment_status, status, created_at')
        .in('slot_id', slots.map(s => s.id))
        .order('created_at', { ascending: false })
        .limit(60);

      // Profiles
      const uids = [...new Set((bookings ?? []).map(b => b.created_by))];
      const profileMap: Record<string, string> = {};
      if (uids.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', uids);
        (profiles ?? []).forEach(p => { profileMap[p.id] = p.name ?? '—'; });
      }

      // Open-game player joins for venue courts (last 14 days)
      const { data: games } = await supabase
        .from('games')
        .select('id, court_id, scheduled_at')
        .in('court_id', courts.map(c => c.id))
        .eq('is_open', true)
        .gte('scheduled_at', since.toISOString());

      const gpItems: NotifItem[] = [];
      if (games?.length) {
        const gameMap: Record<string, { court_id: string; scheduled_at: string }> = {};
        games.forEach(g => { gameMap[g.id] = g; });
        const { data: gp } = await supabase
          .from('game_players')
          .select('game_id, player_name')
          .in('game_id', games.map(g => g.id));
        (gp ?? []).forEach(p => {
          const g = gameMap[p.game_id];
          if (!g) return;
          gpItems.push({
            id: `gp-${p.game_id}-${p.player_name}`,
            type: 'player_joined',
            title: 'Jogador entrou em partida aberta',
            message: `${p.player_name} · ${courtMap[g.court_id] ?? '—'} · ${slotLabel(g.scheduled_at)}`,
            timestamp: g.scheduled_at,
          });
        });
      }

      // Build booking items
      const bookingItems: NotifItem[] = (bookings ?? []).map(b => {
        const slot = slotMap[b.slot_id];
        const court = slot ? (courtMap[slot.court_id] ?? '—') : '—';
        const player = profileMap[b.created_by] ?? 'Jogador';
        const when = slot ? slotLabel(slot.start_time) : '—';

        if (b.status === 'cancelled') {
          return {
            id: `cancelled-${b.id}`,
            type: 'booking_cancelled' as const,
            title: 'Reserva cancelada',
            message: `${player} · ${court} · ${when}`,
            timestamp: b.created_at,
            bookingId: b.id,
          };
        }
        if (b.payment_status === 'paid') {
          return {
            id: `paid-${b.id}`,
            type: 'payment_confirmed' as const,
            title: 'Pagamento confirmado',
            message: `${player} · ${court} · R$ ${(b.total_price ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            timestamp: b.created_at,
            bookingId: b.id,
          };
        }
        return {
          id: `new-${b.id}`,
          type: 'new_booking' as const,
          title: 'Nova reserva',
          message: `${player} · ${court} · ${when}`,
          timestamp: b.created_at,
          bookingId: b.id,
        };
      });

      const all = [...bookingItems, ...gpItems]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 50);
      setItems(all);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(v => {
      if (!v) {
        const now = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, now);
        setLastSeen(new Date(now));
      }
      return !v;
    });
  }

  const unreadCount = items.filter(n => new Date(n.timestamp) > lastSeen).length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-11 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-gray-900">Notificações</h3>
              {unreadCount > 0 && (
                <p className="text-xs text-gray-500">{unreadCount} nova{unreadCount !== 1 ? 's' : ''}</p>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {loading && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                <Bell className="w-10 h-10 text-gray-200" />
                <p className="text-sm font-medium">Nenhuma atividade recente</p>
                <p className="text-xs text-center px-6">Novas reservas e pagamentos aparecerão aqui.</p>
              </div>
            )}

            {!loading && items.map(item => {
              const isNew = new Date(item.timestamp) > lastSeen;
              const { Icon, color } = iconFor(item.type);
              const clickable = !!item.bookingId;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.bookingId) {
                      setOpen(false);
                      setSelectedBookingId(item.bookingId);
                    }
                  }}
                  className={`flex gap-3 px-5 py-4 transition-colors ${isNew ? 'bg-purple-50/60' : 'hover:bg-gray-50'} ${clickable ? 'cursor-pointer hover:bg-purple-50' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold leading-tight ${isNew ? 'text-gray-900' : 'text-gray-700'}`}>
                        {item.title}
                      </p>
                      {isNew && <span className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0 mt-1" />}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{item.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{timeAgo(item.timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {items.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">Últimos 14 dias · {items.length} evento{items.length !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      )}

      {selectedBookingId && (
        <GestorBookingDetail
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onChanged={() => { load(); setSelectedBookingId(null); }}
        />
      )}
    </div>
  );
}
