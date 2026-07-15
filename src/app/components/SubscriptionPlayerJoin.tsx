import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Users, CreditCard, CheckCircle, AlertCircle } from 'lucide-react';
import ComingSoonBanner from './ComingSoonBanner';

export default function SubscriptionPlayerJoin() {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  const groupData = {
    name: 'Racha Fixo - Terça-feira',
    courtName: 'Arena Sports Center',
    dayOfWeek: 'Terça-feira',
    time: '19:00',
    monthlyPrice: 48,
    nextCharge: '01/03/2026',
    currentMembers: 7,
    maxMembers: 10
  };

  const handleConfirmSubscription = () => {
    setIsProcessing(true);
    setTimeout(() => {
      navigate('/subscription-confirmation');
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4">
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>
        <h1 className="text-2xl font-bold mb-2">Confirmar Assinatura</h1>
        <p className="text-purple-100">Entre para o grupo fixo</p>
      </div>
      <ComingSoonBanner />

      <div className="px-6 py-6 space-y-6">
        {/* Group Summary */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{groupData.name}</h2>

          <div className="space-y-3 mb-4">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{groupData.courtName}</div>
                <div className="text-sm text-gray-600">Rua das Palmeiras, 123 - Centro</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{groupData.dayOfWeek}s às {groupData.time}</div>
                <div className="text-sm text-gray-600">Horário fixo toda semana</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{groupData.currentMembers}/{groupData.maxMembers} jogadores</div>
                <div className="text-sm text-gray-600">Grupo quase completo!</div>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-purple-900 font-medium">Mensalidade</span>
              <span className="text-3xl font-bold text-purple-600">R$ {groupData.monthlyPrice}</span>
            </div>
            <div className="text-sm text-purple-700">
              4 jogos garantidos por mês • R$ {groupData.monthlyPrice / 4} por jogo
            </div>
          </div>
        </div>

        {/* Subscription Benefits */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">O que está incluído</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Horário garantido toda semana</strong> no mesmo dia e hora
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Grupo fixo de jogadores</strong> para criar comunidade
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Pode indicar substituto</strong> se não puder comparecer
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Sem surpresas:</strong> valor fixo todo mês
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Cancele quando quiser</strong> para o próximo mês
              </div>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
          <h2 className="font-semibold mb-4">Resumo do pagamento</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-purple-100">Mensalidade</span>
              <span className="text-2xl font-bold">R$ {groupData.monthlyPrice}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-purple-200">Próxima cobrança</span>
              <span className="font-semibold">{groupData.nextCharge}</span>
            </div>
            <div className="border-t border-purple-400 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-lg">Total hoje</span>
                <span className="text-3xl font-bold">R$ {groupData.monthlyPrice}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-600" />
            Método de pagamento
          </h2>

          <div className="space-y-3">
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

          <div className="mt-4 bg-purple-50 rounded-lg p-3 border border-purple-200">
            <div className="flex items-start gap-2 text-sm text-purple-900">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>Seu cartão será cobrado automaticamente todo dia 1º do mês</div>
            </div>
          </div>
        </div>

        {/* Subscription Rules */}
        <div className="bg-amber-50 rounded-2xl p-6 border-2 border-amber-200">
          <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Regras importantes
          </h3>
          <ul className="space-y-2 text-sm text-amber-800">
            <li className="flex gap-2">
              <span>•</span>
              <span><strong>Pagamento mensal antecipado:</strong> cobrado sempre no início do mês</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span><strong>Confirmação semanal obrigatória:</strong> você deve confirmar presença até 24h antes</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span><strong>Sem reembolso por ausência:</strong> mas você pode indicar um substituto</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span><strong>Cancelamento:</strong> válido apenas para o próximo ciclo mensal</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span><strong>Renovação automática:</strong> cancele antes do dia 25 para não renovar</span>
            </li>
          </ul>
        </div>

        {/* Terms */}
        <div className="flex items-start gap-3 bg-white rounded-xl p-4">
          <input type="checkbox" className="mt-1" id="terms" />
          <label htmlFor="terms" className="text-sm text-gray-600">
            Eu concordo com as regras do grupo e aceito a cobrança mensal recorrente de R$ {groupData.monthlyPrice}
          </label>
        </div>

      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 max-w-md mx-auto">
        <button
          onClick={handleConfirmSubscription}
          disabled={isProcessing}
          className={`w-full py-4 rounded-xl font-semibold transition-all ${
            isProcessing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 shadow-lg'
          }`}
        >
          {isProcessing ? 'Processando...' : `Confirmar Assinatura - R$ ${groupData.monthlyPrice}`}
        </button>
      </div>
    </div>
  );
}
