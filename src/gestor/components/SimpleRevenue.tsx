import { useEffect, useState } from 'react';
import { DollarSign, Wallet, XCircle, BarChart2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface SimpleRevenueProps {
  venueId: string | null;
}

export function SimpleRevenue({ venueId }: SimpleRevenueProps) {
  const [confirmedRevenue, setConfirmedRevenue] = useState(0);
  const [pendingRevenue, setPendingRevenue] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [totalSlots, setTotalSlots] = useState(0);
  const [bookedSlots, setBookedSlots] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venueId) return;
    load();
  }, [venueId]);

  async function load() {
    setLoading(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data: courtRows } = await supabase.from('courts').select('id').eq('venue_id', venueId);
    if (!courtRows?.length) { setLoading(false); return; }

    const { data: slotRows } = await supabase
      .from('slots').select('id, is_available')
      .in('court_id', courtRows.map(c => c.id))
      .gte('start_time', monthStart)
      .lte('start_time', monthEnd);

    const allSlots = slotRows ?? [];
    setTotalSlots(allSlots.length);
    setBookedSlots(allSlots.filter(s => !s.is_available).length);

    if (!allSlots.length) { setLoading(false); return; }

    const { data: bookingRows } = await supabase
      .from('bookings')
      .select('total_price, payment_status, status')
      .in('slot_id', allSlots.map(s => s.id));

    const bks = bookingRows ?? [];
    const confirmed = bks.filter(b => b.payment_status === 'paid' && b.status !== 'cancelled');
    const pending = bks.filter(b => b.payment_status === 'pending' && b.status !== 'cancelled');
    const cancelled = bks.filter(b => b.status === 'cancelled');

    setConfirmedRevenue(confirmed.reduce((sum, b) => sum + (b.total_price || 0), 0));
    setPendingRevenue(pending.reduce((sum, b) => sum + (b.total_price || 0), 0));
    setConfirmedCount(confirmed.length);
    setPendingCount(pending.length);
    setCancelledCount(cancelled.length);
    setLoading(false);
  }

  const totalBookings = confirmedCount + pendingCount;
  const avgTicket = confirmedCount > 0 ? Math.round(confirmedRevenue / confirmedCount) : 0;
  const occupancyPct = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;
  const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (loading) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Financeiro</h2>
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Financeiro</h2>
        <span className="text-sm text-gray-500 capitalize">{capFirst(monthLabel)}</span>
      </div>

      <div className="space-y-4">

        {/* Receita Confirmada */}
        <div className="bg-white rounded-xl border-2 border-gray-100 p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-500">Receita Confirmada</p>
            <p className="text-3xl font-bold text-gray-900">
              R$ {confirmedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <span className="text-sm text-gray-400 flex-shrink-0">
            {confirmedCount} reserva{confirmedCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* A Receber */}
        <div className="bg-amber-50 rounded-xl border-2 border-amber-100 p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Wallet className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-700">A Receber (pagamento pendente)</p>
            <p className="text-3xl font-bold text-amber-900">
              R$ {pendingRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <span className="text-sm text-amber-600 flex-shrink-0">
            {pendingCount} reserva{pendingCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Taxa de Ocupação */}
        <div className="bg-white rounded-xl border-2 border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <BarChart2 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Taxa de Ocupação</p>
                <p className="text-2xl font-bold text-gray-900">{occupancyPct}%</p>
              </div>
            </div>
            <span className="text-sm text-gray-400">{bookedSlots}/{totalSlots} slots</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all"
              style={{ width: `${occupancyPct}%` }}
            />
          </div>
        </div>

        {/* Resumo */}
        <div className="bg-gray-50 rounded-xl p-5 border-2 border-gray-100">
          <h3 className="font-semibold text-gray-700 mb-4">Resumo do Mês</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total de Reservas</span>
              <span className="font-semibold">{totalBookings}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ticket Médio (confirmadas)</span>
              <span className="font-semibold">
                {confirmedCount > 0 ? `R$ ${avgTicket.toLocaleString('pt-BR')}` : '—'}
              </span>
            </div>
            {cancelledCount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-red-400" /> Cancelamentos
                </span>
                <span className="font-semibold text-red-500">{cancelledCount}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-3 flex justify-between">
              <span className="text-gray-700 font-semibold">Total Previsto</span>
              <span className="font-bold text-gray-900">
                R$ {(confirmedRevenue + pendingRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Nota */}
        <p className="text-xs text-gray-400 text-center px-2">
          Valores referentes à quadra. Taxas de plataforma não incluídas.
        </p>

      </div>
    </div>
  );
}
