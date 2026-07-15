import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Calendar, Users, DollarSign, Search } from 'lucide-react';
import ComingSoonBanner from './ComingSoonBanner';

export default function Competitions() {
  const navigate = useNavigate();

  const competitions = [
    {
      id: 1,
      name: 'Copa JoggaHub 2026',
      format: 'Eliminatórias',
      startDate: '15 de março',
      endDate: '30 de abril',
      teams: 16,
      maxTeams: 16,
      prize: 'R$ 2.000',
      entryFee: 'R$ 400',
      level: 'Intermediário',
      status: 'Inscrições abertas',
      image: 'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=400&q=80'
    },
    {
      id: 2,
      name: 'Torneio Relâmpago',
      format: 'Pontos corridos',
      startDate: '10 de fevereiro',
      endDate: '10 de fevereiro',
      teams: 6,
      maxTeams: 8,
      prize: 'R$ 500',
      entryFee: 'R$ 100',
      level: 'Todos os níveis',
      status: 'Últimas vagas',
      image: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=400&q=80'
    },
    {
      id: 3,
      name: 'Liga Futebol Society',
      format: 'Liga (10 rodadas)',
      startDate: '1 de março',
      endDate: '30 de maio',
      teams: 10,
      maxTeams: 12,
      prize: 'R$ 3.500',
      entryFee: 'R$ 600',
      level: 'Avançado',
      status: 'Inscrições abertas',
      image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&q=80'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <div className="bg-violet-600 text-white px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => navigate('/home')}>
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold">Competições</h1>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-xl p-3 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar competições..."
            className="flex-1 outline-none text-gray-700"
          />
        </div>
      </div>
      <ComingSoonBanner />

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-gray-900 px-6 py-8 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <Trophy className="w-8 h-8" />
          <div>
            <h2 className="text-xl font-bold">Mostre seu talento</h2>
            <p className="text-sm">Participe de campeonatos e ganhe prêmios</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button className="px-4 py-2 bg-violet-600 text-white rounded-full whitespace-nowrap text-sm font-semibold">
            Todas
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full whitespace-nowrap text-sm">
            Inscrições abertas
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full whitespace-nowrap text-sm">
            Em andamento
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full whitespace-nowrap text-sm">
            Finalizadas
          </button>
        </div>
      </div>

      {/* Competitions List */}
      <div className="px-6 space-y-4">
        {competitions.map((comp) => (
          <div
            key={comp.id}
            onClick={() => navigate(`/competition-details/${comp.id}`)}
            className="bg-white rounded-xl overflow-hidden border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="relative">
              <img
                src={comp.image}
                alt={comp.name}
                className="w-full h-40 object-cover"
              />
              <div className="absolute top-3 right-3">
                {comp.status === 'Inscrições abertas' && (
                  <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                    {comp.status}
                  </span>
                )}
                {comp.status === 'Últimas vagas' && (
                  <span className="bg-yellow-500 text-gray-900 px-3 py-1 rounded-full text-sm font-semibold">
                    {comp.status}
                  </span>
                )}
              </div>
              <div className="absolute bottom-3 left-3">
                <span className="bg-black/70 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm">
                  {comp.level}
                </span>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-lg mb-1">{comp.name}</h3>
                  <p className="text-sm text-gray-600">{comp.format}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-yellow-600 mb-1">
                    <Trophy className="w-5 h-5" />
                    <span className="font-bold">{comp.prize}</span>
                  </div>
                  <div className="text-xs text-gray-500">Premiação</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <div>
                    <div className="font-medium text-gray-900">{comp.startDate}</div>
                    <div className="text-xs">Início</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Users className="w-4 h-4" />
                  <div>
                    <div className="font-medium text-gray-900">{comp.teams}/{comp.maxTeams} times</div>
                    <div className="text-xs">Inscritos</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <div className="flex items-center gap-1 text-violet-600">
                  <DollarSign className="w-4 h-4" />
                  <span className="font-semibold">{comp.entryFee}</span>
                  <span className="text-sm text-gray-500">por time</span>
                </div>
                <button className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors">
                  Ver detalhes
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
