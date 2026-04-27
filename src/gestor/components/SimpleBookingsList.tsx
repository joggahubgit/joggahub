import { useState, useEffect } from 'react';
import { Search, Filter, CheckCircle, XCircle, Phone, Mail, Calendar, Clock, DollarSign, ChevronDown, MoreVertical } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface Props { venueId: string; }

interface Booking {
  id: string;
  slot_id: string;
  user_id: string;
  total_price: number;
  payment_status: string;
  status: string;
  created_at: string;
  start_time: string;
  end_time: string;
  court_name: string;
  player_name: string;
  player_phone: string;
}

export function SimpleBookingsList({ venueId }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCourt, setFilterCourt] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBookings, setSelectedBookings] = useState<string[]>([]);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!venueId) return;
    fetchCourts();
    fetchBookings();
  }, [venueId]);

  async function fetchCourts() {
    const { data } = await supabase.from('courts').select('id, name').eq('venue_id', venueId);
    setCourts(data ?? []);
  }

  async function fetchBookings() {
    setLoading(true);
    try {
      // 1. Courts for this venue
      const { data: courtRows } = await supabase.from('courts').select('id, name').eq('venue_id', venueId);
      if (!courtRows?.length) { setLoading(false); return; }
      const courtMap: Record<string, string> = {};
      courtRows.forEach(c => { courtMap[c.id] = c.name; });

      // 2. Slots for those courts
      const { data: slotRows } = await supabase
        .from('slots').select('id, court_id, start_time, end_time')
        .in('court_id', courtRows.map(c => c.id));
      if (!slotRows?.length) { setLoading(false); return; }
      const slotMap: Record<string, typeof slotRows[0]> = {};
      slotRows.forEach(s => { slotMap[s.id] = s; });

      // 3. Bookings (flat — no joins)
      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('id, slot_id, created_by, total_price, payment_status, status, created_at')
        .in('slot_id', slotRows.map(s => s.id))
        .order('created_at', { ascending: false });
      if (!bookingRows?.length) { setLoading(false); return; }

      // 4. Profiles
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
        status: b.status,
        created_at: b.created_at,
        start_time: slotMap[b.slot_id]?.start_time ?? '',
        end_time: slotMap[b.slot_id]?.end_time ?? '',
        court_name: courtMap[slotMap[b.slot_id]?.court_id] ?? '—',
        player_name: profileMap[b.created_by]?.name ?? '—',
        player_phone: profileMap[b.created_by]?.phone ?? '—',
      }));
      setBookings(combined);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function confirmPayment(id: string) {
    await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', id);
    fetchBookings();
    setSelectedBookings(prev => prev.filter(i => i !== id));
  }

  async function cancelBooking(id: string) {
    if (!confirm('Cancelar esta reserva?')) return;
    const booking = bookings.find(b => b.id === id);
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    // Re-enable the slot so players can book it again
    if (booking?.slot_id) {
      await supabase.from('slots').update({ is_available: true }).eq('id', booking.slot_id);
    }
    fetchBookings();
  }

  async function bulkConfirmPayment() {
    for (const id of selectedBookings) {
      await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', id);
    }
    setSelectedBookings([]);
    fetchBookings();
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const filtered = bookings.filter(b => {
    if (b.status === 'cancelled') return false;
    const dateStr = b.start_time?.split('T')[0] ?? '';
    const matchDate = !filterDate || dateStr === filterDate;
    const matchStatus = filterStatus === 'all' || b.payment_status === filterStatus;
    const matchCourt = filterCourt === 'all' || b.court_name === filterCourt;
    const matchSearch = !searchTerm ||
      b.player_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.player_phone.includes(searchTerm);
    return matchDate && matchStatus && matchCourt && matchSearch;
  });

  const stats = {
    total: filtered.length,
    paid: filtered.filter(b => b.payment_status === 'paid').length,
    pending: filtered.filter(b => b.payment_status === 'pending').length,
    revenue: filtered.reduce((sum, b) => sum + (b.total_price ?? 0), 0),
  };

  const toggleSelection = (id: string) =>
    setSelectedBookings(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const toggleAll = () =>
    setSelectedBookings(selectedBookings.length === filtered.length ? [] : filtered.map(b => b.id));

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 md:gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Lista de Reservas</h2>
          <p className="text-gray-600 mt-1 text-sm md:text-base">Gerencie todas as reservas da sua quadra</p>
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <div className="bg-white border-2 border-gray-200 rounded-lg md:rounded-xl p-2 md:p-3 shadow-sm">
            <p className="text-xs text-gray-600">Total</p>
            <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white border-2 border-gray-200 rounded-lg md:rounded-xl p-2 md:p-3 shadow-sm">
            <p className="text-xs text-gray-600">Pagas</p>
            <p className="text-xl md:text-2xl font-bold text-green-600">{stats.paid}</p>
          </div>
          <div className="bg-white border-2 border-gray-200 rounded-lg md:rounded-xl p-2 md:p-3 shadow-sm">
            <p className="text-xs text-gray-600">Pendentes</p>
            <p className="text-xl md:text-2xl font-bold text-orange-600">{stats.pending}</p>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl md:rounded-2xl border-2 border-gray-100 p-3 md:p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-2 md:gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              className="w-full pl-9 md:pl-10 pr-3 md:pr-4 py-2 md:py-3 border-2 border-gray-200 rounded-lg md:rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 text-sm md:text-base"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center gap-2 px-4 py-2 md:py-3 rounded-lg md:rounded-xl font-semibold transition-all text-sm md:text-base ${showFilters ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <Filter className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline">Filtros</span>
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t-2 border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              <div>
                <label className="block text-xs md:text-sm font-semibold text-gray-700 mb-2">Data</label>
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  className="w-full px-3 md:px-4 py-2 border-2 border-gray-200 rounded-lg md:rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 text-sm md:text-base" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-semibold text-gray-700 mb-2">Quadra</label>
                <select value={filterCourt} onChange={e => setFilterCourt(e.target.value)}
                  className="w-full px-3 md:px-4 py-2 border-2 border-gray-200 rounded-lg md:rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 text-sm md:text-base">
                  <option value="all">Todas</option>
                  {courts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs md:text-sm font-semibold text-gray-700 mb-2">Status de Pagamento</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="w-full px-3 md:px-4 py-2 border-2 border-gray-200 rounded-lg md:rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-purple-600 text-sm md:text-base">
                  <option value="all">Todos</option>
                  <option value="paid">Pago</option>
                  <option value="pending">Pendente</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk actions */}
      {selectedBookings.length > 0 && (
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl md:rounded-2xl p-3 md:p-4 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 md:gap-4 text-white">
              <CheckCircle className="w-5 h-5 md:w-6 md:h-6" />
              <span className="font-semibold text-sm md:text-base">
                {selectedBookings.length} {selectedBookings.length === 1 ? 'reserva selecionada' : 'reservas selecionadas'}
              </span>
            </div>
            <div className="flex gap-2 md:gap-3 w-full sm:w-auto">
              <button onClick={bulkConfirmPayment}
                className="flex-1 sm:flex-none px-4 md:px-6 py-2 bg-white text-purple-600 rounded-lg md:rounded-xl font-semibold hover:bg-purple-50 transition-colors text-sm md:text-base">
                Confirmar Pagamentos
              </button>
              <button onClick={() => setSelectedBookings([])}
                className="px-4 md:px-6 py-2 bg-white bg-opacity-20 text-white rounded-lg md:rounded-xl font-semibold hover:bg-opacity-30 transition-colors text-sm md:text-base">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bookings list */}
      <div className="bg-white rounded-xl md:rounded-2xl border-2 border-gray-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 md:py-16 px-4">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 md:w-10 md:h-10 text-gray-400" />
            </div>
            <p className="text-lg md:text-xl font-semibold text-gray-900 mb-2">Nenhuma reserva encontrada</p>
            <p className="text-sm md:text-base text-gray-600">Tente ajustar os filtros ou aguarde novos agendamentos</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block">
              <div className="bg-gray-50 border-b-2 border-gray-100 px-6 py-4">
                <div className="flex items-center gap-4">
                  <input type="checkbox" checked={selectedBookings.length === filtered.length} onChange={toggleAll}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-600" />
                  <div className="grid grid-cols-5 gap-4 flex-1 text-sm font-semibold text-gray-700">
                    <div>Data & Hora</div><div>Cliente</div><div>Quadra</div><div>Valor</div><div>Status</div>
                  </div>
                  <div className="w-10" />
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {filtered.map(booking => (
                  <div key={booking.id}>
                    <div className={`px-6 py-4 hover:bg-purple-50 transition-colors ${selectedBookings.includes(booking.id) ? 'bg-purple-50' : ''}`}>
                      <div className="flex items-center gap-4">
                        <input type="checkbox" checked={selectedBookings.includes(booking.id)} onChange={() => toggleSelection(booking.id)}
                          className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-600" />
                        <div className="grid grid-cols-5 gap-4 flex-1">
                          <div>
                            <div className="flex items-center gap-2 text-gray-900 font-semibold">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              {formatDate(booking.start_time)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                              <Clock className="w-4 h-4 text-gray-400" />
                              {formatTime(booking.start_time)}
                            </div>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{booking.player_name}</p>
                            <p className="text-sm text-gray-600 mt-1">{booking.player_phone}</p>
                          </div>
                          <div>
                            <p className="text-gray-900 font-medium">{booking.court_name}</p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 text-purple-600 font-bold">
                              <DollarSign className="w-4 h-4" />
                              R$ {booking.total_price}
                            </div>
                          </div>
                          <div>
                            {booking.payment_status === 'paid' ? (
                              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-xl font-semibold text-sm w-fit">
                                <CheckCircle className="w-4 h-4" /> Pago
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 px-3 py-1 bg-orange-100 text-orange-700 rounded-xl font-semibold text-sm w-fit">
                                <XCircle className="w-4 h-4" /> Pendente
                              </div>
                            )}
                          </div>
                        </div>
                        <button onClick={() => setExpandedBooking(expandedBooking === booking.id ? null : booking.id)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                          <ChevronDown className={`w-5 h-5 text-gray-600 transition-transform ${expandedBooking === booking.id ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {expandedBooking === booking.id && (
                      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <Phone className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="text-xs text-gray-600">Telefone</p>
                              <p className="font-semibold text-gray-900">{booking.player_phone}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="text-xs text-gray-600">ID da Reserva</p>
                              <p className="font-semibold text-gray-900 text-xs">#{booking.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {booking.payment_status === 'pending' && (
                            <button onClick={() => confirmPayment(booking.id)}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors text-sm">
                              Confirmar Pagamento
                            </button>
                          )}
                          <button onClick={() => cancelBooking(booking.id)}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm">
                            Cancelar Reserva
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filtered.map(booking => (
                <div key={booking.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selectedBookings.includes(booking.id)} onChange={() => toggleSelection(booking.id)}
                      className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-600 mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 mb-1 truncate">{booking.player_name}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDate(booking.start_time)}</span>
                            <span>•</span>
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(booking.start_time)}</span>
                          </div>
                        </div>
                        <button onClick={() => setExpandedBooking(expandedBooking === booking.id ? null : booking.id)}
                          className="p-1 hover:bg-gray-100 rounded-lg transition-colors ml-2">
                          <MoreVertical className="w-5 h-5 text-gray-600" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-600">{booking.court_name}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-purple-600">R$ {booking.total_price}</span>
                        {booking.payment_status === 'paid' ? (
                          <div className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-lg font-semibold text-xs">
                            <CheckCircle className="w-3 h-3" /> Pago
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-lg font-semibold text-xs">
                            <XCircle className="w-3 h-3" /> Pendente
                          </div>
                        )}
                      </div>

                      {expandedBooking === booking.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                          <p className="text-sm text-gray-600">📞 {booking.player_phone}</p>
                          <p className="text-sm text-gray-600">🆔 #{booking.id.slice(0, 8)}</p>
                          <div className="flex gap-2 mt-3">
                            {booking.payment_status === 'pending' && (
                              <button onClick={() => confirmPayment(booking.id)}
                                className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors text-sm">
                                Confirmar
                              </button>
                            )}
                            <button onClick={() => cancelBooking(booking.id)}
                              className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Revenue summary */}
      {filtered.length > 0 && (
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl md:rounded-2xl p-4 md:p-6 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-purple-200 mb-1 md:mb-2 text-sm md:text-base">Receita Total (Filtrado)</p>
              <p className="text-3xl md:text-4xl font-bold">R$ {stats.revenue.toLocaleString('pt-BR')}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-purple-200 text-xs md:text-sm">Média por Reserva</p>
              <p className="text-xl md:text-2xl font-bold">R$ {stats.total > 0 ? Math.round(stats.revenue / stats.total) : 0}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
