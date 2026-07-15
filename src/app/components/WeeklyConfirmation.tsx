import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Clock, Users, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import ComingSoonBanner from './ComingSoonBanner';

export default function WeeklyConfirmation() {
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const [showSubstituteForm, setShowSubstituteForm] = useState(false);

  const gameData = {
    groupName: 'Racha Fixo - Terça-feira',
    courtName: 'Arena Sports Center',
    date: 'Terça-feira, 18 de Fevereiro',
    time: '19:00',
    address: 'Rua das Palmeiras, 123 - Centro',
    deadline: '17/02/2026 às 19:00',
    hoursUntilDeadline: 20
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setTimeout(() => {
      navigate('/subscription-group-details');
    }, 2000);
  };

  const handleCancel = () => {
    setConfirmed(false);
    setShowSubstituteForm(true);
  };

  if (confirmed === true) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Presença confirmada!</h1>
          <p className="text-gray-600 mb-6">Nos vemos na {gameData.date} às {gameData.time}</p>
          <button
            onClick={() => navigate('/subscription-group-details')}
            className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors"
          >
            Ver detalhes do grupo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4">
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>
        <h1 className="text-2xl font-bold mb-2">Confirme sua presença</h1>
        <p className="text-purple-100">Responda até {gameData.deadline}</p>
      </div>
      <ComingSoonBanner />

      <div className="px-6 py-6 space-y-6">
        {/* Urgency Banner */}
        {gameData.hoursUntilDeadline <= 24 && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2 text-yellow-700">
              <AlertCircle className="w-6 h-6" />
              <span className="font-bold text-lg">Confirmação urgente</span>
            </div>
            <p className="text-sm text-yellow-800">
              Faltam apenas {gameData.hoursUntilDeadline} horas! Se não confirmar, sua vaga será liberada para outros jogadores.
            </p>
          </div>
        )}

        {/* Game Details */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{gameData.groupName}</h2>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{gameData.courtName}</div>
                <div className="text-sm text-gray-600">{gameData.address}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{gameData.date}</div>
                <div className="text-sm text-gray-600">Jogo da semana</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{gameData.time}</div>
                <div className="text-sm text-gray-600">Horário de início</div>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Options */}
        {!showSubstituteForm && (
          <div className="space-y-4">
            <button
              onClick={handleConfirm}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-6 rounded-2xl font-bold text-lg hover:from-green-700 hover:to-green-800 transition-all shadow-lg flex items-center justify-center gap-3"
            >
              <CheckCircle className="w-6 h-6" />
              Confirmar presença
            </button>

            <button
              onClick={handleCancel}
              className="w-full bg-white border-2 border-red-300 text-red-600 py-6 rounded-2xl font-bold text-lg hover:bg-red-50 transition-all flex items-center justify-center gap-3"
            >
              <XCircle className="w-6 h-6" />
              Não poderei ir
            </button>
          </div>
        )}

        {/* Substitute Form */}
        {showSubstituteForm && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Indicar substituto</h2>
            <p className="text-sm text-gray-600 mb-4">
              Você não perderá sua mensalidade se indicar um substituto aprovado pelo organizador.
            </p>

            <div className="space-y-3 mb-4">
              <input
                type="text"
                placeholder="Nome do substituto"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-600 focus:outline-none"
              />
              <input
                type="tel"
                placeholder="Telefone do substituto"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-600 focus:outline-none"
              />
              <textarea
                placeholder="Mensagem opcional para o organizador"
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-600 focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSubstituteForm(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={() => navigate('/subscription-group-details')}
                className="flex-1 bg-purple-600 text-white py-3 rounded-xl font-semibold"
              >
                Enviar solicitação
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => navigate('/subscription-group-details')}
                className="w-full text-red-600 py-3 rounded-xl font-semibold hover:bg-red-50 transition-colors"
              >
                Liberar vaga sem substituto
              </button>
              <p className="text-xs text-gray-500 text-center mt-2">
                Sua vaga ficará disponível para jogadores avulsos
              </p>
            </div>
          </div>
        )}

        {/* Current Status */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Status do jogo
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-sm text-gray-700">Confirmados</span>
              <span className="font-bold text-green-600">7 jogadores</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
              <span className="text-sm text-gray-700">Aguardando confirmação</span>
              <span className="font-bold text-yellow-600">3 jogadores</span>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-violet-50 rounded-2xl p-6 border-2 border-violet-200">
          <h3 className="font-semibold text-violet-900 mb-3">💡 Lembre-se</h3>
          <ul className="space-y-2 text-sm text-violet-800">
            <li className="flex gap-2">
              <span>•</span>
              <span>Você já pagou a mensalidade deste mês</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Não há reembolso por ausência</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Indicar substituto é a melhor opção se não puder ir</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Sua vaga será liberada se não confirmar até {gameData.deadline}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
