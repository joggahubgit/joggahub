import { useNavigate } from 'react-router-dom';
import { CheckCircle, Calendar, Users, DollarSign, Share2 } from 'lucide-react';
import ComingSoonBanner from './ComingSoonBanner';

export default function SubscriptionConfirmation() {
  const navigate = useNavigate();

  const groupData = {
    name: 'Racha Fixo - Terça-feira',
    dayOfWeek: 'Terça-feira',
    time: '19:00',
    monthlyPrice: 48,
    nextGame: '18/02/2026'
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Success Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-12 text-center">
        <div className="bg-white/20 backdrop-blur-sm w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Assinatura confirmada!</h1>
        <p className="text-green-100">Você agora faz parte do grupo fixo</p>
      </div>
      <ComingSoonBanner />

      <div className="px-6 py-6 space-y-6">
        {/* Subscription Details */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Detalhes da sua assinatura</h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <div className="bg-purple-600 p-2 rounded-lg">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Horário fixo</div>
                <div className="font-semibold text-gray-900">{groupData.dayOfWeek}s às {groupData.time}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <div className="bg-purple-600 p-2 rounded-lg">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Mensalidade</div>
                <div className="font-semibold text-gray-900">R$ {groupData.monthlyPrice}/mês</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border-2 border-green-200">
              <div className="bg-green-600 p-2 rounded-lg">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Próximo jogo</div>
                <div className="font-semibold text-gray-900">{groupData.nextGame}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-violet-50 rounded-2xl p-6 border-2 border-violet-200">
          <h3 className="font-semibold text-violet-900 mb-3">📋 Próximos passos</h3>
          <ul className="space-y-2 text-sm text-violet-800">
            <li className="flex gap-2">
              <span>1.</span>
              <span>Toda semana você receberá lembrete para confirmar presença</span>
            </li>
            <li className="flex gap-2">
              <span>2.</span>
              <span>Confirme até 24h antes do jogo</span>
            </li>
            <li className="flex gap-2">
              <span>3.</span>
              <span>Se não puder ir, indique um substituto</span>
            </li>
            <li className="flex gap-2">
              <span>4.</span>
              <span>Sua mensalidade renova automaticamente todo dia 1º</span>
            </li>
          </ul>
        </div>

        {/* Share Group */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Convide amigos
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Ajude o grupo a crescer compartilhando com seus amigos
          </p>
          <button className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2">
            <Share2 className="w-5 h-5" />
            Compartilhar grupo
          </button>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => navigate('/subscription-group-details')}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-4 rounded-xl font-semibold hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg"
          >
            Ver detalhes do grupo
          </button>
          <button
            onClick={() => navigate('/home')}
            className="w-full bg-white border-2 border-gray-200 text-gray-700 py-4 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
          >
            Voltar ao início
          </button>
        </div>

        {/* Success Tips */}
        <div className="bg-green-50 rounded-2xl p-6 border-2 border-green-200">
          <h3 className="font-semibold text-green-900 mb-3">💡 Dicas para aproveitar</h3>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex gap-2">
              <span>•</span>
              <span>Conheça os outros membros do grupo no chat</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Chegue 10 minutos antes para o aquecimento</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Traga água e toalha</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Não esqueça de confirmar presença toda semana</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
