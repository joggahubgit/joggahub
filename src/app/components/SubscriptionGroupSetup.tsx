import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Users, DollarSign, Info, CheckCircle } from 'lucide-react';
import ComingSoonBanner from './ComingSoonBanner';

export default function SubscriptionGroupSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { courtName, courtPrice, selectedTime } = (location.state || {}) as { courtName?: string; courtPrice?: number; selectedTime?: string };

  const [dayOfWeek, setDayOfWeek] = useState('');
  const [startDate, setStartDate] = useState('');
  const [minPlayers, setMinPlayers] = useState(8);
  const [maxPlayers, setMaxPlayers] = useState(10);

  const daysOfWeek = [
    { value: 'monday', label: 'Segundas-feiras' },
    { value: 'tuesday', label: 'Terças-feiras' },
    { value: 'wednesday', label: 'Quartas-feiras' },
    { value: 'thursday', label: 'Quintas-feiras' },
    { value: 'friday', label: 'Sextas-feiras' },
    { value: 'saturday', label: 'Sábados' },
    { value: 'sunday', label: 'Domingos' },
  ];

  const monthlyCourtCost = (courtPrice ?? 0) * 4;
  const monthlyPerPlayer = Math.ceil(monthlyCourtCost / maxPlayers);

  const handleCreateGroup = () => {
    const groupData = {
      courtName,
      courtPrice,
      selectedTime,
      dayOfWeek,
      startDate,
      minPlayers,
      maxPlayers,
      monthlyPerPlayer,
      monthlyCourtCost,
      status: 'awaiting_minimum'
    };

    navigate('/subscription-group-details', { state: groupData });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4">
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>
        <h1 className="text-2xl font-bold mb-2">Criar Grupo Fixo</h1>
        <p className="text-purple-100">Configure seu horário garantido toda semana</p>
      </div>
      <ComingSoonBanner />

      <div className="px-6 py-6 space-y-6">
        {/* Court Info Card */}
        <div className="bg-white rounded-2xl p-6 border-2 border-purple-200 shadow-sm">
          <div className="font-semibold text-gray-900 mb-1">{courtName}</div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-purple-600">R$ {courtPrice}</div>
            <div className="text-sm text-gray-500">por hora</div>
          </div>
        </div>

        {/* Day of Week */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            Dia da semana fixo
          </h2>
          <div className="space-y-2">
            {daysOfWeek.map((day) => (
              <button
                key={day.value}
                onClick={() => setDayOfWeek(day.value)}
                className={`w-full py-3 px-4 rounded-xl font-medium transition-all ${
                  dayOfWeek === day.value
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-600" />
            Horário fixo
          </h2>
          <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
            <div className="text-3xl font-bold text-purple-600 text-center">{selectedTime}</div>
          </div>
        </div>

        {/* Start Date */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Data de início</h2>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-600 focus:outline-none"
          />
        </div>

        {/* Players Configuration */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Configuração de jogadores
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Número mínimo de jogadores
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[6, 8, 10, 12].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      setMinPlayers(num);
                      if (maxPlayers < num) setMaxPlayers(num);
                    }}
                    className={`py-3 rounded-xl font-semibold transition-all ${
                      minPlayers === num
                        ? 'bg-purple-600 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Mínimo necessário para confirmar o jogo
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Número máximo de jogadores
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[8, 10, 12, 14].map((num) => (
                  <button
                    key={num}
                    onClick={() => setMaxPlayers(num)}
                    disabled={num < minPlayers}
                    className={`py-3 rounded-xl font-semibold transition-all ${
                      maxPlayers === num
                        ? 'bg-purple-600 text-white shadow-lg'
                        : num < minPlayers
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Limite de vagas disponíveis
              </p>
            </div>
          </div>
        </div>

        {/* Monthly Pricing */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Valores mensais
          </h2>
          <div className="space-y-4">
            <div>
              <div className="text-purple-200 text-sm mb-1">Custo total da quadra/mês</div>
              <div className="text-2xl font-bold">R$ {monthlyCourtCost}</div>
              <div className="text-xs text-purple-200">4 jogos por mês</div>
            </div>

            <div className="border-t border-purple-400 pt-4">
              <div className="text-purple-200 text-sm mb-1">Mensalidade por jogador</div>
              <div className="text-4xl font-bold mb-1">R$ {monthlyPerPlayer}</div>
              <div className="text-sm text-purple-200">
                R$ {Math.ceil((courtPrice ?? 0) / maxPlayers)} por jogo
              </div>
            </div>

            <div className="bg-purple-500/50 rounded-xl p-3">
              <div className="text-xs text-purple-100">
                💡 Com {maxPlayers} jogadores pagantes, você garante {minPlayers}-{maxPlayers} pessoas toda semana
              </div>
            </div>
          </div>
        </div>

        {/* Subscription Policy */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-purple-200">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-purple-600" />
            Política de assinatura
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Pagamento mensal antecipado:</strong> Cobrado sempre no início do mês
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Sem reembolso por ausência:</strong> Jogador pode indicar substituto
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Cancelamento:</strong> Válido apenas para o próximo ciclo mensal
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Confirmação semanal obrigatória:</strong> Até 24h antes do jogo
              </div>
            </div>
          </div>
        </div>

        {/* Important Info */}
        <div className="bg-amber-50 rounded-2xl p-6 border-2 border-amber-200">
          <h3 className="font-semibold text-amber-900 mb-3">⚠️ Como funciona</h3>
          <ul className="space-y-2 text-sm text-amber-800">
            <li className="flex gap-2">
              <span>1.</span>
              <span>O grupo só é ativado quando atingir o mínimo de {minPlayers} jogadores</span>
            </li>
            <li className="flex gap-2">
              <span>2.</span>
              <span>Jogadores pagam mensalidade e confirmam presença toda semana</span>
            </li>
            <li className="flex gap-2">
              <span>3.</span>
              <span>Vagas não confirmadas ficam disponíveis para jogadores avulsos</span>
            </li>
            <li className="flex gap-2">
              <span>4.</span>
              <span>Grupo é suspenso se ficar abaixo do mínimo por 2 semanas</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 max-w-md mx-auto">
        <button
          onClick={handleCreateGroup}
          disabled={!dayOfWeek || !startDate}
          className={`w-full py-4 rounded-xl font-semibold transition-all ${
            dayOfWeek && startDate
              ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Criar Grupo e Enviar Convites
        </button>
      </div>
    </div>
  );
}
