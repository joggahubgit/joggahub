import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface SimpleRevenueProps {
  venueId: string | null;
}

export function SimpleRevenue({ venueId }: SimpleRevenueProps) {
  const [grossRevenue, setGrossRevenue] = useState(0);
  const [totalBookings, setTotalBookings] = useState(0);

  useEffect(() => {
    if (!venueId) return;
    async function load() {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      // 1. Courts for this venue
      const { data: courtRows } = await supabase
        .from('courts').select('id').eq('venue_id', venueId);
      if (!courtRows?.length) return;

      // 2. Slots for those courts this month
      const { data: slotRows } = await supabase
        .from('slots').select('id')
        .in('court_id', courtRows.map(c => c.id))
        .gte('start_time', monthStart)
        .lte('start_time', monthEnd);
      if (!slotRows?.length) return;

      // 3. Paid bookings for those slots
      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('total_price')
        .in('slot_id', slotRows.map(s => s.id))
        .eq('payment_status', 'paid')
        .neq('status', 'cancelled');

      if (bookingRows) {
        const total = bookingRows.reduce((sum, b) => sum + (b.total_price || 0), 0);
        setGrossRevenue(total);
        setTotalBookings(bookingRows.length);
      }
    }
    load();
  }, [venueId]);

  // Taxa cobrada do jogador (não deduzida do gestor)
  const platformFee = grossRevenue * 0.08 + totalBookings * 2.50;
  const avgTicket = totalBookings > 0 ? Math.round(grossRevenue / totalBookings) : 0;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Pagamentos</h2>

      <div className="space-y-4">
        <div className="bg-white rounded-xl border-2 border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Receita Bruta do Mês</p>
              <p className="text-3xl font-bold text-gray-900">
                R$ {grossRevenue.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Taxa JoggaHub ao Jogador (8% + R$ 2,50/reserva)</p>
              <p className="text-3xl font-bold text-orange-600">
                R$ {platformFee.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">Cobrado do jogador — não deduzido do clube</p>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-purple-200">A Receber pelo Clube</p>
              <p className="text-4xl font-bold text-white">
                R$ {grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-100">
          <h3 className="font-semibold mb-4">Resumo</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Total de Reservas</span>
              <span className="font-semibold">{totalBookings}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Ticket Médio</span>
              <span className="font-semibold">R$ {avgTicket}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
