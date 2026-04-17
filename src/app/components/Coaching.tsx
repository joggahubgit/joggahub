import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, GraduationCap, MapPin, Search } from 'lucide-react';

export default function Coaching() {
  const navigate = useNavigate();

  const coaches = [
    {
      id: 1,
      name: 'Carlos Mendes',
      specialty: 'Técnica e fundamentos',
      experience: '10 anos',
      rating: 4.9,
      reviews: 87,
      price: 'R$ 80',
      location: 'Centro, São Paulo',
      image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80',
      availability: 'Disponível'
    },
    {
      id: 2,
      name: 'Ana Paula Silva',
      specialty: 'Preparação física',
      experience: '8 anos',
      rating: 4.8,
      reviews: 64,
      price: 'R$ 70',
      location: 'Pinheiros, São Paulo',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80',
      availability: 'Disponível'
    },
    {
      id: 3,
      name: 'Roberto Santos',
      specialty: 'Tática e estratégia',
      experience: '15 anos',
      rating: 5.0,
      reviews: 112,
      price: 'R$ 100',
      location: 'Vila Mariana, São Paulo',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
      availability: 'Limitado'
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
          <h1 className="text-xl font-bold">Aulas e Coaching</h1>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-xl p-3 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar treinadores..."
            className="flex-1 outline-none text-gray-700"
          />
        </div>
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-700 text-white px-6 py-8 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <GraduationCap className="w-8 h-8" />
          <div>
            <h2 className="text-xl font-bold">Aprimore seu jogo</h2>
            <p className="text-sm text-purple-100">Treine com os melhores profissionais</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button className="px-4 py-2 bg-violet-600 text-white rounded-full whitespace-nowrap text-sm font-semibold">
            Todos
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full whitespace-nowrap text-sm">
            Técnica
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full whitespace-nowrap text-sm">
            Preparação física
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full whitespace-nowrap text-sm">
            Tática
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full whitespace-nowrap text-sm">
            Goleiro
          </button>
        </div>
      </div>

      {/* Coaches List */}
      <div className="px-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {coaches.length} treinadores disponíveis
        </h2>

        {coaches.map((coach) => (
          <div
            key={coach.id}
            onClick={() => navigate(`/coach-details/${coach.id}`)}
            className="bg-white rounded-xl overflow-hidden border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="flex">
              <img
                src={coach.image}
                alt={coach.name}
                className="w-28 h-28 object-cover"
              />
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 mb-1">{coach.name}</h3>
                    <p className="text-sm text-gray-600 mb-1">{coach.specialty}</p>
                    <div className="flex items-center gap-1 mb-2">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-semibold text-sm">{coach.rating}</span>
                      <span className="text-xs text-gray-500">({coach.reviews})</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-600 mb-3">
                  <div className="flex items-center gap-1">
                    <GraduationCap className="w-4 h-4" />
                    <span>{coach.experience}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>{coach.location}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-violet-600">{coach.price}</div>
                    <div className="text-xs text-gray-500">por aula</div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    coach.availability === 'Disponível'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {coach.availability}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="px-6 mt-8">
        <div className="bg-violet-50 rounded-xl p-4 border border-violet-200">
          <h3 className="font-semibold text-violet-900 mb-2">É treinador?</h3>
          <p className="text-sm text-violet-700 mb-3">
            Cadastre-se como profissional e ofereça suas aulas na plataforma.
          </p>
          <button className="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold">
            Cadastrar como treinador
          </button>
        </div>
      </div>
    </div>
  );
}
