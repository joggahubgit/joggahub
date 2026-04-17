import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Plus, Check, Calendar, MapPin, Users } from 'lucide-react';

export default function PaymentsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'history' | 'methods'>('history');

  const paymentHistory = [
    { id: 1, date: '27/02/2026', time: '19:00', court: 'Arena Sports Center', location: 'Vila Mariana, SP', amount: 25.00, status: 'paid', type: 'Reserva de Quadra', players: 10 },
    { id: 2, date: '25/02/2026', time: '18:30', court: 'Soccer Park', location: 'Moema, SP', amount: 30.00, status: 'paid', type: 'Jogo Aberto', players: 8 },
    { id: 3, date: '22/02/2026', time: '20:00', court: 'Futsal Pro', location: 'Pinheiros, SP', amount: 22.50, status: 'refunded', type: 'Reserva de Quadra', players: 10 },
    { id: 4, date: '20/02/2026', time: '19:30', court: 'Arena Sports Center', location: 'Vila Mariana, SP', amount: 25.00, status: 'paid', type: 'Jogo Recorrente', players: 10 },
    { id: 5, date: '18/02/2026', time: '18:00', court: 'Champions Field', location: 'Itaim Bibi, SP', amount: 35.00, status: 'paid', type: 'Reserva de Quadra', players: 12 }
  ];

  const paymentMethods = [
    { id: 1, type: 'credit', brand: 'Visa', last4: '4242', expiry: '12/28', isDefault: true },
    { id: 2, type: 'credit', brand: 'Mastercard', last4: '8888', expiry: '09/27', isDefault: false }
  ];

  const getStatusBadge = (status: string) => {
    if (status === 'paid') return <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Pago</span>;
    if (status === 'refunded') return <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">Reembolsado</span>;
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-xl font-bold text-gray-900">Pagamentos</h1>
          </div>
        </div>
        <div className="flex border-t border-gray-200">
          <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'history' ? 'text-violet-600 border-b-2 border-violet-600' : 'text-gray-500'}`}>Histórico</button>
          <button onClick={() => setActiveTab('methods')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'methods' ? 'text-violet-600 border-b-2 border-violet-600' : 'text-gray-500'}`}>Formas de Pagamento</button>
        </div>
      </div>

      {activeTab === 'history' && (
        <div className="px-6 py-6 space-y-4">
          <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg">
            <p className="text-sm text-violet-100 mb-1">Total gasto este mês</p>
            <h2 className="text-3xl font-bold mb-4">R$ 137,50</h2>
            <div className="flex gap-6 text-sm">
              <div><p className="text-violet-100">Jogos</p><p className="font-semibold">5 partidas</p></div>
              <div><p className="text-violet-100">Média por jogo</p><p className="font-semibold">R$ 27,50</p></div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 px-2">Transações recentes</h3>
            {paymentHistory.map((payment) => (
              <div key={payment.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1"><h4 className="font-semibold text-gray-900">{payment.court}</h4>{getStatusBadge(payment.status)}</div>
                    <div className="flex items-center gap-1 text-sm text-gray-500 mb-1"><MapPin className="w-3 h-3" /><span>{payment.location}</span></div>
                    <div className="flex items-center gap-1 text-sm text-gray-500"><Calendar className="w-3 h-3" /><span>{payment.date} às {payment.time}</span></div>
                  </div>
                  <div className="text-right"><p className="text-lg font-bold text-gray-900">R$ {payment.amount.toFixed(2)}</p><p className="text-xs text-gray-500">{payment.type}</p></div>
                </div>
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-sm text-gray-600"><Users className="w-4 h-4" /><span>{payment.players} jogadores</span></div>
                  <button className="text-sm text-violet-600 font-semibold">Ver detalhes</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'methods' && (
        <div className="px-6 py-6 space-y-4">
          <button className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-violet-700 transition-colors"><Plus className="w-5 h-5" />Adicionar cartão</button>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 px-2">Seus cartões</h3>
            {paymentMethods.map((method) => (
              <div key={method.id} className="bg-white rounded-xl p-5 shadow-sm border-2 border-gray-200 relative overflow-hidden">
                {method.isDefault && (
                  <div className="absolute top-3 right-3"><span className="px-2 py-1 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full flex items-center gap-1"><Check className="w-3 h-3" />Padrão</span></div>
                )}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-violet-600 to-violet-700 rounded-xl flex items-center justify-center text-white"><CreditCard className="w-7 h-7" /></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1"><h4 className="font-semibold text-gray-900">{method.brand}</h4><span className="text-gray-500">•••• {method.last4}</span></div>
                    <p className="text-sm text-gray-500">Validade {method.expiry}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                  {!method.isDefault && <button className="flex-1 text-sm text-violet-600 font-semibold py-2">Definir como padrão</button>}
                  <button className="flex-1 text-sm text-red-600 font-semibold py-2">Remover</button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mt-6">
            <p className="text-sm text-violet-900"><strong>Pagamento seguro:</strong> Seus dados de pagamento são criptografados e nunca são armazenados em nossos servidores.</p>
          </div>
        </div>
      )}
    </div>
  );
}
