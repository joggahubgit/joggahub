import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface SimpleRevenueProps {
  venueId: string | null;
}

export function SimpleRevenue({ venueId }: SimpleRevenueProps) {
  const [grossRevenue, setGrossRevenue] = useState(0);
  const [totalBookings, setTotalBookings] = useState(0);

  useEffect(() => {
    if (!venueId) return;
    async function load() {
      // 1. Courts for this venue
      const { data: courtRows } = await supabase
        .from('courts').select('id').eq('venue_id', venueId);
      if (!courtRows?.length) return;

      // 2. Slots for those courts
      const { data: slotRows } = await supabase
        .from('slots').select('id').in('court_id', courtRows.map(c => c.id));
      if (!slotRows?.length) return;

      // 3. Confirmed bookings for those slots
      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('total_price')
        .in('slot_id', slotRows.map(s => s.id))
        .eq('status', 'confirmed');

      if (bookingRows) {
        const total = bookingRows.reduce((sum, b) => sum + (b.total_price || 0), 0);
        setGrossRevenue(total);
        setTotalBookings(bookingRows.length);
      }
    }
    load();
  }, [venueId]);

  const commission = grossRevenue * 0.15;
  const netRevenue = grossRevenue - commission;
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
              <p className="text-sm text-gray-600">Comissão JoggaHub (15%)</p>
              <p className="text-3xl font-bold text-orange-600">
                - R$ {commission.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-purple-200">Receita Líquida Estimada</p>
              <p className="text-4xl font-bold text-white">
                R$ {netRevenue.toLocaleString('pt-BR')}
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
