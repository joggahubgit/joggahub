import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Users, DollarSign, Info } from 'lucide-react';

export default function RecurringBookingSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { courtName, courtPrice, selectedTime } = (location.state || {}) as { courtName?: string; courtPrice?: number; selectedTime?: string };

  const [dayOfWeek, setDayOfWeek] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [numberOfPlayers, setNumberOfPlayers] = useState(10);

  const daysOfWeek = [
    { value: 'monday', label: 'Segunda-feira' },
    { value: 'tuesday', label: 'Terça-feira' },
    { value: 'wednesday', label: 'Quarta-feira' },
    { value: 'thursday', label: 'Quinta-feira' },
    { value: 'friday', label: 'Sexta-feira' },
    { value: 'saturday', label: 'Sábado' },
    { value: 'sunday', label: 'Domingo' },
  ];

  const pricePerPlayer = Math.ceil((courtPrice ?? 0) / numberOfPlayers);
  const weeks = startDate && endDate ?
    Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) : 0;

  const handleContinue = () => {
    navigate('/recurring-group-creation', {
      state: {
        courtName,
        courtPrice,
        selectedTime,
        dayOfWeek,
        startDate,
        endDate,
        numberOfPlayers,
        pricePerPlayer,
        weeks
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4">
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>
        <h1 className="text-2xl font-bold mb-2">Reserva Recorrente</h1>
        <p className="text-purple-100">Configure seu horário fixo semanal</p>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Court Info Card */}
        <div className="bg-white rounded-2xl p-4 border-2 border-purple-200 shadow-sm">
          <div className="font-semibold text-gray-900 mb-1">{courtName}</div>
          <div className="text-2xl font-bold text-purple-600">R$ {courtPrice}</div>
          <div className="text-sm text-gray-500">por hora</div>
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

        {/* Date Range */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Período</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data de início
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data de término
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-600 focus:outline-none"
              />
            </div>
            {weeks > 0 && (
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <span className="text-purple-900 font-semibold">{weeks} semanas de jogo</span>
              </div>
            )}
          </div>
        </div>

        {/* Number of Players */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Número de jogadores
          </h2>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[8, 10, 12, 14].map((num) => (
              <button
                key={num}
                onClick={() => setNumberOfPlayers(num)}
                className={`py-3 rounded-xl font-semibold transition-all ${
                  numberOfPlayers === num
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing Summary */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Resumo de valores
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-purple-100">Valor total da quadra</span>
              <span className="text-2xl font-bold">R$ {courtPrice}</span>
            </div>
            <div className="border-t border-purple-400 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-purple-100">Valor por jogador/semana</span>
                <span className="text-3xl font-bold">R$ {pricePerPlayer}</span>
              </div>
            </div>
            {weeks > 0 && (
              <div className="bg-purple-500/50 rounded-lg p-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Total por jogador ({weeks} semanas)</span>
                  <span className="font-bold">R$ {pricePerPlayer * weeks}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cancellation Policy */}
        <div className="bg-amber-50 rounded-2xl p-6 border-2 border-amber-200">
          <h2 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <Info className="w-5 h-5" />
            Política de cancelamento
          </h2>
          <ul className="space-y-2 text-sm text-amber-800">
            <li className="flex gap-2">
              <span>•</span>
              <span>Cancelamento com 48h de antecedência: reembolso integral</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Cancelamento com 24h de antecedência: 50% de reembolso</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Menos de 24h: sem reembolso</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Você pode indicar substituto sem custo adicional</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 max-w-md mx-auto">
        <button
          onClick={handleContinue}
          disabled={!dayOfWeek || !startDate || !endDate}
          className={`w-full py-4 rounded-xl font-semibold transition-all ${
            dayOfWeek && startDate && endDate
              ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Criar grupo recorrente
        </button>
      </div>
    </div>
  );
}
