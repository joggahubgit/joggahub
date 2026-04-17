import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Share2, Users, Calendar, MapPin, DollarSign, CheckCircle, AlertCircle, XCircle, Copy, Check } from 'lucide-react';

interface Member {
  id: number;
  name: string;
  avatar: string;
  subscriptionStatus: string;
  isOrganizer?: boolean;
}

export default function SubscriptionGroupDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const groupData = (location.state || {}) as Record<string, unknown>;

  const [copied, setCopied] = useState(false);
  const [groupStatus] = useState<'awaiting_minimum' | 'active' | 'suspended'>('awaiting_minimum');

  const [members] = useState<Member[]>([
    { id: 1, name: 'Você (Organizador)', avatar: 'V', subscriptionStatus: 'active', isOrganizer: true },
    { id: 2, name: 'Carlos Silva', avatar: 'CS', subscriptionStatus: 'active' },
    { id: 3, name: 'João Pedro', avatar: 'JP', subscriptionStatus: 'active' },
    { id: 4, name: 'Rafael Costa', avatar: 'RC', subscriptionStatus: 'pending' },
    { id: 5, name: 'Lucas Mendes', avatar: 'LM', subscriptionStatus: 'active' },
  ]);

  const activeMembers = members.filter(m => m.subscriptionStatus === 'active').length;
  const maxPlayers = (groupData.maxPlayers as number) || 10;
  const minPlayers = (groupData.minPlayers as number) || 8;
  const progress = (activeMembers / maxPlayers) * 100;

  const inviteLink = `joggahub.app/join/sub-${Math.random().toString(36).substr(2, 9)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusConfig = () => {
    switch (groupStatus) {
      case 'active':
        return {
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          textColor: 'text-green-700',
          icon: <CheckCircle className="w-5 h-5" />,
          label: 'Ativo',
          description: 'Grupo confirmado e funcionando'
        };
      case 'suspended':
        return {
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          textColor: 'text-red-700',
          icon: <XCircle className="w-5 h-5" />,
          label: 'Suspenso',
          description: 'Abaixo do mínimo de jogadores'
        };
      default:
        return {
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          textColor: 'text-yellow-700',
          icon: <AlertCircle className="w-5 h-5" />,
          label: 'Aguardando mínimo',
          description: `Faltam ${minPlayers - activeMembers} jogadores para ativar`
        };
    }
  };

  const statusConfig = getStatusConfig();

  const dayLabels: Record<string, string> = {
    monday: 'Segunda-feira',
    tuesday: 'Terça-feira',
    wednesday: 'Quarta-feira',
    thursday: 'Quinta-feira',
    friday: 'Sexta-feira',
    saturday: 'Sábado',
    sunday: 'Domingo',
  };

  const getSubscriptionBadge = (member: Member) => {
    if (member.isOrganizer) {
      return <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-semibold">Organizador</span>;
    }
    if (member.subscriptionStatus === 'active') {
      return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
        <CheckCircle className="w-3 h-3" /> Ativo
      </span>;
    }
    if (member.subscriptionStatus === 'pending') {
      return <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> Pendente
      </span>;
    }
    return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
      <XCircle className="w-3 h-3" /> Cancelado
    </span>;
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
          <button
            onClick={() => {}}
            className="bg-white/20 backdrop-blur-sm p-2 rounded-lg hover:bg-white/30 transition-colors"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
        <h1 className="text-2xl font-bold mb-1">Racha Fixo - {dayLabels[groupData.dayOfWeek as string] || 'Terça-feira'}</h1>
        <p className="text-purple-100">Grupo de assinatura mensal</p>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Status Banner */}
        <div className={`${statusConfig.bgColor} border-2 ${statusConfig.borderColor} rounded-2xl p-6`}>
          <div className={`flex items-center gap-3 mb-3 ${statusConfig.textColor}`}>
            {statusConfig.icon}
            <span className="font-bold text-lg">{statusConfig.label}</span>
          </div>
          <p className={`text-sm ${statusConfig.textColor}`}>{statusConfig.description}</p>
        </div>

        {/* Progress Bar */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Progresso do grupo</h2>
            <span className="text-sm font-semibold text-purple-600">
              {activeMembers} de {maxPlayers} jogadores
            </span>
          </div>

          <div className="relative">
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-purple-700 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div
              className="absolute top-0 h-3 w-1 bg-yellow-500"
              style={{ left: `${(minPlayers / maxPlayers) * 100}%` }}
              title="Mínimo necessário"
            />
          </div>

          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <span>Mínimo: {minPlayers}</span>
            <span>Máximo: {maxPlayers}</span>
          </div>
        </div>

        {/* Group Info */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Informações do grupo</h2>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{groupData.courtName as string}</div>
                <div className="text-sm text-gray-600">Rua das Palmeiras, 123 - Centro</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">
                  {dayLabels[groupData.dayOfWeek as string] || 'Terça-feira'}s às {(groupData.selectedTime as string) || '19:00'}
                </div>
                <div className="text-sm text-gray-600">Horário fixo semanal garantido</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">R$ {(groupData.monthlyPerPlayer as number) || '48'} por mês</div>
                <div className="text-sm text-gray-600">Pagamento antecipado todo início de mês</div>
              </div>
            </div>
          </div>
        </div>

        {/* Members List */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Membros assinantes
            </h2>
            <span className="text-sm text-gray-600">{members.length}/{maxPlayers}</span>
          </div>

          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {member.avatar}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{member.name}</div>
                    <div className="text-xs text-gray-500">Desde {new Date().toLocaleDateString('pt-BR')}</div>
                  </div>
                </div>
                {getSubscriptionBadge(member)}
              </div>
            ))}

            {/* Empty Slots */}
            {[...Array(maxPlayers - members.length)].map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center justify-between p-3 border-2 border-dashed border-gray-300 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="text-gray-500">Vaga disponível</div>
                </div>
                <button className="text-purple-600 text-sm font-semibold hover:underline">
                  Convidar
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Invite Link */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Link de convite</h2>
          <div className="bg-purple-50 rounded-xl p-4 mb-3 border-2 border-purple-200">
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
          <button className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors">
            Compartilhar no WhatsApp
          </button>
        </div>

        {/* Subscription Rules */}
        <div className="bg-violet-50 rounded-2xl p-6 border-2 border-violet-200">
          <h3 className="font-semibold text-violet-900 mb-3">📋 Regras da assinatura</h3>
          <ul className="space-y-2 text-sm text-violet-800">
            <li className="flex gap-2">
              <span>•</span>
              <span>Pagamento mensal antecipado (todo dia 1º)</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Confirmação de presença obrigatória até 24h antes</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Sem reembolso por ausência (pode indicar substituto)</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Cancelamento válido apenas para o próximo mês</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Grupo suspenso se ficar abaixo de {minPlayers} jogadores por 2 semanas</span>
            </li>
          </ul>
        </div>

        {/* Next Games */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Próximos jogos</h2>
          <div className="space-y-3">
            {[
              { date: '18/02/2026', status: 'awaiting_confirmation' },
              { date: '25/02/2026', status: 'scheduled' },
              { date: '04/03/2026', status: 'scheduled' },
            ].map((game, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">{dayLabels[groupData.dayOfWeek as string]} - {game.date}</div>
                  <div className="text-sm text-gray-600">{groupData.selectedTime as string}</div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  game.status === 'awaiting_confirmation'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {game.status === 'awaiting_confirmation' ? 'Aguardando confirmações' : 'Agendado'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
