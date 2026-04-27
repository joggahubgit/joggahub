import { useState, useEffect } from 'react';
import { DollarSign, Calendar, Clock, TrendingUp, AlertCircle, ArrowRight, Eye, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface Props {
  venueId: string;
  onCreateAvailability: () => void;
  onNavigate: (tab: string) => void;
}

interface Booking {
  id: string;
  slot_id: string;
  user_id: string;
  total_price: number;
  payment_status: string;
  start_time?: string;
  court_name?: string;
  player_name?: string;
  player_phone?: string;
}

export function SimpleDashboard({ venueId, onCreateAvailability, onNavigate }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venueId) return;
    fetchTodayBookings();
  }, [venueId]);

  async function fetchTodayBookings() {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Courts for venue
      const { data: courts } = await supabase
        .from('courts').select('id, name').eq('venue_id', venueId);
      if (!courts?.length) { setLoading(false); return; }
      const courtMap: Record<string, string> = {};
      courts.forEach(c => { courtMap[c.id] = c.name; });

      // 2. Slots for today
      const { data: slots } = await supabase
        .from('slots').select('id, court_id, start_time')
        .in('court_id', courts.map(c => c.id))
        .gte('start_time', `${today}T00:00:00`)
        .lte('start_time', `${today}T23:59:59`);
      if (!slots?.length) { setLoading(false); return; }
      const slotMap: Record<string, { start_time: string; court_id: string }> = {};
      slots.forEach(s => { slotMap[s.id] = s; });

      // 3. Bookings for those slots (simple — no joins)
      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('id, slot_id, created_by, total_price, payment_status, status')
        .in('slot_id', slots.map(s => s.id))
        .neq('status', 'cancelled');
      if (!bookingRows?.length) { setLoading(false); return; }

      // 4. Profiles for those users
      const userIds = [...new Set(bookingRows.map(b => b.created_by))];
      const { data: profiles } = await supabase
        .from('profiles').select('id, name, phone').in('id', userIds);
      const profileMap: Record<string, { name: string; phone: string }> = {};
      (profiles ?? []).forEach(p => { profileMap[p.id] = p; });

      // 5. Combine
      const combined: Booking[] = bookingRows.map(b => ({
        id: b.id,
        slot_id: b.slot_id,
        user_id: b.created_by,
        total_price: b.total_price,
        payment_status: b.payment_status,
        start_time: slotMap[b.slot_id]?.start_time,
        court_name: courtMap[slotMap[b.slot_id]?.court_id],
        player_name: profileMap[b.created_by]?.name,
        player_phone: profileMap[b.created_by]?.phone,
      }));

      setBookings(combined);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function confirmPayment(bookingId: string) {
    await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);
    fetchTodayBookings();
  }

  const todayRevenue = bookings
    .filter(b => b.payment_status === 'paid')
    .reduce((sum, b) => sum + (b.total_price ?? 0), 0);

  const pendingCount = bookings.filter(b => b.payment_status === 'pending').length;
  const paidCount = bookings.filter(b => b.payment_status === 'paid').length;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Pending payment alert */}
      {pendingCount > 0 && (
        <div className="bg-white rounded-xl md:rounded-2xl p-4 md:p-6 shadow-md border-2 border-orange-200">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-bold mb-1 text-gray-900">
                  {pendingCount} {pendingCount === 1 ? 'Pagamento Pendente' : 'Pagamentos Pendentes'}
                </h3>
                <p className="text-sm md:text-base text-gray-600">
                  Você tem reservas confirmadas aguardando confirmação de pagamento
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('bookings')}
              className="bg-purple-600 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-lg md:rounded-xl font-semibold hover:bg-purple-700 transition-colors shadow-sm flex items-center justify-center gap-2 whitespace-nowrap text-sm md:text-base"
            >
              Ver Todas <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
        <button
          onClick={() => onNavigate('revenue')}
          className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg hover:shadow-xl transition-all text-left group"
        >
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-purple-200 mb-1 md:mb-2 text-sm md:text-base">Receita Hoje</p>
          <p className="text-3xl md:text-4xl font-bold text-white mb-1 md:mb-2">
            R$ {todayRevenue.toLocaleString('pt-BR')}
          </p>
          <div className="flex items-center gap-2 text-purple-200 text-xs md:text-sm">
            <TrendingUp className="w-3 h-3 md:w-4 md:h-4" />
            <span>{paidCount} reservas pagas</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate('calendar')}
          className="bg-white rounded-xl md:rounded-2xl p-4 md:p-6 border-2 border-gray-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all text-left group"
        >
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
            </div>
            <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-gray-600 mb-1 md:mb-2 text-sm md:text-base">Reservas Hoje</p>
          <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-1 md:mb-2">{loading ? '...' : bookings.length}</p>
          <p className="text-xs md:text-sm text-gray-600">
            {pendingCount} pendentes • {paidCount} confirmadas
          </p>
        </button>

        <button
          onClick={() => onNavigate('calendar')}
          className="bg-white rounded-xl md:rounded-2xl p-4 md:p-6 border-2 border-gray-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all text-left group sm:col-span-2 lg:col-span-1"
        >
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
            </div>
            <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-gray-600 mb-1 md:mb-2 text-sm md:text-base">Taxa de Ocupação</p>
          <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-1 md:mb-2">
            {bookings.length > 0 ? `${Math.round((paidCount / bookings.length) * 100)}%` : '—'}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full"
              style={{ width: bookings.length > 0 ? `${Math.round((paidCount / bookings.length) * 100)}%` : '0%' }}
            />
          </div>
        </button>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl md:rounded-2xl border-2 border-gray-200 p-4 md:p-6 shadow-sm">
        <h3 className="text-base md:text-lg font-bold text-gray-900 mb-3 md:mb-4">Ações Rápidas</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          <button onClick={onCreateAvailability} className="p-3 md:p-4 bg-purple-600 text-white rounded-lg md:rounded-xl hover:bg-purple-700 transition-colors font-semibold text-center">
            <div className="text-xl md:text-2xl mb-1 md:mb-2">➕</div>
            <div className="text-xs md:text-sm">Criar Horários</div>
          </button>
          <button onClick={() => onNavigate('calendar')} className="p-3 md:p-4 bg-gray-100 text-gray-700 rounded-lg md:rounded-xl hover:bg-gray-200 transition-colors font-semibold text-center">
            <div className="text-xl md:text-2xl mb-1 md:mb-2">📅</div>
            <div className="text-xs md:text-sm">Ver Agenda</div>
          </button>
          <button onClick={() => onNavigate('bookings')} className="p-3 md:p-4 bg-gray-100 text-gray-700 rounded-lg md:rounded-xl hover:bg-gray-200 transition-colors font-semibold text-center">
            <div className="text-xl md:text-2xl mb-1 md:mb-2">📋</div>
            <div className="text-xs md:text-sm">Reservas</div>
          </button>
          <button onClick={() => onNavigate('profile')} className="p-3 md:p-4 bg-gray-100 text-gray-700 rounded-lg md:rounded-xl hover:bg-gray-200 transition-colors font-semibold text-center">
            <div className="text-xl md:text-2xl mb-1 md:mb-2">🏟️</div>
            <div className="text-xs md:text-sm">Meu Perfil</div>
          </button>
        </div>
      </div>

      {/* Today's bookings */}
      <div className="bg-white rounded-xl md:rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b-2 border-gray-200 flex items-center justify-between bg-gray-50">
          <h3 className="font-bold text-base md:text-lg text-gray-900">Reservas de Hoje</h3>
          <button onClick={() => onNavigate('bookings')} className="text-purple-600 hover:text-purple-700 font-semibold text-xs md:text-sm flex items-center gap-1 md:gap-2">
            Ver todas <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Carregando...</div>
        ) : bookings.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Nenhuma reserva para hoje.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {bookings.map((booking) => (
              <div key={booking.id} className="px-4 md:px-6 py-3 md:py-4 hover:bg-gray-50 transition-colors group">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-purple-100 rounded-lg md:rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-purple-600 font-bold text-sm md:text-base">
                        {booking.start_time ? formatTime(booking.start_time) : '—'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm md:text-base truncate">
                        {booking.player_name ?? 'Jogador'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 md:mt-1">
                        <p className="text-xs md:text-sm text-gray-600">{booking.court_name}</p>
                        {booking.player_phone && (
                          <>
                            <span className="text-gray-300 hidden sm:inline">•</span>
                            <p className="text-xs md:text-sm text-gray-600 hidden sm:block">{booking.player_phone}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {booking.payment_status === 'paid' ? (
                      <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 bg-green-50 text-green-700 rounded-lg md:rounded-xl font-semibold text-xs md:text-sm border border-green-200">
                        <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">Pago</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 bg-orange-50 text-orange-700 rounded-lg md:rounded-xl font-semibold text-xs md:text-sm border border-orange-200">
                          <AlertCircle className="w-3 h-3 md:w-4 md:h-4" />
                          <span className="hidden sm:inline">Pendente</span>
                        </div>
                        <button
                          onClick={() => confirmPayment(booking.id)}
                          className="hidden md:flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-purple-600 text-white rounded-lg md:rounded-xl font-semibold hover:bg-purple-700 transition-colors opacity-0 group-hover:opacity-100 text-xs md:text-sm"
                        >
                          Confirmar
                        </button>
                      </>
                    )}
                    <button className="hidden md:block p-1.5 md:p-2 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <Eye className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tip */}
      <div className="bg-white rounded-xl md:rounded-2xl p-4 md:p-6 border-2 border-gray-200 shadow-sm">
        <div className="flex items-start gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 mb-1 md:mb-2 text-sm md:text-base">💡 Dica</h3>
            <p className="text-gray-700 mb-2 md:mb-3 text-xs md:text-sm leading-relaxed">
              Crie horários disponíveis para que jogadores possam reservar sua quadra. Quanto mais horários, mais reservas!
            </p>
            <button
              onClick={onCreateAvailability}
              className="text-purple-600 hover:text-purple-700 font-semibold text-xs md:text-sm flex items-center gap-1 md:gap-2"
            >
              Criar horários agora <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
