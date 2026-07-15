import { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Share2, Settings, Users, Calendar, MapPin, DollarSign, UserPlus, Copy, Check, X } from 'lucide-react';
import ComingSoonBanner from './ComingSoonBanner';

interface Member {
  id: number;
  name: string;
  avatar: string;
  status: string;
  isPaid: boolean;
  isOrganizer?: boolean;
}

export default function GroupDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const group = location.state as Record<string, unknown> | null;

  const [showShareModal, setShowShareModal] = useState(false);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const [members] = useState<Member[]>([
    { id: 1, name: 'Você', avatar: 'V', status: 'confirmed', isPaid: true, isOrganizer: true },
    { id: 2, name: 'Carlos Silva', avatar: 'CS', status: 'confirmed', isPaid: true },
    { id: 3, name: 'João Pedro', avatar: 'JP', status: 'confirmed', isPaid: true },
    { id: 4, name: 'Rafael Costa', avatar: 'RC', status: 'confirmed', isPaid: true },
    { id: 5, name: 'Lucas Mendes', avatar: 'LM', status: 'confirmed', isPaid: true },
    { id: 6, name: 'Pedro Alves', avatar: 'PA', status: 'confirmed', isPaid: false },
    { id: 7, name: 'Bruno Santos', avatar: 'BS', status: 'confirmed', isPaid: false },
    { id: 8, name: 'Fernando Lima', avatar: 'FL', status: 'pending', isPaid: false },
  ]);

  const groupPlayers = (group?.players as number) ?? 10;
  const vacancies = groupPlayers - members.length;
  const inviteLink = `joggahub.app/join/grupo-${id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenVacancy = (member: Member) => {
    setSelectedMember(member);
    setShowSubstituteModal(true);
  };

  const getStatusBadge = (member: Member) => {
    if (member.isOrganizer) {
      return <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-semibold">Organizador</span>;
    }
    if (member.isPaid) {
      return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
        <Check className="w-3 h-3" /> Pago
      </span>;
    }
    if (member.status === 'pending') {
      return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
        <X className="w-3 h-3" /> Pendente
      </span>;
    }
    return <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-semibold">Não pago</span>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2">
            <ArrowLeft className="w-5 h-5" />
            <span>Voltar</span>
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setShowShareModal(true)}
              className="bg-white/20 backdrop-blur-sm p-2 rounded-lg hover:bg-white/30 transition-colors"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button className="bg-white/20 backdrop-blur-sm p-2 rounded-lg hover:bg-white/30 transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-1">{(group?.name as string) || 'Racha das Quartas'}</h1>
        <p className="text-purple-100">Gerenciar grupo recorrente</p>
      </div>
      <ComingSoonBanner />

      <div className="px-6 py-6 space-y-6">
        {/* Game Info Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{(group?.courtName as string) || 'Arena Sports Center'}</div>
                <div className="text-sm text-gray-600">Rua das Palmeiras, 123 - Centro</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{(group?.dayOfWeek as string) || 'Quarta-feira'}s às {(group?.time as string) || '19:00'}</div>
                <div className="text-sm text-gray-600">Próximo jogo: 18/02/2026</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">R$ {(group?.pricePerPlayer as number) || '12'} por pessoa</div>
                <div className="text-sm text-gray-600">R$ {((group?.pricePerPlayer as number) * 4) || '48'} mensal</div>
              </div>
            </div>
          </div>
        </div>

        {/* This Week Status */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
          <h2 className="font-semibold mb-4">Status desta semana</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-purple-200 text-sm mb-1">Confirmados</div>
              <div className="text-3xl font-bold">{members.filter(m => m.status === 'confirmed').length}</div>
              <div className="text-xs text-purple-200">de {groupPlayers}</div>
            </div>
            <div>
              <div className="text-purple-200 text-sm mb-1">Pagos</div>
              <div className="text-3xl font-bold">{members.filter(m => m.isPaid).length}</div>
              <div className="text-xs text-purple-200">de {members.filter(m => m.status === 'confirmed').length}</div>
            </div>
            <div>
              <div className="text-purple-200 text-sm mb-1">Vagas livres</div>
              <div className="text-3xl font-bold">{vacancies}</div>
              <div className="text-xs text-purple-200">disponíveis</div>
            </div>
          </div>
        </div>

        {/* Members List */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Membros do grupo
            </h2>
            <span className="text-sm text-gray-600">{members.length}/{groupPlayers}</span>
          </div>

          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {member.avatar}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{member.name}</div>
                    {!member.isOrganizer && member.status === 'pending' && (
                      <button
                        onClick={() => handleOpenVacancy(member)}
                        className="text-xs text-purple-600 hover:underline"
                      >
                        Abrir vaga para substituto
                      </button>
                    )}
                  </div>
                </div>
                {getStatusBadge(member)}
              </div>
            ))}

            {/* Empty Slots */}
            {[...Array(vacancies)].map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center justify-between p-3 border-2 border-dashed border-gray-300 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="text-gray-500">Vaga disponível</div>
                </div>
                <button
                  onClick={() => setShowShareModal(true)}
                  className="text-purple-600 text-sm font-semibold hover:underline"
                >
                  Convidar
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowShareModal(true)}
            className="bg-purple-600 text-white py-4 rounded-xl font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
          >
            <Share2 className="w-5 h-5" />
            Compartilhar
          </button>
          <button className="bg-purple-100 text-purple-700 py-4 rounded-xl font-semibold hover:bg-purple-200 transition-colors">
            Enviar lembrete
          </button>
        </div>

        {/* Game History */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Histórico de jogos</h2>
          <div className="space-y-3">
            {[
              { date: '11/02/2026', confirmed: 10, paid: 10, status: 'completed' },
              { date: '04/02/2026', confirmed: 10, paid: 10, status: 'completed' },
              { date: '28/01/2026', confirmed: 9, paid: 9, status: 'completed' },
            ].map((game, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">{game.date}</div>
                  <div className="text-sm text-gray-600">{game.confirmed} confirmados</div>
                </div>
                <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
                  Realizado
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6" />

            <h3 className="font-bold text-gray-900 text-lg mb-4">Convidar jogadores</h3>

            <div className="bg-purple-50 rounded-xl p-4 mb-4 border-2 border-purple-200">
              <div className="text-sm text-purple-900 font-mono break-all mb-3">{inviteLink}</div>
              <button
                onClick={handleCopyLink}
                className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Link copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copiar link do grupo
                  </>
                )}
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <button className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors">
                Compartilhar no WhatsApp
              </button>
              <button
                onClick={() => navigate('/community')}
                className="w-full bg-purple-100 text-purple-700 py-3 rounded-lg font-semibold hover:bg-purple-200 transition-colors"
              >
                Publicar no Feed do JoggaHub
              </button>
            </div>

            <button
              onClick={() => setShowShareModal(false)}
              className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Substitute Modal */}
      {showSubstituteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Abrir vaga para substituto</h3>

            <p className="text-gray-600 mb-6">
              {selectedMember?.name} não confirmou presença. Deseja abrir a vaga para um substituto?
            </p>

            <div className="bg-amber-50 rounded-lg p-4 mb-6 border border-amber-200">
              <p className="text-sm text-amber-800">
                A vaga ficará disponível publicamente no app. O primeiro a confirmar entrará no jogo.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSubstituteModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={() => setShowSubstituteModal(false)}
                className="flex-1 bg-purple-600 text-white py-3 rounded-xl font-semibold"
              >
                Abrir vaga
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
