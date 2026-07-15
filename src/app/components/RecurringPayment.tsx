import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Users, CreditCard, Zap } from 'lucide-react';
import ComingSoonBanner from './ComingSoonBanner';

export default function RecurringPayment() {
  const navigate = useNavigate();
  const location = useLocation();
  const groupData = (location.state || {}) as Record<string, unknown>;

  const [paymentType, setPaymentType] = useState<'per_game' | 'monthly'>('monthly');
  const [paymentMethod, setPaymentMethod] = useState('credit_card');

  const pricePerPlayer = (groupData.pricePerPlayer as number) ?? 0;
  const monthlyPrice = pricePerPlayer * 4;

  const dayLabels: Record<string, string> = {
    monday: 'Segundas-feiras',
    tuesday: 'Terças-feiras',
    wednesday: 'Quartas-feiras',
    thursday: 'Quintas-feiras',
    friday: 'Sextas-feiras',
    saturday: 'Sábados',
    sunday: 'Domingos',
  };

  const handleConfirmPayment = () => {
    setTimeout(() => {
      navigate('/my-groups');
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4">
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>
        <h1 className="text-2xl font-bold mb-2">Pagamento</h1>
        <p className="text-purple-100">Confirme sua participação no grupo</p>
      </div>
      <ComingSoonBanner />

      <div className="px-6 py-6 space-y-6">
        {/* Group Info */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{groupData.name as string}</h2>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{groupData.courtName as string}</div>
                <div className="text-sm text-gray-600">Rua das Palmeiras, 123</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{dayLabels[groupData.dayOfWeek as string]}</div>
                <div className="text-sm text-gray-600">{groupData.selectedTime as string} - Grupo fixo</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{groupData.numberOfPlayers as number} jogadores</div>
                <div className="text-sm text-gray-600">Grupo recorrente por {groupData.weeks as number} semanas</div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Type Selection */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Escolha seu plano</h2>

          <div className="space-y-3">
            {/* Per Game */}
            <button
              onClick={() => setPaymentType('per_game')}
              className={`w-full p-4 rounded-xl border-2 transition-all ${
                paymentType === 'per_game'
                  ? 'border-purple-600 bg-purple-50'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      paymentType === 'per_game' ? 'border-purple-600' : 'border-gray-300'
                    }`}>
                      {paymentType === 'per_game' && (
                        <div className="w-3 h-3 rounded-full bg-purple-600" />
                      )}
                    </div>
                    <span className="font-semibold text-gray-900">Pagar por jogo</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-7">
                    Pague apenas quando confirmar presença
                  </p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-2xl font-bold text-purple-600">R$ {pricePerPlayer}</div>
                  <div className="text-xs text-gray-500">por jogo</div>
                </div>
              </div>
            </button>

            {/* Monthly Plan */}
            <button
              onClick={() => setPaymentType('monthly')}
              className={`w-full p-4 rounded-xl border-2 transition-all relative overflow-hidden ${
                paymentType === 'monthly'
                  ? 'border-purple-600 bg-purple-50'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
            >
              <div className="absolute top-2 right-2">
                <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-semibold flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Economize 15%
                </span>
              </div>
              <div className="flex items-start justify-between">
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      paymentType === 'monthly' ? 'border-purple-600' : 'border-gray-300'
                    }`}>
                      {paymentType === 'monthly' && (
                        <div className="w-3 h-3 rounded-full bg-purple-600" />
                      )}
                    </div>
                    <span className="font-semibold text-gray-900">Plano Mensal</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-7">
                    Garanta sua vaga todo mês (4 jogos)
                  </p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-xs text-gray-400 line-through">R$ {pricePerPlayer * 4}</div>
                  <div className="text-2xl font-bold text-purple-600">R$ {Math.ceil(monthlyPrice * 0.85)}</div>
                  <div className="text-xs text-gray-500">por mês</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
          <h2 className="font-semibold mb-4">Resumo do pagamento</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-purple-100">
                {paymentType === 'monthly' ? 'Plano mensal (4 jogos)' : 'Jogo único'}
              </span>
              <span className="font-semibold">
                R$ {paymentType === 'monthly' ? Math.ceil(monthlyPrice * 0.85) : pricePerPlayer}
              </span>
            </div>
            {paymentType === 'monthly' && (
              <div className="flex justify-between text-sm">
                <span className="text-purple-200">Economia</span>
                <span className="text-green-300 font-semibold">- R$ {Math.ceil(monthlyPrice * 0.15)}</span>
              </div>
            )}
            <div className="border-t border-purple-400 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-lg">Total a pagar</span>
                <span className="text-3xl font-bold">
                  R$ {paymentType === 'monthly' ? Math.ceil(monthlyPrice * 0.85) : pricePerPlayer}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Método de pagamento</h2>

          <button
            onClick={() => setPaymentMethod('credit_card')}
            className={`w-full p-4 rounded-xl border-2 mb-3 transition-all ${
              paymentMethod === 'credit_card'
                ? 'border-purple-600 bg-purple-50'
                : 'border-gray-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-purple-600" />
              <div className="flex-1 text-left">
                <div className="font-semibold text-gray-900">Cartão de crédito</div>
                <div className="text-sm text-gray-600">Débito ou crédito</div>
              </div>
            </div>
          </button>

          {paymentMethod === 'credit_card' && (
            <div className="space-y-3 mt-4">
              <input
                type="text"
                placeholder="Número do cartão"
                className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-600 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Validade (MM/AA)"
                  className="px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-600 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="CVV"
                  className="px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-600 focus:outline-none"
                />
              </div>
              <input
                type="text"
                placeholder="Nome no cartão"
                className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-600 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Important Info */}
        <div className="bg-amber-50 rounded-2xl p-6 border-2 border-amber-200">
          <h3 className="font-semibold text-amber-900 mb-3">⚠️ Importante</h3>
          <ul className="space-y-2 text-sm text-amber-800">
            <li className="flex gap-2">
              <span>•</span>
              <span>{paymentType === 'monthly'
                ? 'O plano mensal renova automaticamente. Cancele quando quiser.'
                : 'Você será cobrado toda vez que confirmar presença no jogo.'}
              </span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Cancele com 48h de antecedência para reembolso integral</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Você pode indicar um substituto sem custo adicional</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 max-w-md mx-auto">
        <button
          onClick={handleConfirmPayment}
          className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-4 rounded-xl font-semibold hover:from-purple-700 hover:to-purple-800 shadow-lg transition-all"
        >
          Confirmar pagamento - R$ {paymentType === 'monthly' ? Math.ceil(monthlyPrice * 0.85) : pricePerPlayer}
        </button>
      </div>
    </div>
  );
}
